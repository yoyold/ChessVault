import { describe, expect, it } from "vitest";
import { AnalysisAbortedError } from "./engine-service";
import { FakeStockfishWorker } from "./fake-worker";
import { ENGINE_NAME, StockfishEngine } from "./stockfish-engine";

const WHITE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

/** Engine plus the fake worker behind it, so tests can inspect the protocol. */
function makeEngine(options?: ConstructorParameters<typeof FakeStockfishWorker>[0]) {
  const worker = new FakeStockfishWorker(options);
  const engine = new StockfishEngine(() => worker);
  return { engine, worker };
}

/** Yield to the microtask and timer queues so a rejected chain can settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("handshake and a single search", () => {
  it("completes the UCI handshake before searching", async () => {
    const { engine, worker } = makeEngine();
    await engine.analyse({ fen: WHITE_FEN, depth: 2, multiPv: 1 });

    // uci and isready must precede any position or go.
    const firstGo = worker.sent.indexOf(worker.sent.find((c) => c.startsWith("go"))!);
    expect(worker.sent.slice(0, 2)).toEqual(["uci", "isready"]);
    expect(worker.sent.indexOf("uci")).toBeLessThan(firstGo);
  });

  it("resolves with the deepest analysis and reports progress", async () => {
    const { engine } = makeEngine({ infoLines: 3 });
    const depths: number[] = [];

    const result = await engine.analyse(
      { fen: WHITE_FEN, depth: 3, multiPv: 1 },
      (analysis) => depths.push(analysis.depth),
    );

    expect(result.depth).toBe(3);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].score).toEqual({ type: "cp", value: 23 });
    expect(result.engine).toBe(ENGINE_NAME);
    // Progress arrives as the search deepens, not only at the end.
    expect(depths).toEqual([1, 2, 3]);
  });

  it("normalises the score to White's perspective", async () => {
    // The fake always reports a positive score for the side to move; with Black
    // to move the adapter must flip it.
    const { engine } = makeEngine({ infoLines: 2 });
    const result = await engine.analyse({ fen: BLACK_FEN, depth: 2, multiPv: 1 });

    expect(result.lines[0].score).toEqual({ type: "cp", value: -22 });
  });
});

describe("UCI serialisation — the crash the adapter exists to prevent", () => {
  it("never sends a position while a search is running, however fast requests arrive", async () => {
    // Stepping through a game issues an analyse per move. Each new request mid
    // search must wait for the running search to report bestmove; sending the
    // next position early crashes the real WebAssembly engine.
    const { engine, worker } = makeEngine({ infoLines: 6 });

    let restarts = 0;
    const hammer = () => {
      if (restarts++ < 25) void engine.analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }, hammer).catch(() => {});
    };

    await engine.analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }, hammer).catch(() => {});
    await flush();

    expect(worker.protocolViolations).toEqual([]);
    expect(worker.searches).toBeGreaterThan(1);
  });

  it("stops the running search when a new request arrives", async () => {
    const { engine, worker } = makeEngine({ infoLines: 6 });

    let switched = false;
    await engine
      .analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }, () => {
        if (!switched) {
          switched = true;
          void engine.analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }).catch(() => {});
        }
      })
      .catch(() => {});
    await flush();

    expect(worker.sent).toContain("stop");
  });
});

describe("superseding and cancelling", () => {
  it("rejects a superseded search with AnalysisAbortedError", async () => {
    const { engine } = makeEngine({ infoLines: 6 });

    const first = engine.analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }, () => {
      void engine.analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }).catch(() => {});
    });

    await expect(first).rejects.toBeInstanceOf(AnalysisAbortedError);
  });

  it("still resolves the request that superseded it", async () => {
    const { engine } = makeEngine({ infoLines: 4 });

    let second: Promise<unknown> | undefined;
    await engine
      .analyse({ fen: WHITE_FEN, depth: 4, multiPv: 1 }, () => {
        second ??= engine.analyse({ fen: WHITE_FEN, depth: 4, multiPv: 1 });
      })
      .catch(() => {});

    await expect(second).resolves.toMatchObject({ depth: expect.any(Number) });
  });

  it("rejects the active search when stopped", async () => {
    const { engine } = makeEngine({ infoLines: 6 });

    const search = engine.analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }, () =>
      engine.stop(),
    );

    await expect(search).rejects.toBeInstanceOf(AnalysisAbortedError);
  });
});

describe("MultiPV", () => {
  it("only re-sends the option when it changes", async () => {
    // Setting an option makes the engine discard its hash table, so an
    // unchanged value must not be re-sent.
    const { engine, worker } = makeEngine({ infoLines: 2 });

    await engine.analyse({ fen: WHITE_FEN, depth: 2, multiPv: 2 });
    await engine.analyse({ fen: WHITE_FEN, depth: 2, multiPv: 2 });
    expect(worker.multiPvSets).toBe(1);

    await engine.analyse({ fen: WHITE_FEN, depth: 2, multiPv: 3 });
    expect(worker.multiPvSets).toBe(2);
  });
});

describe("failure and disposal", () => {
  it("rejects when the worker fails to start", async () => {
    const { engine } = makeEngine({ failOnStart: true });

    await expect(
      engine.analyse({ fen: WHITE_FEN, depth: 2, multiPv: 1 }),
    ).rejects.toThrow(/Engine/);
  });

  it("terminates the worker and refuses further work when disposed", async () => {
    const { engine, worker } = makeEngine({ infoLines: 6 });

    const search = engine.analyse({ fen: WHITE_FEN, depth: 20, multiPv: 1 }, () =>
      engine.dispose(),
    );

    await expect(search).rejects.toBeInstanceOf(AnalysisAbortedError);
    expect(worker.terminated).toBe(true);

    await expect(
      engine.analyse({ fen: WHITE_FEN, depth: 2, multiPv: 1 }),
    ).rejects.toThrow(/disposed/);
  });
});
