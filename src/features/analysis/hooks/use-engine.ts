"use client";

import { useEffect, useState } from "react";
import { StockfishEngine } from "../engine/stockfish-engine";

/**
 * Own a single engine instance for the lifetime of a component.
 *
 * Deliberately one instance shared by every consumer on the page: each engine
 * loads a seven-megabyte WebAssembly module and allocates its own hash tables,
 * so a second one for batch analysis would double both for no benefit. Requests
 * are serialised inside the engine, so sharing is safe.
 *
 * Created through a state initialiser rather than assigned to a ref during
 * render, which is not allowed under concurrent rendering. Constructing the
 * object is cheap — the worker starts on first use — so an instance discarded
 * by a double-invoked initialiser costs nothing and holds no resources.
 */
export function useEngine(): StockfishEngine {
  const [engine] = useState(() => new StockfishEngine());

  useEffect(() => {
    return () => {
      // Without this, every visit to the page leaks a worker holding its hash
      // tables, which across a long session is hundreds of megabytes.
      engine.dispose();
    };
  }, [engine]);

  return engine;
}
