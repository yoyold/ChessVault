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

    return json(200, {
      content: this.file.contentB64,
      sha: this.file.sha,
      size: atob(this.file.contentB64).length,
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

  it("refuses a snapshot too large for the contents API", async () => {
    const huge = "x".repeat(1_000_001);
    await expect(makeTarget().push(huge, null)).rejects.toThrow(/too large/);
  });

  it("sends the token and API version headers", async () => {
    await makeTarget().pull();

    const [, init] = remote.fetch.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer good-token");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });
});
