import type { NextConfig } from "next";

/**
 * GitHub Pages project sites are served from `https://<user>.github.io/<repo>/`,
 * so every absolute asset URL needs a `/<repo>` prefix in production. Locally we
 * serve from the root, so hardcoding the prefix would break `next dev`.
 *
 * The CI workflow sets NEXT_PUBLIC_BASE_PATH; everywhere else it is empty.
 * It is deliberately a NEXT_PUBLIC_* var so that client code (service worker
 * registration, Stockfish WASM loading) can resolve the same prefix at runtime
 * via `src/lib/paths.ts`. Those two are the classic 404-in-production traps,
 * because they build URLs by hand instead of going through the bundler.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // No Node runtime on GitHub Pages: everything must be pre-rendered to HTML.
  output: "export",

  basePath,
  assetPrefix: basePath || undefined,

  // Emits `games/index.html` rather than `games.html`. Both can work on Pages,
  // but directory-style output resolves unambiguously and keeps relative asset
  // references stable if the site is ever moved to a different host.
  trailingSlash: true,

  // next/image optimisation requires a server. Static export has none.
  images: { unoptimized: true },

  // Fail the production build on type errors rather than shipping a broken
  // static bundle that nothing else will catch (there is no runtime server to
  // error at request time). Next 16 dropped the `eslint` config key along with
  // `next lint`, so linting is enforced by the separate `npm run lint` CI gate.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
