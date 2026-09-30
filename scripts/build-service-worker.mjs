import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Write the precache list into the exported service worker.
 *
 * Runs after `next build`. The worker in `public/sw.js` is copied into `out/`
 * with an empty file list; this fills it in with every file the export
 * produced and a version derived from their contents.
 *
 * The version is the point. The browser only notices an update when the bytes
 * of the worker change, so a worker that did not change with the build would
 * keep serving the old application forever. Hashing every file means any change
 * anywhere in the build — a page, a chunk, the engine — changes the worker, and
 * an unchanged build leaves it byte-identical and triggers nothing.
 */

const PLACEHOLDER = 'const MANIFEST = { version: "development", files: [] };';

/** Never cached: the worker itself, and files the host reads rather than serves. */
const EXCLUDED = new Set(["sw.js", ".nojekyll"]);

/** Every file below `dir`, as forward-slash paths relative to it. */
export function listFiles(dir, root = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listFiles(path, root);
    return [relative(root, path).split(sep).join("/")];
  });
}

/**
 * The files to precache and the version they add up to.
 *
 * Sorted so the version depends only on what the files are, not on the order
 * the file system happens to list them in.
 */
export function precacheManifest(outDir) {
  const files = listFiles(outDir)
    .filter((file) => !EXCLUDED.has(file) && !file.endsWith(".map"))
    .sort();

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(outDir, file)));
  }

  return { version: hash.digest("hex").slice(0, 16), files };
}

/**
 * Put the manifest into the worker's source.
 *
 * Refuses rather than writing a worker without it: a worker with no files
 * would install, cache nothing, and fail offline without a word.
 */
export function injectManifest(source, manifest) {
  if (!source.includes(PLACEHOLDER)) {
    throw new Error("sw.js no longer contains the manifest placeholder; the precache list cannot be written.");
  }

  return source.replace(PLACEHOLDER, `const MANIFEST = ${JSON.stringify(manifest)};`);
}

function main() {
  const outDir = join(process.cwd(), "out");
  const workerPath = join(outDir, "sw.js");

  const manifest = precacheManifest(outDir);
  writeFileSync(workerPath, injectManifest(readFileSync(workerPath, "utf8"), manifest));

  const bytes = manifest.files.reduce((sum, file) => sum + statSync(join(outDir, file)).size, 0);
  console.log(
    `Service worker ${manifest.version}: ${manifest.files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB precached.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
