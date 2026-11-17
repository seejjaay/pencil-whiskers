/**
 * Source of the offline service worker, generated at build time (see vite.config.ts) with
 * a cache name unique to the build and the list of app-shell files to precache.
 *
 *   install   precache the small app shell, then take over without waiting
 *   activate  delete caches from older builds, claim open pages
 *   fetch     page navigations: network first (new deploys show up), cache when offline;
 *             everything else same-origin: cache first, then network (and remember it).
 *             Big files (MediaPipe wasm, hand model) are cached the first time the game
 *             fetches them, so the first visit doesn't download them twice.
 */
export function serviceWorkerSource(cache: string, shell: readonly string[]): string {
  return `// Generated at build time by vite.config.ts. Do not edit.
const CACHE = ${JSON.stringify(cache)};
const SHELL = ${JSON.stringify(shell)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pencil-whiskers-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function remember(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => remember(request, response))
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./'))),
    );
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((response) => remember(request, response))));
});
`;
}
