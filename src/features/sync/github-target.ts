import {
  SyncAuthError,
  SyncConflictError,
  SyncError,
  type RemoteSnapshot,
  type SyncTarget,
} from "./sync-target";

export interface GitHubConfig {
  /** A personal access token with contents read/write on the repository. */
  token: string;
  owner: string;
  repo: string;
  /** File the snapshot is stored as. */
  path?: string;
  /** Branch to read and write. Defaults to the repository's default branch. */
  branch?: string;
}

const DEFAULT_PATH = "chessvault-snapshot.json";
const API_ROOT = "https://api.github.com";

/**
 * How much of a file the contents API will inline.
 *
 * Past roughly a megabyte the response still carries the metadata this target
 * needs — the SHA above all — but the body arrives empty. That is a limit on
 * this one endpoint's JSON, not on what the repository can hold, so it is a
 * reason to fetch the body elsewhere rather than to refuse the snapshot.
 */
const INLINE_CONTENT_LIMIT = 1_000_000;

/**
 * What a repository will actually hold in one file.
 *
 * The blobs API serves up to a hundred megabytes, and git refuses to store more
 * than that in a single file regardless of how it is written. Checked here so
 * an oversized snapshot is named for what it is instead of arriving as a bare
 * status code after a long upload.
 */
const BLOB_SIZE_LIMIT = 100_000_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function utf8ToBase64(text: string): string {
  const bytes = encoder.encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  // GitHub wraps its base64 at column 60 with newlines, which atob rejects.
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return decoder.decode(bytes);
}

/**
 * Stores the snapshot as a single file in a private GitHub repository.
 *
 * GitHub's own API is the whole backend: it holds the file, versions it by blob
 * SHA, and enforces access through the token. Nothing is run by us. The SHA
 * doubles as the optimistic-concurrency token — a push must supply the SHA it
 * expects to replace, and GitHub rejects the write if the file has moved on.
 *
 * Writing and describing the file go through the contents API; reading its
 * bytes may fall through to the git data API, which is the only one of the two
 * that will hand back a body larger than a megabyte.
 */
export class GitHubTarget implements SyncTarget {
  private readonly config: Required<Omit<GitHubConfig, "branch">> & { branch?: string };
  private readonly fetchImpl: typeof fetch;

  constructor(config: GitHubConfig, fetchImpl?: typeof fetch) {
    this.config = {
      token: config.token,
      owner: config.owner,
      repo: config.repo,
      path: config.path ?? DEFAULT_PATH,
      branch: config.branch,
    };
    // Bound to the global scope: the native `fetch` throws "Illegal invocation"
    // if called with any receiver other than the window, and calling it as
    // `this.fetchImpl(...)` would set the receiver to this instance. An injected
    // test fetch is a plain function that ignores its receiver.
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private get contentsUrl(): string {
    const { owner, repo, path } = this.config;
    return `${API_ROOT}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  }

  private blobUrl(sha: string): string {
    const { owner, repo } = this.config;
    return `${API_ROOT}/repos/${owner}/${repo}/git/blobs/${sha}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async pull(): Promise<RemoteSnapshot | null> {
    const url = this.config.branch
      ? `${this.contentsUrl}?ref=${encodeURIComponent(this.config.branch)}`
      : this.contentsUrl;

    const response = await this.request(url, { headers: this.headers });

    // Nothing stored yet is a normal first-run state, not an error.
    if (response.status === 404) return null;

    this.throwForStatus(response);

    const body = (await response.json()) as {
      content?: string;
      sha: string;
      size?: number;
      encoding?: string;
    };

    // A file past the inline limit comes back described but empty — GitHub
    // signals it with `encoding: "none"`, and the size is the fallback for
    // anything that does not. The blob itself still has to be fetched.
    const inlined =
      body.encoding !== "none" && (body.size ?? 0) <= INLINE_CONTENT_LIMIT;

    return {
      content: inlined ? base64ToUtf8(body.content ?? "") : await this.pullBlob(body.sha),
      version: body.sha,
    };
  }

  /**
   * Read a file's bytes from the git data API.
   *
   * The same object the contents API described, addressed by its SHA, which is
   * why the version the caller gets back is still the one it read: the two
   * endpoints are two views of one blob, not two copies that could disagree.
   */
  private async pullBlob(sha: string): Promise<string> {
    const response = await this.request(this.blobUrl(sha), { headers: this.headers });
    this.throwForStatus(response);

    const body = (await response.json()) as { content?: string; encoding?: string };

    if (body.encoding !== "base64") {
      throw new SyncError(
        `GitHub returned the snapshot in an unexpected encoding (${body.encoding ?? "none"}).`,
      );
    }

    return base64ToUtf8(body.content ?? "");
  }

  async push(content: string, expectedVersion: string | null): Promise<string> {
    if (encoder.encode(content).length > BLOB_SIZE_LIMIT) {
      throw new SyncError(
        "This snapshot is larger than the 100 MB GitHub allows in a single file.",
      );
    }

    const response = await this.request(this.contentsUrl, {
      method: "PUT",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `ChessVault snapshot ${new Date().toISOString()}`,
        content: utf8ToBase64(content),
        // Updating a file requires its current SHA; omitting it creates a new
        // one, and supplying a stale one is what GitHub rejects as a conflict.
        ...(expectedVersion ? { sha: expectedVersion } : {}),
        ...(this.config.branch ? { branch: this.config.branch } : {}),
      }),
    });

    // 409 is an explicit conflict; 422 is GitHub's response when the supplied
    // SHA does not match the current file — the same situation from our side.
    if (response.status === 409 || response.status === 422) {
      throw new SyncConflictError();
    }

    this.throwForStatus(response);

    const body = (await response.json()) as { content: { sha: string } };
    return body.content.sha;
  }

  /** Wrap network failures so callers see a SyncError, never a raw fetch throw. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch (cause) {
      throw new SyncError(
        `Could not reach GitHub: ${cause instanceof Error ? cause.message : "network error"}`,
      );
    }
  }

  private throwForStatus(response: Response): void {
    if (response.ok) return;

    if (response.status === 401) {
      throw new SyncAuthError("The GitHub token was rejected. Check it is valid.");
    }
    if (response.status === 403) {
      throw new SyncAuthError(
        "GitHub refused access. The token may lack contents permission, or a rate limit was hit.",
      );
    }
    // Named rather than left as a bare status: the upload carries the snapshot
    // base64-encoded, which is a third larger again, and "413" on its own gives
    // no hint that the database is what needs to shrink.
    if (response.status === 413) {
      throw new SyncError(
        "GitHub rejected the upload as too large. The database needs to shrink before it can sync.",
      );
    }

    throw new SyncError(`GitHub returned an unexpected status (${response.status}).`);
  }
}
