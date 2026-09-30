# ADR 0006 — Precache the whole build, update on consent

Status: accepted

## Context

The app is local-first: the data lives in the browser, and it should keep
working without a network. Without a service worker that was only half true.
The data survived, but the page, its scripts and the 7 MB engine had to be
downloaded again, so the app would not even open offline.

Installability matters for the data as well. Safari deletes the storage of
sites that have gone unused for seven days, except for apps added to the home
screen. Chrome is also far more willing to grant persistent storage to an
installed app. Installing requires a manifest.

The Next.js guide points to Serwist for offline support. Serwist needs a
webpack configuration, and this project builds with Turbopack.

## Options

| Option | Benefit | Cost |
|---|---|---|
| Serwist | Maintained, well-trodden | Requires webpack; would change the build tool for one feature |
| Runtime caching only | No build step | Offline works only for pages already visited; the engine is cached only after first use |
| Precache the whole export, hand-written worker | Everything works offline right after install; small and fully understood | A build step writes the file list into the worker |

## Decision

A hand-written worker (`public/sw.js`) caches every file of the static export
when it installs. `scripts/build-service-worker.mjs` runs after `next build`.
It writes in the file list and a version hashed from the contents of every
file. The whole export is about 9 MB, of which 7 MB is the engine.

- **One build at a time.** Pages and scripts are served from the cache of the
  build they came from. A page from one build loading a script from another is
  the classic way a cached web app breaks after a deployment.
- **Updates on consent.** A new build installs in the background and waits.
  The page offers a reload, and the worker takes over only once the user
  accepts. Taking over unasked would hand the running page foreign scripts, and
  reloading unasked could discard an unsaved annotation. The first
  installation reloads nothing.
- **Fresh and unredirected.** Files are fetched past the HTTP cache, so a
  copy from an earlier build cannot slip in. A redirected response is stored
  as if it had been served directly. Some hosts redirect `games/index.html` to
  `games/`, and browsers refuse to answer a navigation with a redirected
  response. Stored as it came, every page failed, online as well as offline.
  This showed up in testing against a local server with clean URLs.
- **Base path.** File paths are relative and resolved against the
  registration scope. The manifest and the registration go through `asset()`,
  so the same build works at a domain root and under `/<repo>/` on GitHub
  Pages.

## Consequences

- Every deployment changes the worker, and returning visitors see one update
  prompt. An unchanged build produces a byte-identical worker and no prompt.
- The first visit downloads the whole export once, about 9 MB. That is
  roughly what using the engine already cost, in exchange for working
  offline afterwards.
- The development server never registers the worker, so it cannot serve stale
  code while developing.
- Multi-threaded Stockfish through a header-synthesising worker (ADR 0002)
  would now have to share this worker's scope. That reinforces the decision
  recorded there.
