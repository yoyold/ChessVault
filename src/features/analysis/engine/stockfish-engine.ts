import type { AnalysisLine, PositionAnalysis } from "@/core/analysis/types";
import { isSearchComplete, mergeLine, parseInfoLine } from "@/core/analysis/uci";
import { asset } from "@/lib/paths";
import {
  AnalysisAbortedError,
  type AnalysisRequest,
  type EngineService,
} from "./engine-service";

/**
 * Path to the engine worker.
 *
 * Built by hand rather than by the bundler, because the Stockfish loader is a
 * pre-built worker script that fetches its own `.wasm` sibling at runtime.
 * It therefore goes through `asset()`, or it would resolve against the domain
 * root and 404 under a project-site base path. See ADR 0001.
 */
const ENGINE_URL = asset("/engine/stockfish-18-lite-single.js");

/**
 * How long to wait for a stopped search to report `bestmove` before giving up.
 *
 * Only reached if the engine has died; without a bound, a dead engine would
 * leave the interface waiting forever rather than reporting a failure.
 */
const STOP_TIMEOUT_MS = 5_000;

/** A request waiting for its turn at the engine. */
interface QueuedJob {
  request: AnalysisRequest;
  onProgress?: (analysis: PositionAnalysis) => void;
  resolve: (analysis: PositionAnalysis) => void;
  reject: (error: Error) => void;
}

/** The search currently running, and the results accumulated for it. */
interface ActiveSearch {
  resolve: (analysis: PositionAnalysis) => void;
  reject: (error: Error) => void;
  onProgress?: (analysis: PositionAnalysis) => void;
  sideToMove: "w" | "b";
  lines: AnalysisLine[];
  depth: number;
  /** Set when a newer request has superseded this one. */
  aborted: boolean;
}

/**
 * Drives Stockfish, compiled to WebAssembly, in a Web Worker.
 *
 * The engine speaks UCI over `postMessage`, one text line per message. Parsing
 * lives in `core/analysis/uci`; this class owns the protocol handshake, the
 * request lifecycle and worker ownership.
 *
 * ## Why requests are pumped through a single loop
 *
 * UCI is stateful: `position` and `setoption` may only be sent while the engine
 * is idle, and `stop` does not make it idle immediately — the search unwinds
 * and reports `bestmove`, and only then is the engine ready. Sending the next
 * position early crashes the WebAssembly build with `RuntimeError: unreachable`.
 *
 * Waiting for idle inside each request is not enough. Several requests can be
 * waiting at once — stepping through a game issues one per move — and the
 * arriving `bestmove` releases all of them, so two would send `position`
 * together and crash exactly as before.
 *
 * All commands are therefore sent from one loop, {@link pump}, which is the
 * only writer and runs one search at a time. A request arriving while another
 * is queued replaces it rather than joining a line: when a user skims through
 * twenty moves, only the position they stop on is worth searching.
 */
export class StockfishEngine implements EngineService {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;

  /** The next request to run. At most one; a newer request supersedes it. */
  private queued: QueuedJob | null = null;

  /** The search in progress, if any. */
  private active: ActiveSearch | null = null;

  /** Whether the engine is mid-search and so cannot accept a new position. */
  private searchActive = false;

  /** Guards the pump loop, so exactly one writer sends commands. */
  private pumping = false;

  private idleWaiters: (() => void)[] = [];

  /**
   * MultiPV currently applied.
   *
   * Tracked so it is only re-sent when it changes: setting an option makes the
   * engine discard its hash table, throwing away work that speeds up analysis
   * of a related position.
   */
  private appliedMultiPv: number | null = null;

  private disposed = false;

  analyse(
    request: AnalysisRequest,
    onProgress?: (analysis: PositionAnalysis) => void,
  ): Promise<PositionAnalysis> {
    return new Promise<PositionAnalysis>((resolve, reject) => {
      if (this.disposed) {
        reject(new Error("Engine is disposed"));
        return;
      }

      // Only the newest queued request is worth running; the one it replaces
      // was never started, so nothing is wasted by dropping it.
      this.queued?.reject(new AnalysisAbortedError());
      this.queued = { request, onProgress, resolve, reject };

      // Ask the running search to wind down so the queue can move on. The
      // command is safe here because `stop` is valid at any time; `position` is
      // not, and is only ever sent by the pump.
      if (this.active) this.active.aborted = true;
      if (this.searchActive) this.worker?.postMessage("stop");

      void this.pump();
    });
  }

  /**
   * The single writer: runs queued requests one at a time.
   *
   * Re-entrant calls return immediately, so however many requests arrive, only
   * one loop is ever sending commands to the engine.
   */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;

    try {
      await this.start();

      while (this.queued && !this.disposed) {
        await this.waitForIdle();

        const job = this.queued;
        this.queued = null;
        if (!job) break;

        try {
          job.resolve(await this.runSearch(job));
        } catch (error) {
          job.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } catch (error) {
      const job = this.queued;
      this.queued = null;
      job?.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.pumping = false;
    }
  }

  private runSearch(job: QueuedJob): Promise<PositionAnalysis> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("Engine is disposed"));

    // The side to move decides the sign of every score the engine reports.
    const sideToMove = job.request.fen.split(" ")[1] === "b" ? "b" : "w";

    return new Promise<PositionAnalysis>((resolve, reject) => {
      this.active = {
        resolve,
        reject,
        onProgress: job.onProgress,
        sideToMove,
        lines: [],
        depth: 0,
        aborted: false,
      };

      if (this.appliedMultiPv !== job.request.multiPv) {
        worker.postMessage(`setoption name MultiPV value ${job.request.multiPv}`);
        this.appliedMultiPv = job.request.multiPv;
      }

      worker.postMessage(`position fen ${job.request.fen}`);
      worker.postMessage(`go depth ${job.request.depth}`);
      this.searchActive = true;
    });
  }

  private async start(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve, reject) => {
      const worker = new Worker(ENGINE_URL);
      this.worker = worker;

      const onHandshake = (event: MessageEvent) => {
        const line = String(event.data);

        if (line.startsWith("uciok")) {
          worker.postMessage("isready");
          return;
        }

        if (line.startsWith("readyok")) {
          worker.removeEventListener("message", onHandshake);
          worker.addEventListener("message", this.onMessage);
          resolve();
        }
      };

      worker.addEventListener("message", onHandshake);
      worker.addEventListener("error", (event) => {
        this.handleEngineFailure(event.message);
        reject(new Error(`Engine failed to start: ${event.message}`));
      });

      worker.postMessage("uci");
    });

    return this.ready;
  }

  /** Fail everything in flight; the engine cannot be trusted after a crash. */
  private handleEngineFailure(message: string): void {
    const search = this.active;
    this.active = null;
    this.searchActive = false;
    this.releaseIdleWaiters();

    search?.reject(new Error(`Engine error: ${message}`));
  }

  private releaseIdleWaiters(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private onMessage = (event: MessageEvent) => {
    const line = String(event.data);

    if (isSearchComplete(line)) {
      // Handled even when the search was abandoned: an abandoned search still
      // reports `bestmove`, and that report is what makes the engine idle.
      this.searchActive = false;

      const search = this.active;
      this.active = null;

      if (search) {
        if (search.aborted) search.reject(new AnalysisAbortedError());
        else search.resolve(this.snapshot(search));
      }

      this.releaseIdleWaiters();
      return;
    }

    const search = this.active;
    if (!search || search.aborted) return;

    const parsed = parseInfoLine(line, search.sideToMove);
    if (!parsed) return;

    search.lines = mergeLine(search.lines, parsed);
    search.depth = Math.max(search.depth, parsed.depth);

    search.onProgress?.(this.snapshot(search));
  };

  private snapshot(search: ActiveSearch): PositionAnalysis {
    return {
      depth: search.depth,
      lines: [...search.lines],
      engine: ENGINE_NAME,
    };
  }

  /** Wait until the engine can accept a new position, stopping any search first. */
  private async waitForIdle(): Promise<void> {
    if (!this.searchActive) return;

    this.worker?.postMessage("stop");

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        // The engine has not answered; treat it as idle rather than hanging.
        this.searchActive = false;
        resolve();
      }, STOP_TIMEOUT_MS);

      this.idleWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  stop(): void {
    const job = this.queued;
    this.queued = null;
    job?.reject(new AnalysisAbortedError());

    if (this.active) this.active.aborted = true;
    if (this.searchActive) this.worker?.postMessage("stop");
  }

  dispose(): void {
    this.disposed = true;
    this.stop();

    const search = this.active;
    this.active = null;
    search?.reject(new AnalysisAbortedError());

    this.releaseIdleWaiters();
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.searchActive = false;
    this.appliedMultiPv = null;
  }
}

/**
 * Recorded alongside stored evaluations so they stay interpretable.
 *
 * An evaluation is only meaningful in the context of the engine and network
 * that produced it; a number from a different build is not comparable.
 */
export const ENGINE_NAME = "Stockfish 18 Lite (single-threaded, WASM)";
