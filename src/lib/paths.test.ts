import { afterEach, describe, expect, it, vi } from "vitest";
import { asset } from "./paths";

describe("asset (no base path)", () => {
  // The test environment sets no NEXT_PUBLIC_BASE_PATH, matching local dev and
  // a user-site deployment served from the domain root.
  it("returns the path unchanged at the domain root", () => {
    expect(asset("/engine/stockfish.wasm")).toBe("/engine/stockfish.wasm");
  });

  it("adds a leading slash when one is missing", () => {
    // Callers should not have to remember; a missing slash would otherwise
    // produce a relative URL that resolves against the current page.
    expect(asset("manifest.json")).toBe("/manifest.json");
  });
});

describe("asset (project-site base path)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("prefixes hand-built URLs so they do not 404 under a subpath", async () => {
    // BASE_PATH is captured at module load, so the env must be set before the
    // module is imported afresh.
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/ChessVault");
    vi.resetModules();

    const { asset: prefixed } = await import("./paths");

    expect(prefixed("/engine/stockfish.wasm")).toBe(
      "/ChessVault/engine/stockfish.wasm",
    );
    expect(prefixed("sw.js")).toBe("/ChessVault/sw.js");
  });
});
