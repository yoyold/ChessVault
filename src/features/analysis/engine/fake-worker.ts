import type { EngineWorker } from "./stockfish-engine";

type MessageListener = (event: MessageEvent) => void;
type ErrorListener = (event: { message: string }) => void;

export interface FakeWorkerOptions {
  /** Info lines emitted per search before `bestmove`. */
  infoLines?: number;
  /** Emit an error event instead of completing the handshake. */
  failOnStart?: boolean;
  /**
   * Suppress the `bestmove` that a `stop` would normally produce, to model an
   * engine that has hung. The stop timeout in the engine is what should recover.
   */
  swallowStop?: boolean;
}

/**
 * A Web Worker that speaks just enough UCI to exercise the engine adapter.
 *
 * It emits every response on a microtask, never synchronously, because the bug
 * the adapter guards against is a race: `stop` does not make the engine idle at
 * once, and the next `position` must wait for `bestmove`. A synchronous fake
 * could not reproduce that window.
 *
 * Its whole reason for existing is the two observable properties below:
 * `protocolViolations` records any `position`/`setoption` received mid-search —
 * exactly the condition that crashes the real WebAssembly build — and `sent`
 * records every command for order assertions.
 */
export class FakeStockfishWorker implements EngineWorker {
  /** Every command received, in order. */
  readonly sent: string[] = [];

  /**
   * Commands that arrived while a search was running and require the engine to
   * be idle. A non-empty list is the crash the adapter must never provoke.
   */
  readonly protocolViolations: string[] = [];

  /** Number of `go` commands seen. */
  searches = 0;

  /** Number of `setoption ... MultiPV` commands seen. */
  multiPvSets = 0;

  terminated = false;

  private readonly options: Required<FakeWorkerOptions>;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  /** Remaining emissions of the current search, drained one per microtask. */
  private pending: string[] = [];
  private draining = false;
  private searching = false;

  constructor(options: FakeWorkerOptions = {}) {
    this.options = {
      infoLines: options.infoLines ?? 3,
      failOnStart: options.failOnStart ?? false,
      swallowStop: options.swallowStop ?? false,
    };
  }

  postMessage(message: string): void {
    if (this.terminated) return;
    this.sent.push(message);

    const command = message.split(" ")[0];

    // Commands that are only legal while idle. Receiving one mid-search is the
    // fault being tested for.
    if (
      this.searching &&
      (command === "position" || command === "setoption" || command === "ucinewgame")
    ) {
      this.protocolViolations.push(message);
    }

    switch (command) {
      case "uci":
        if (this.options.failOnStart) this.emitError("boom");
        else this.emit("uciok");
        return;
      case "isready":
        this.emit("readyok");
        return;
      case "setoption":
        if (message.includes("MultiPV")) this.multiPvSets += 1;
        return;
      case "position":
        return;
      case "go":
        this.startSearch(message);
        return;
      case "stop":
        this.stopSearch();
        return;
      default:
        return;
    }
  }

  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "error", listener: ErrorListener): void;
  addEventListener(type: "message" | "error", listener: MessageListener | ErrorListener): void {
    if (type === "message") this.messageListeners.add(listener as MessageListener);
    else this.errorListeners.add(listener as ErrorListener);
  }

  removeEventListener(type: "message", listener: MessageListener): void {
    if (type === "message") this.messageListeners.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
    this.pending = [];
    this.searching = false;
  }

  private startSearch(goCommand: string): void {
    this.searches += 1;
    this.searching = true;

    const depthMatch = /depth (\d+)/.exec(goCommand);
    const maxDepth = depthMatch ? Number(depthMatch[1]) : this.options.infoLines;
    const lineCount = Math.min(this.options.infoLines, maxDepth);

    this.pending = [];
    for (let depth = 1; depth <= lineCount; depth += 1) {
      this.pending.push(
        `info depth ${depth} seldepth ${depth} multipv 1 score cp ${20 + depth} nodes 100 pv e2e4 e7e5`,
      );
    }
    this.pending.push("bestmove e2e4 ponder e7e5");

    this.drain();
  }

  private stopSearch(): void {
    if (!this.searching) return;
    if (this.options.swallowStop) return;

    // Abandon the remaining info lines and finish with a bestmove on the next
    // microtask — never synchronously, so the adapter's wait is exercised.
    this.pending = ["bestmove e2e4"];
    this.drain();
  }

  /** Emit one pending line per microtask until the search ends. */
  private drain(): void {
    if (this.draining) return;
    this.draining = true;

    const step = () => {
      const line = this.pending.shift();
      if (line === undefined || this.terminated) {
        this.draining = false;
        return;
      }

      if (line.startsWith("bestmove")) this.searching = false;
      this.emit(line);

      if (this.pending.length > 0 && !this.terminated) queueMicrotask(step);
      else this.draining = false;
    };

    queueMicrotask(step);
  }

  private emit(line: string): void {
    const event = { data: line } as MessageEvent;
    for (const listener of this.messageListeners) listener(event);
  }

  private emitError(message: string): void {
    for (const listener of this.errorListeners) listener({ message });
  }
}
