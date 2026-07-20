# ADR 0002 — Single-threaded engine behind a port

Status: accepted

## Context

Multi-threaded Stockfish WASM requires `SharedArrayBuffer`, which browsers only
expose when the document is cross-origin isolated. That isolation requires two
response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages serves static files and cannot set custom response headers. The
constraint is structural, not a configuration gap.

## Options

| Option | Benefit | Cost |
|---|---|---|
| Single-threaded WASM build | Works everywhere, no tricks | Roughly one core; noticeably slower deep analysis |
| `coi-serviceworker` shim | Full multi-threaded NNUE strength | A service worker must intercept every request to synthesise the headers; the first load is not isolated until it activates; it competes with the PWA service worker for scope |
| Host elsewhere | Real headers | Violates the GitHub Pages requirement |

## Decision

Ship the single-threaded build, and define analysis as a port
(`EngineService`) with a `StockfishWorkerEngine` adapter.

The important part is the seam, not the initial choice. Engine work runs in a
Web Worker regardless of threading, so the asynchronous message-passing shape of
the API is identical either way. Threading therefore stays an implementation
detail of one adapter.

## Consequences

- Analysis throughput is lower than a native or cross-origin-isolated deployment.
  Batch analysis of a large import is a background job, not an interactive wait,
  and must be designed as resumable.
- If throughput proves inadequate, adding the COI shim is a change to one
  adapter plus the service worker, not an architectural rewrite.
- Tests use a stub adapter and never load WASM.
