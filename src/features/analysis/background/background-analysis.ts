import { buildGameReport, toEvaluatedPositions } from "@/core/analysis/game-report";
import { summariseGameReport } from "@/core/analysis/game-summary";
import { mainline, parseGameTree, type TreeNode } from "@/core/chess/pgn/parse-tree";
import { getEvaluations } from "@/persistence/repositories/evaluation-repository";
import {
  getGameAnalyses,
  listGamesToAnalyse,
  saveGameAnalysis,
  type GameToAnalyse,
} from "@/persistence/repositories/game-analysis-repository";
import { getFullGame } from "@/persistence/repositories/game-repository";
import { analyseTimeline } from "../engine/analyse-timeline";
import { AnalysisAbortedError, type EngineService } from "../engine/engine-service";

export type BackgroundStatus =
  /** Not running. Some, all or none of the games may be analysed. */
  | "idle"
  | "running"
  /** Running, but waiting while the engine is needed for something else. */
  | "yielding"
  /** Every game is analysed at the chosen depth. */
  | "done";

export interface BackgroundAnalysisState {
  status: BackgroundStatus;
  depth: number;
  /** The owner's games analysed at `depth` or deeper. */
  analysed: number;
  /** The owner's games in total. */
  total: number;
  /** The game being worked on, and how far into it. */
  current: { gameId: number; label: string; position: number; positions: number } | null;
  /** Games whose moves could not be read, skipped rather than retried forever. */
  failed: number;
  /** Seconds per game over this run, once a game has finished — for an estimate. */
  secondsPerGame: number | null;
  /** Why the last run stopped, when it was not by choice. */
  error: string | null;
}

const INITIAL: BackgroundAnalysisState = {
  status: "idle",
  depth: 14,
  analysed: 0,
  total: 0,
  current: null,
  failed: 0,
  secondsPerGame: null,
  error: null,
};

function label(game: GameToAnalyse): string {
  const players = `${game.white || "?"} – ${game.black || "?"}`;
  return game.dateIso ? `${players}, ${game.dateIso.slice(0, 4)}` : players;
}

async function loadTimeline(gameId: number): Promise<readonly TreeNode[] | null> {
  const game = await getFullGame(gameId);
  if (!game) return null;

  try {
    return mainline(parseGameTree(game.content.pgn).root);
  } catch {
    return null;
  }
}

/**
 * Works through every game the owner played, analysing each with the engine.
 *
 * ## Sharing the one engine
 *
 * There is one engine for the whole application — it is seven megabytes of
 * WebAssembly with its own hash tables — and it serves one request at a time,
 * the newest winning. Two users of it at once would abort each other endlessly.
 * So this job gives way: anything that needs the engine interactively holds a
 * {@link claim} while it does, and the job waits for the claims to be released
 * before sending another search. A search already running when a claim arrives
 * is simply pre-empted; the job notices and repeats that game once the engine
 * is free, with every position it finished already saved.
 *
 * ## Resuming
 *
 * Nothing about progress is stored separately. A game is done when it has an
 * analysis record at the chosen depth, and a game half done has its finished
 * positions in the evaluation store, which a restart skips. Stopping, reloading
 * and starting again therefore continues where it left off.
 */
export class BackgroundAnalysis {
  private state: BackgroundAnalysisState = INITIAL;
  private readonly listeners = new Set<() => void>();
  private claims = 0;
  private stopRequested = false;
  private running = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly engine: EngineService,
    private readonly now: () => number = () => Date.now(),
  ) {}

  getState = (): BackgroundAnalysisState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<BackgroundAnalysisState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /**
   * Count how much is analysed at a depth, without running anything.
   *
   * For showing progress when a page opens; ignored while a run is going,
   * whose own counts are current.
   */
  async refresh(depth: number): Promise<void> {
    if (this.running) return;

    const [games, analyses] = await Promise.all([listGamesToAnalyse(), getGameAnalyses()]);
    const analysed = games.filter((game) => (analyses.get(game.id)?.depth ?? 0) >= depth).length;

    if (this.running) return;
    this.update({
      depth,
      analysed,
      total: games.length,
      status: games.length > 0 && analysed === games.length ? "done" : "idle",
    });
  }

  /**
   * Take the engine for interactive use. The job waits until it is released.
   *
   * @returns The release function. Calling it more than once is harmless.
   */
  claim(): () => void {
    this.claims += 1;
    if (this.state.status === "running") this.update({ status: "yielding" });

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.claims -= 1;
      if (this.claims === 0) this.wake?.();
    };
  }

  /** Stop after the current search. Finished work is kept. */
  pause(): void {
    if (!this.running) return;
    this.stopRequested = true;
    this.wake?.();
  }

  /** Start, or continue, at a depth. Does nothing if already running. */
  start(depth: number): void {
    if (this.running) return;
    void this.run(depth);
  }

  private waitForEngine(): Promise<void> {
    if (this.claims === 0 || this.stopRequested) return Promise.resolve();

    this.update({ status: "yielding" });
    return new Promise((resolve) => {
      this.wake = () => {
        this.wake = null;
        resolve();
      };
    });
  }

  private async run(depth: number): Promise<void> {
    this.running = true;
    this.stopRequested = false;
    this.update({ status: "running", depth, error: null, failed: 0, secondsPerGame: null });

    const shouldStop = () => this.stopRequested || this.claims > 0;
    const startedAt = this.now();
    let finishedThisRun = 0;

    try {
      const [games, analyses] = await Promise.all([listGamesToAnalyse(), getGameAnalyses()]);
      const pending = games.filter((game) => (analyses.get(game.id)?.depth ?? 0) < depth);
      this.update({ total: games.length, analysed: games.length - pending.length });

      for (const game of pending) {
        if (this.stopRequested) break;

        const timeline = await loadTimeline(game.id);
        if (!timeline) {
          this.update({ failed: this.state.failed + 1 });
          continue;
        }

        const current = { gameId: game.id, label: label(game), position: 0, positions: timeline.length };
        let complete = false;

        // Repeated until the game is done or the run is stopped: a pass cut
        // short by a claim resumes from its saved positions once the engine is
        // free again.
        while (!complete && !this.stopRequested) {
          await this.waitForEngine();
          if (this.stopRequested) break;

          this.update({ status: "running", current });

          try {
            complete = await analyseTimeline(this.engine, timeline, {
              depth,
              shouldStop,
              onPosition: (position) => this.update({ current: { ...current, position } }),
            });
          } catch (error) {
            if (!(error instanceof AnalysisAbortedError)) throw error;
          }
        }

        if (!complete) break;

        const records = await getEvaluations(timeline.map((node) => node.key));
        const report = buildGameReport(timeline, toEvaluatedPositions(timeline, records));

        await saveGameAnalysis(
          summariseGameReport(report, {
            gameId: game.id,
            depth,
            engine: records.values().next().value?.engine ?? "unknown",
            analysedAt: this.now(),
            plies: timeline.length - 1,
          }),
        );

        finishedThisRun += 1;
        this.update({
          analysed: this.state.analysed + 1,
          secondsPerGame: (this.now() - startedAt) / 1000 / finishedThisRun,
        });
      }

      this.update({
        status: this.state.analysed >= this.state.total && !this.stopRequested ? "done" : "idle",
        current: null,
      });
    } catch (error) {
      // The engine failing is not something retrying the next game fixes, so
      // the run ends and says why.
      this.update({
        status: "idle",
        current: null,
        error: error instanceof Error ? error.message : "The engine failed",
      });
    } finally {
      this.running = false;
      this.stopRequested = false;
    }
  }
}
