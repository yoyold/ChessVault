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

interface PendingSearch {
  resolve: (analysis: PositionAnalysis) => void;
  reject: (error: Error) => void;
  onProgress?: (analysis: PositionAnalysis) => void;
  sideToMove: "w" | "b";
  lines: AnalysisLine[];
  depth: number;
}

/**
 * Drives Stockfish, compiled to WebAssembly, in a Web Worker.
 *
 * The engine speaks UCI over `postMessage`, one text line per message. Parsing
 * lives in `core/analysis/uci`; this class owns only the protocol handshake,
 * the request lifecycle and worker ownership.
 */
export class StockfishEngine implements EngineService {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending: PendingSearch | null = null;

  /**
   * Options currently applied to the engine.
   *
   * Tracked so MultiPV is only re-sent when it changes: setting an option
   * forces the engine to discard its hash table, which throws away work that
   * would otherwise speed up analysis of a related position.
   */
  private appliedMultiPv: number | null = null;

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
        reject(new Error(`Engine failed to start: ${event.message}`));
      });

      worker.postMessage("uci");
    });

    return this.ready;
  }

  private onMessage = (event: MessageEvent) => {
    const search = this.pending;
    if (!search) return;

    const line = String(event.data);

    if (isSearchComplete(line)) {
      this.pending = null;
      search.resolve(this.snapshot(search));
      return;
    }

    const parsed = parseInfoLine(line, search.sideToMove);
    if (!parsed) return;

    search.lines = mergeLine(search.lines, parsed);
    search.depth = Math.max(search.depth, parsed.depth);

    search.onProgress?.(this.snapshot(search));
  };

  private snapshot(search: PendingSearch): PositionAnalysis {
    return {
      depth: search.depth,
      lines: [...search.lines],
      engine: ENGINE_NAME,
    };
  }

  async analyse(
    request: AnalysisRequest,
    onProgress?: (analysis: PositionAnalysis) => void,
  ): Promise<PositionAnalysis> {
    await this.start();

    const worker = this.worker;
    if (!worker) throw new Error("Engine is disposed");

    // Abandon anything already running. Calling this on every move as a user
    // clicks through a game is the normal case, not an edge case.
    this.stop();

    // The side to move decides the sign of every score the engine reports.
    const sideToMove = request.fen.split(" ")[1] === "b" ? "b" : "w";

    const result = new Promise<PositionAnalysis>((resolve, reject) => {
      this.pending = {
        resolve,
        reject,
        onProgress,
        sideToMove,
        lines: [],
        depth: 0,
      };
    });

    if (this.appliedMultiPv !== request.multiPv) {
      worker.postMessage(`setoption name MultiPV value ${request.multiPv}`);
      this.appliedMultiPv = request.multiPv;
    }

    worker.postMessage(`position fen ${request.fen}`);
    worker.postMessage(`go depth ${request.depth}`);

    return result;
  }

  stop(): void {
    const search = this.pending;
    if (!search) return;

    this.pending = null;
    this.worker?.postMessage("stop");
    search.reject(new AnalysisAbortedError());
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
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
