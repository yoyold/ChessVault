import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { injectManifest, listFiles, precacheManifest } from "./build-service-worker.mjs";

let out;

function write(path, content) {
  const full = join(out, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "sw-build-"));
  write("index.html", "<html>home</html>");
  write("games/index.html", "<html>games</html>");
  write("_next/static/chunks/a.js", "console.log(1)");
  write("engine/stockfish.wasm", "binary");
  write("sw.js", "worker");
  write(".nojekyll", "");
  write("_next/static/chunks/a.js.map", "{}");
});

afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

describe("precacheManifest", () => {
  it("lists every served file with forward slashes", () => {
    expect(precacheManifest(out).files).toEqual([
      "_next/static/chunks/a.js",
      "engine/stockfish.wasm",
      "games/index.html",
      "index.html",
    ]);
  });

  it("leaves out the worker itself, host files and source maps", () => {
    // Caching the worker would pin it; the browser must always fetch it fresh
    // to see an update.
    const { files } = precacheManifest(out);

    expect(files).not.toContain("sw.js");
    expect(files).not.toContain(".nojekyll");
    expect(files.some((file) => file.endsWith(".map"))).toBe(false);
  });

  it("gives the same build the same version", () => {
    // An unchanged deployment must not look like an update to every visitor.
    expect(precacheManifest(out).version).toBe(precacheManifest(out).version);
  });

  it("changes the version when any file changes", () => {
    const before = precacheManifest(out).version;
    write("engine/stockfish.wasm", "a newer engine");

    expect(precacheManifest(out).version).not.toBe(before);
  });

  it("changes the version when a file is renamed, even with the same content", () => {
    const before = precacheManifest(out).version;
    rmSync(join(out, "games/index.html"));
    write("games/new/index.html", "<html>games</html>");

    expect(precacheManifest(out).version).not.toBe(before);
  });
});

describe("injectManifest", () => {
  it("replaces the placeholder with the real list", () => {
    const template = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    const result = injectManifest(template, { version: "abc123", files: ["index.html"] });

    expect(result).toContain('const MANIFEST = {"version":"abc123","files":["index.html"]};');
    expect(result).not.toContain('version: "development"');
  });

  it("refuses a worker that lost its placeholder", () => {
    // Otherwise the build would ship a worker that caches nothing and fails
    // offline without a word.
    expect(() => injectManifest("self.addEventListener('fetch', () => {});", {})).toThrow(
      /placeholder/,
    );
  });
});

describe("listFiles", () => {
  it("walks nested directories", () => {
    expect(listFiles(out)).toContain("_next/static/chunks/a.js");
  });
});
