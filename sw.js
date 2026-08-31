// =============================================================================
// Treegens Game service worker — hardened static-shell cache.
//  · Caches ONLY the fixed same-origin app shell below (GET, no query string).
//  · API / session / save traffic is never cached: it is cross-origin AND
//    outside the shell allowlist, so it is excluded twice over.
//  · The cache name derives from CONFIG.version — every release activates into
//    a fresh cache and deletes all older ones, so both updates and rollbacks
//    take effect on the next load (sw.js itself is served with no-cache).
//  · Only `ok`, same-origin (`type: "basic"`) responses are stored; opaque,
//    error, and redirected-cross-origin responses can never poison the cache.
//  · On reset / restore / import the page asks for a full wipe + re-precache.
// =============================================================================

importScripts("config.js");

const CACHE = "treegens-static-" + CONFIG.version;

const SHELL = [
  "index.html", "styles.css", "manifest.json", "privacy.html", "terms.html",
  "icon.svg", "treegens-logo.svg", "apple-touch-icon.png", "banner.png",
  "three.min.js", "launch.js", "config.js", "state.js", "wallet.js", "net.js", "skins.js",
  "exif.js", "engine.js", "quests.js", "avatar.js", "character3d.js",
  "grove.js", "world3d.js", "worldmap.js", "minigames.js", "arcade.js", "app.js",
].map((p) => new URL(p, self.location).pathname);
const INDEX = new URL("index.html", self.location).pathname;

const precache = () =>
  caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((p) => c.add(p))));

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Reset / restore / import means a different save may take over this browser:
// drop every cache, then refill the shell from the network. Only same-origin
// pages can message their own service worker; the origin check is belt-and-braces.
self.addEventListener("message", (e) => {
  if (e.origin && e.origin !== self.location.origin) return;
  if (!e.data || e.data.type !== "tg-clear-caches") return;
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(precache)
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API/RPC/etc: browser only
  if (url.search) return;                          // keyed/query URLs: never cached
  const isNav = req.mode === "navigate";
  const inShell = SHELL.includes(url.pathname) || url.pathname === "/";
  if (!isNav && !inShell) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic" && inShell) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (isNav ? caches.match(INDEX) : undefined))
      )
  );
});
