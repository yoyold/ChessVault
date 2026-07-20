import type { PositionAnalysis } from "@/core/analysis/types";

export interface AnalysisRequest {
  /** Full FEN of the position to analyse. */
  fen: string;
  depth: number;
  /** Number of variations to report. 1 is the best line only. */
  multiPv: number;
}

/**
 * The analysis capability, as the application sees it.
 *
 * This is the seam described in ADR 0002. The shipped implementation drives a
 * single-threaded Stockfish build in a Web Worker, because static hosting
 * cannot send the COOP/COEP headers a multi-threaded build needs. Because
 * engine work is asynchronous and message-based either way, swapping in a
 * multi-threaded build later changes only the adapter.
 *
 * Tests use a stub and never load WebAssembly.
 */
export interface EngineService {
  /**
   * Analyse a position, resolving when the requested depth is reached.
   *
   * `onProgress` is called as the search deepens, so an interface can show the
   * evaluation improving rather than waiting for the final result.
   *
   * Requests are serialised: starting a new analysis abandons any in flight,
   * which is what makes it safe to call this on every move as a user clicks
   * through a game.
   */
  analyse(
    request: AnalysisRequest,
    onProgress?: (analysis: PositionAnalysis) => void,
  ): Promise<PositionAnalysis>;

  /** Abandon the current search. Any pending `analyse` promise rejects. */
  stop(): void;

  /** Release the worker. The service is unusable afterwards. */
  dispose(): void;
}

/** Raised when a search is abandoned, so callers can distinguish it from failure. */
export class AnalysisAbortedError extends Error {
  constructor() {
    super("Analysis aborted");
    this.name = "AnalysisAbortedError";
  }
}
