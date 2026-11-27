// Offline support for the installed app. Pages of the app itself come from the network first (so a new build shows at
// once) and fall back to the last copy; everything else of the app is served from the cache and refreshed behind.
const CACHE = "iqra-__BUILD__";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "manifest.webmanifest", "icon-192.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (r.mode === "navigate" || u.pathname.endsWith("version.json")) {
    e.respondWith(fetch(r).then((res) => { if (res.ok && r.mode === "navigate") caches.open(CACHE).then((c) => c.put("./", res.clone())); return res; }).catch(() => caches.match(r.mode === "navigate" ? "./" : r)));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(r).then((hit) => {
    const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
