/**
 * Single source of truth for resolving URLs to files in `public/`.
 *
 * Imports and `next/link` are rewritten by the bundler and need no help. This
 * helper exists for the URLs the bundler never sees: the service worker
 * registration scope, the Stockfish WASM/JS worker URL, and manifest icons.
 * Those are plain strings, so under a GitHub Pages project site they resolve
 * against the domain root and 404 unless the base path is added explicitly.
 */

/** Base path the app is served from. `""` at the domain root, `"/repo"` otherwise. Never has a trailing slash. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Resolve a `public/`-relative path to a URL valid at runtime.
 *
 * @example asset("/engine/stockfish.wasm") // "/ChessVault/engine/stockfish.wasm" in production
 */
export function asset(path: string): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalised}`;
}
