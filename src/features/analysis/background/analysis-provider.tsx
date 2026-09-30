"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { StockfishEngine } from "../engine/stockfish-engine";
import { BackgroundAnalysis, type BackgroundAnalysisState } from "./background-analysis";

interface AnalysisContextValue {
  engine: StockfishEngine;
  background: BackgroundAnalysis;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

/**
 * The application's one engine, and the job that analyses the collection with it.
 *
 * Held above every page so that both outlive navigation: a background run keeps
 * going while the user moves between the list, the statistics and the openings,
 * and a game opened for analysis uses the same engine rather than starting a
 * second copy of seven megabytes of WebAssembly beside it.
 *
 * Constructing either is free — the engine's worker starts on first use — so
 * this costs nothing on a visit that never analyses anything, and it is safe to
 * render during the static export.
 */
export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [value] = useState<AnalysisContextValue>(() => {
    const engine = new StockfishEngine();
    return { engine, background: new BackgroundAnalysis(engine) };
  });

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

function useAnalysisContext(): AnalysisContextValue {
  const value = useContext(AnalysisContext);
  if (!value) throw new Error("Analysis hooks must be used inside <AnalysisProvider>.");
  return value;
}

/**
 * The engine, for a view that analyses what the user is looking at.
 *
 * Holding it claims the engine for as long as the view is mounted, so the
 * background analysis steps aside rather than trading aborted searches with
 * it. Released on unmount, when the background analysis carries on.
 */
export function useInteractiveEngine(): StockfishEngine {
  const { engine, background } = useAnalysisContext();

  useEffect(() => background.claim(), [background]);

  return engine;
}

const SERVER_STATE: BackgroundAnalysisState = {
  status: "idle",
  depth: 14,
  analysed: 0,
  total: 0,
  current: null,
  failed: 0,
  secondsPerGame: null,
  error: null,
};

/** The background analysis, with its state kept current. */
export function useBackgroundAnalysis() {
  const { background } = useAnalysisContext();
  const state = useSyncExternalStore(background.subscribe, background.getState, () => SERVER_STATE);

  // Stable across renders, so an effect can depend on them without re-running
  // every time the state they change comes back round.
  const actions = useMemo(
    () => ({
      start: (depth: number) => background.start(depth),
      pause: () => background.pause(),
      refresh: (depth: number) => background.refresh(depth),
    }),
    [background],
  );

  return { state, ...actions };
}
