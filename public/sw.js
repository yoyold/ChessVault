/**
 * Service worker: makes the application work without a network.
 *
 * Everything the static export produced is cached when the worker installs —
 * every page, every script, and the chess engine — so once the app has been
 * opened online it opens offline too, engine included.
 *
 * The file list is written into this worker at build time by
 * `scripts/build-service-worker.mjs`, together with a version derived from the
 * contents of every file. A new deployment therefore always means a new
 * worker, which is how the browser learns there is an update at all.
 *
 * Pages and the scripts they load are served from the cache of the build they
 * belong to, never mixed: a page from one build asking for a script from
 * another is how a cached web app breaks after a deployment. A new build is
 * taken up only when the page asks for it, after the user has agreed to reload.
 */

// Replaced at build time. The development server never registers this worker.
const MANIFEST = { version: "development", files: [] };

const CACHE_PREFIX = "chessvault-";
const CACHE = `${CACHE_PREFIX}${MANIFEST.version}`;

/** The URL the app is served from, including a GitHub Pages project path. */
const SCOPE = new URL(self.registration.scope);

function inScope(path) {
  return new URL(path, SCOPE).href;
}

/**
 * Fetch one file of the build and store it.
 *
 * Fetched past the HTTP cache: a copy cached from an earlier build would put
 * one old file among new ones, which is precisely the mix this worker exists to
 * prevent.
 *
 * A redirected response is stored as if it had been served directly. Some
 * hosts answer `games/index.html` by redirecting to `games/`, and the browser
 * refuses a redirected response as the answer to a navigation — it shows its
 * network error page instead. Cached as it came, every page would have failed
 * the same way, online as well as off, because pages are served from here.
 */
async function precache(cache, path) {
  const response = await fetch(inScope(path), { cache: "reload" });
  if (!response.ok) throw new Error(`Could not cache ${path}: HTTP ${response.status}`);

  const stored = response.redirected
    ? new Response(await response.blob(), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response;

  await cache.put(inScope(path), stored);
}

self.addEventListener("install", (event) => {
  // All or nothing: one file failing fails the install, so a worker is never
  // installed with half an application behind it.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(MANIFEST.files.map((path) => precache(cache, path)))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Sent by the page once the user has agreed to load the new version.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/**
 * Where a request's answer lives in the cache.
 *
 * The export is directory-style: `/games/` is served by `games/index.html`,
 * and a visit to `/games` without the slash is the same page. Anything else is
 * cached under its own URL.
 */
function cacheKeys(url, isNavigation) {
  if (!isNavigation) return [url.href];

  const path = url.pathname;
  if (path.endsWith("/")) return [new URL(`${path}index.html`, url).href];
  if (!/\.[a-z0-9]+$/i.test(path)) return [new URL(`${path}/index.html`, url).href];

  return [url.href];
}

async function respond(request, url) {
  const cache = await caches.open(CACHE);
  const isNavigation = request.mode === "navigate";

  // Query strings are ignored: `?game=12` selects data inside the page, and the
  // router's `?_rsc=` parameter only defeats HTTP caches. Neither names a
  // different file.
  for (const key of cacheKeys(url, isNavigation)) {
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
  }

  try {
    return await fetch(request);
  } catch (error) {
    // Offline and not cached. A page gets the app's own not-found page rather
    // than the browser's offline error.
    if (isNavigation) {
      const notFound =
        (await cache.match(inScope("404.html"))) ?? (await cache.match(inScope("404/index.html")));
      if (notFound) return notFound;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only the app's own files. The GitHub API used for sync, and anything else
  // off-site, goes to the network untouched.
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  event.respondWith(respond(request, url));
});
