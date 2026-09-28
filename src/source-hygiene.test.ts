import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry) ? [path] : [];
  });
}

describe("source files", () => {
  it("contain no raw control characters", () => {
    // A literal NUL inside a regular expression once made git treat a source
    // file as binary: the code ran, but every diff of it read "Binary files
    // differ", so no change to it could be reviewed. Control characters belong
    // in source only as escapes like \u0000.
    const offenders = sourceFiles("src").filter((file) =>
      /[\u0000-\u0008\u000e-\u001f]/.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
