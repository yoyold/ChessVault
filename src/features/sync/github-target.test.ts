import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubTarget } from "./github-target";
import { SyncAuthError, SyncConflictError, SyncError } from "./sync-target";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

/**
 * A single-file GitHub store with the SHA semantics the target relies on.
 *
 * The point being tested is optimistic concurrency: an update must carry the
 * current SHA, and a stale one is rejected — that is what stops one device
 * silently overwriting another.
 */
class FakeGitHub {
  file: { contentB64: string; sha: string } | null = null;
  token = "good-token";
  /** Lowered in tests so the oversized path can be exercised without megabytes. */
  inlineLimit = 1_000_000;
  private counter = 0;

  private nextSha(): string {
    this.counter += 1;
    return `sha-${this.counter}`;
  }

  readonly fetch = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
    if (init.headers && (init.headers as Record<string, string>).Authorization !== `Bearer ${this.token}`) {
      return json(401, { message: "Bad credentials" });
    }

    if (init.method === "PUT") {
      const body = JSON.parse(init.body as string) as { content: string; sha?: string };

      if (this.file === null) {
        if (body.sha) return json(422, { message: "sha given for missing file" });
        this.file = { contentB64: body.content, sha: this.nextSha() };
        return json(201, { content: { sha: this.file.sha } });
      }

      if (body.sha !== this.file.sha) return json(409, { message: "does not match" });

      this.file = { contentB64: body.content, sha: this.nextSha() };
      return json(200, { content: { sha: this.file.sha } });
    }

    // GET
    if (this.file === null) return json(404, { message: "Not Found" });

    const url = String(_input);

    // The git data API, addressed by SHA, hands back the bytes the contents
    // API declines to inline.
    if (url.includes("/git/blobs/")) {
      if (!url.endsWith(this.file.sha)) return json(404, { message: "Not Found" });
      return json(200, { content: this.file.contentB64, encoding: "base64" });
    }

    const size = atob(this.file.contentB64.replace(/\s/g, "")).length;

    // Past a megabyte the real API describes the file and leaves the body out.
    if (size > this.inlineLimit) {
      return json(200, { content: "", sha: this.file.sha, size, encoding: "none" });
    }

    return json(200, {
      content: this.file.contentB64,
      sha: this.file.sha,
      size,
      encoding: "base64",
    });
  });
}

let remote: FakeGitHub;

function makeTarget(overrides?: { token?: string }) {
  return new GitHubTarget(
    { token: overrides?.token ?? "good-token", owner: "yoyold", repo: "vault" },
    remote.fetch,
  );
}

beforeEach(() => {
  remote = new FakeGitHub();
});

describe("pull", () => {
  it("returns null when nothing is stored yet", async () => {
    expect(await makeTarget().pull()).toBeNull();
  });

  it("returns what was pushed", async () => {
    const target = makeTarget();
    await target.push("hello snapshot", null);

    const pulled = await target.pull();
    expect(pulled?.content).toBe("hello snapshot");
    expect(pulled?.version).toBe("sha-1");
  });

  it("round-trips non-ASCII content through base64", async () => {
    const target = makeTarget();
    const text = "Klein, Jörg ½–½ Đurić";
    await target.push(text, null);

    expect((await target.pull())?.content).toBe(text);
  });

  it("decodes GitHub's newline-wrapped base64", async () => {
    // The real API wraps base64 at column 60; the decoder must strip that.
    remote.file = { contentB64: "aGVsbG8g\nd29ybGQ=", sha: "sha-x" };
    expect((await makeTarget().pull())?.content).toBe("hello world");
  });

  it("falls back to the blobs API when the body is too large to inline", async () => {
    // The contents API stops inlining bodies at a megabyte, which a real
    // database passes easily. Refusing there would cap the whole feature.
    remote.inlineLimit = 8;
    const target = makeTarget();
    await target.push("a snapshot larger than the inline limit", null);

    const pulled = await target.pull();

    expect(pulled?.content).toBe("a snapshot larger than the inline limit");
    expect(pulled?.version).toBe("sha-1");
    expect(remote.fetch.mock.calls.some(([url]) => String(url).includes("/git/blobs/"))).toBe(
      true,
    );
  });

  it("reads the blob belonging to the version it reports", async () => {
    // The two endpoints must describe one object: a body fetched from a
    // different blob than the SHA returned would break the concurrency check.
    remote.inlineLimit = 0;
    const target = makeTarget();
    await target.push("first", null);
    const second = await target.push("second", "sha-1");

    const pulled = await target.pull();
    expect(pulled?.version).toBe(second);
    expect(pulled?.content).toBe("second");
  });
});

describe("push and optimistic concurrency", () => {
  it("creates the file on first push", async () => {
    const version = await makeTarget().push("first", null);
    expect(version).toBe("sha-1");
    expect(remote.file).not.toBeNull();
  });

  it("updates when the expected version is current", async () => {
    const target = makeTarget();
    const v1 = await target.push("first", null);
    const v2 = await target.push("second", v1);

    expect(v2).not.toBe(v1);
    expect((await target.pull())?.content).toBe("second");
  });

  it("refuses to overwrite when another device wrote first", async () => {
    // The whole reason version is tracked: a push against a stale version must
    // fail loudly rather than clobber the newer copy.
    const target = makeTarget();
    const stale = await target.push("first", null);
    await target.push("from another device", stale); // advances the remote

    await expect(target.push("would clobber", stale)).rejects.toBeInstanceOf(
      SyncConflictError,
    );
  });

  it("treats a first-time push with a stale version as a conflict", async () => {
    // Two devices each think the remote is empty and both push.
    const target = makeTarget();
    await target.push("device A", null);

    await expect(target.push("device B", null)).rejects.toBeInstanceOf(
      SyncConflictError,
    );
  });
});

describe("authentication and failure", () => {
  it("reports a rejected token", async () => {
    await expect(makeTarget({ token: "wrong" }).pull()).rejects.toBeInstanceOf(
      SyncAuthError,
    );
  });

  it("maps a 403 to an auth error", async () => {
    const target = new GitHubTarget(
      { token: "t", owner: "o", repo: "r" },
      vi.fn(async () => json(403, { message: "rate limited" })),
    );
    await expect(target.pull()).rejects.toBeInstanceOf(SyncAuthError);
  });

  it("wraps a network failure as a SyncError", async () => {
    const target = new GitHubTarget(
      { token: "t", owner: "o", repo: "r" },
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(target.pull()).rejects.toBeInstanceOf(SyncError);
  });

  it("uploads a snapshot past the contents API's inline limit", async () => {
    // A megabyte is what the API will hand back in one JSON body, not what the
    // repository will hold. Refusing to upload at that size was the bug.
    const big = "x".repeat(1_200_000);
    await expect(makeTarget().push(big, null)).resolves.toBe("sha-1");
  });

  it("explains a rejected upload rather than quoting the status", async () => {
    const target = new GitHubTarget(
      { token: "t", owner: "o", repo: "r" },
      vi.fn(async () => json(413, { message: "Payload too large" })),
    );
    await expect(target.push("anything", null)).rejects.toThrow(/too large/);
  });

  it("sends the token and API version headers", async () => {
    await makeTarget().pull();

    const [, init] = remote.fetch.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer good-token");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });
});
