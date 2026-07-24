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
 * The GitHub contents API returns file bodies base64-encoded, and only up to
 * about a megabyte. Beyond that the body arrives empty and the blobs API would
 * be needed instead. A snapshot that large is refused with a clear message
 * rather than failing obscurely; compression or the blobs API is the path if it
 * becomes a real limit.
 */
const CONTENTS_API_SIZE_LIMIT = 1_000_000;

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
 * GitHub's contents API is the whole backend: it holds the file, versions it by
 * blob SHA, and enforces access through the token. Nothing is run by us. The
 * SHA doubles as the optimistic-concurrency token — a push must supply the SHA
 * it expects to replace, and GitHub rejects the write if the file has moved on.
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

    if (!body.content && (body.size ?? 0) > CONTENTS_API_SIZE_LIMIT) {
      throw new SyncError(
        "The cloud snapshot is too large for GitHub's contents API. This can happen with a very large database.",
      );
    }

    return { content: base64ToUtf8(body.content ?? ""), version: body.sha };
  }

  async push(content: string, expectedVersion: string | null): Promise<string> {
    if (encoder.encode(content).length > CONTENTS_API_SIZE_LIMIT) {
      throw new SyncError(
        "This snapshot is too large for GitHub's contents API. A very large or corrupted game can inflate it.",
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

    throw new SyncError(`GitHub returned an unexpected status (${response.status}).`);
  }
}
