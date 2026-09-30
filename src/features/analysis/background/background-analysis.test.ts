import { beforeEach, describe, expect, it } from "vitest";
import type { AnalysisRequest, EngineService } from "../engine/engine-service";
import { AnalysisAbortedError } from "../engine/engine-service";
import type { PositionAnalysis } from "@/core/analysis/types";
import { db } from "@/persistence/db";
import { getGameAnalyses } from "@/persistence/repositories/game-analysis-repository";
import { importPgn } from "@/features/games/import/import-games";
import { BackgroundAnalysis, type BackgroundAnalysisState } from "./background-analysis";

/**
 * An engine with the one behaviour that matters here: like the real one, a new
 * request aborts the search in progress. Searches resolve at once unless held,
 * so a test can catch the job mid-search.
 */
class FakeEngine implements EngineService {
  searches: string[] = [];
  hold = false;
  failWith: Error | null = null;
  private pending: { reject: (error: Error) => void; finish: () => void } | null = null;

  analyse(request: AnalysisRequest): Promise<PositionAnalysis> {
    this.pending?.reject(new AnalysisAbortedError());
    this.pending = null;
    this.searches.push(request.fen);

    if (this.failWith) return Promise.reject(this.failWith);

    const result: PositionAnalysis = {
      depth: request.depth,
      engine: "Fake",
      lines: [{ multiPv: 1, depth: request.depth, score: { type: "cp", value: 10 }, moves: [] }],
    };

    if (!this.hold) return Promise.resolve(result);

    return new Promise((resolve, reject) => {
      this.pending = { reject, finish: () => resolve(result) };
    });
  }

  /** Let a held search finish. */
  release() {
    const pending = this.pending;
    this.pending = null;
    pending?.finish();
  }

  stop() {}
  dispose() {}
}

const OWNER = ["Dony, Lukas"];

function pgn(event: string, date: string, moves: string) {
  return `[Event "${event}"]\n[Date "${date}"]\n[White "Dony, Lukas"]\n[Black "Opp"]\n[Result "*"]\n\n${moves} *`;
}

/** Resolves once the job's state satisfies a condition. */
function until(job: BackgroundAnalysis, done: (state: BackgroundAnalysisState) => boolean) {
  return new Promise<BackgroundAnalysisState>((resolve) => {
    if (done(job.getState())) return resolve(job.getState());
    const unsubscribe = job.subscribe(() => {
      if (done(job.getState())) {
        unsubscribe();
        resolve(job.getState());
      }
    });
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

let engine: FakeEngine;

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  engine = new FakeEngine();
});

describe("BackgroundAnalysis", () => {
  it("analyses every game the owner played and records each", async () => {
    await importPgn(pgn("A", "2026.01.01", "1.e4 e5") + "\n\n" + pgn("B", "2026.02.01", "1.d4 d5 2.c4"), {
      ownerNames: OWNER,
    });
    const job = new BackgroundAnalysis(engine);

    job.start(12);
    const state = await until(job, (s) => s.status === "done");

    expect(state).toMatchObject({ analysed: 2, total: 2, failed: 0, error: null });
    const records = await getGameAnalyses();
    expect(records.size).toBe(2);
    expect([...records.values()].every((record) => record.depth === 12)).toBe(true);
  });

  it("leaves out games the owner did not play", async () => {
    await importPgn('[Event "Master game"]\n[White "Carlsen"]\n[Black "Caruana"]\n\n1.e4 *', {
      ownerNames: OWNER,
    });
    const job = new BackgroundAnalysis(engine);

    await job.refresh(12);

    expect(job.getState().total).toBe(0);
  });

  it("works through the newest games first", async () => {
    await importPgn(
      [pgn("Old", "2020.01.01", "1.a3"), pgn("New", "2026.01.01", "1.h3")].join("\n\n"),
      { ownerNames: OWNER },
    );
    const job = new BackgroundAnalysis(engine);

    job.start(12);
    await until(job, (s) => s.status === "done");

    // The first search after the starting position is the newer game's 1.h3.
    expect(engine.searches[1]).toContain("7P");
  });

  it("does not repeat work already stored", async () => {
    await importPgn(pgn("A", "2026.01.01", "1.e4 e5 2.Nf3"), { ownerNames: OWNER });
    const first = new BackgroundAnalysis(engine);
    first.start(12);
    await until(first, (s) => s.status === "done");
    const searched = engine.searches.length;

    const second = new BackgroundAnalysis(engine);
    second.start(12);
    await until(second, (s) => s.status === "done");

    expect(engine.searches.length).toBe(searched);
  });

  it("goes deeper when asked, re-searching only what is too shallow", async () => {
    await importPgn(pgn("A", "2026.01.01", "1.e4"), { ownerNames: OWNER });
    const job = new BackgroundAnalysis(engine);
    job.start(12);
    await until(job, (s) => s.status === "done");

    job.start(16);
    await until(job, (s) => s.status === "done" && s.depth === 16);

    expect((await getGameAnalyses()).values().next().value?.depth).toBe(16);
  });

  it("waits while the engine is claimed, and continues when released", async () => {
    await importPgn(pgn("A", "2026.01.01", "1.e4 e5"), { ownerNames: OWNER });
    const job = new BackgroundAnalysis(engine);
    const release = job.claim();

    job.start(12);
    await until(job, (s) => s.status === "yielding");
    await settle();
    expect(engine.searches).toEqual([]);

    release();
    expect((await until(job, (s) => s.status === "done")).analysed).toBe(1);
  });

  it("gives the engine up mid-search and finishes the game afterwards", async () => {
    // What happens when the user opens a game while the job is searching: the
    // interactive request pre-empts the job's search, the job waits, and then
    // completes the game without losing what it had finished.
    await importPgn(pgn("A", "2026.01.01", "1.e4 e5 2.Nf3"), { ownerNames: OWNER });
    const job = new BackgroundAnalysis(engine);
    engine.hold = true;

    job.start(12);
    await until(job, (s) => s.current !== null);
    await settle();

    const release = job.claim();
    engine.hold = false;
    await engine.analyse({ fen: "8/8/8/8/8/8/8/K6k w - - 0 1", depth: 20, multiPv: 3 });
    await until(job, (s) => s.status === "yielding");

    release();
    const state = await until(job, (s) => s.status === "done");

    expect(state.analysed).toBe(1);
    expect((await getGameAnalyses()).size).toBe(1);
  });

  it("sends no further search once the engine is claimed, even between positions", async () => {
    // The claim can arrive before the interactive request does. If the job
    // sent its next search in that gap, the newest-wins engine would let it
    // abort the user's analysis a moment later.
    await importPgn(pgn("A", "2026.01.01", "1.e4 e5 2.Nf3 Nc6"), { ownerNames: OWNER });
    const job = new BackgroundAnalysis(engine);
    engine.hold = true;

    job.start(12);
    await until(job, (s) => s.current !== null);
    await settle();
    const sentBeforeClaim = engine.searches.length;

    const release = job.claim();
    engine.release(); // the job's search finishes normally, not aborted
    await settle();

    expect(engine.searches.length).toBe(sentBeforeClaim);
    expect(job.getState().status).toBe("yielding");

    engine.hold = false;
    release();
    expect((await until(job, (s) => s.status === "done")).analysed).toBe(1);
  });

  it("pauses, and picks up where it stopped", async () => {
    await importPgn(
      [pgn("A", "2026.03.01", "1.e4"), pgn("B", "2026.02.01", "1.d4"), pgn("C", "2026.01.01", "1.c4")].join("\n\n"),
      { ownerNames: OWNER },
    );
    const job = new BackgroundAnalysis(engine);
    engine.hold = true;

    job.start(12);
    await until(job, (s) => s.current !== null);
    job.pause();
    engine.release();
    const paused = await until(job, (s) => s.status === "idle");
    expect(paused.analysed).toBeLessThan(3);

    engine.hold = false;
    job.start(12);
    expect((await until(job, (s) => s.status === "done")).analysed).toBe(3);
  });

  it("skips a game it cannot read instead of stalling on it", async () => {
    await importPgn([pgn("A", "2026.01.01", "1.e4"), pgn("B", "2026.02.01", "1.d4")].join("\n\n"), {
      ownerNames: OWNER,
    });
    const [broken] = await db.games.toArray();
    // An illegal first move: the parser cannot replay it, so the game has no
    // moves anyone could analyse.
    await db.gameContents.update(broken.id as number, { pgn: '[Event "X"]\n\n1.e5 *' });
    const job = new BackgroundAnalysis(engine);

    job.start(12);
    const state = await until(job, (s) => s.status !== "running" && s.current === null && s.analysed + s.failed === 2);

    expect(state).toMatchObject({ analysed: 1, failed: 1 });
  });

  it("stops and says why when the engine fails", async () => {
    await importPgn(pgn("A", "2026.01.01", "1.e4"), { ownerNames: OWNER });
    engine.failWith = new Error("worker crashed");
    const job = new BackgroundAnalysis(engine);

    job.start(12);
    const state = await until(job, (s) => s.error !== null);

    expect(state).toMatchObject({ status: "idle", error: "worker crashed" });
  });

  it("counts progress without running, for a page that just opened", async () => {
    await importPgn([pgn("A", "2026.01.01", "1.e4"), pgn("B", "2026.02.01", "1.d4")].join("\n\n"), {
      ownerNames: OWNER,
    });
    const job = new BackgroundAnalysis(engine);

    await job.refresh(12);

    expect(job.getState()).toMatchObject({ analysed: 0, total: 2, status: "idle" });
    expect(engine.searches).toEqual([]);
  });
});
