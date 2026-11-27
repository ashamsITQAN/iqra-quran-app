// Offline support. Pages of the app itself come from the network first (so a new build shows at once) and fall back to
// the last copy. The app's other files are served from this build's cache and refreshed behind. What the reader chose to
// keep for use without a connection lives in a cache of its own that outlives builds: the page keeps it in step with the
// sources by the hashes in data/offline.json, and it is read here whenever this build's cache has no copy.
const CACHE = "iqra-__BUILD__", KEPT = "iqra-offline";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "manifest.webmanifest", "icon-192.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== KEPT).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
const fonts = (u) => u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (fonts(u)) {   // the typefaces, so that text keeps its look without a connection
    e.respondWith(caches.open(KEPT).then((c) => c.match(r).then((hit) => { const net = fetch(r).then((res) => { if (res.ok || res.type === "opaque") c.put(r, res.clone()); return res; }).catch(() => hit); return hit || net; })));
    return;
  }
  if (u.origin !== location.origin) return;
  if (u.searchParams.has("h")) return;   // a file being fetched for keeping: always from the network
  if (r.mode === "navigate" || u.pathname.endsWith("version.json") || u.pathname.endsWith("data/offline.json")) {
    e.respondWith(fetch(r).then((res) => { if (res.ok && r.mode === "navigate") caches.open(CACHE).then((c) => c.put("./", res.clone())); return res; }).catch(() => caches.match(r.mode === "navigate" ? "./" : r, { ignoreSearch: r.mode !== "navigate" })));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(r).then(async (hit) => {
    if (hit) { fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); }).catch(() => {}); return hit; }
    const kept = await caches.open(KEPT).then((k) => k.match(r, { ignoreSearch: true }));
    if (kept) {   // kept current by the page; no copy is made in this build's cache
      if (kept.headers.get("x-iqra-enc") !== "gzip") return kept;
      return new Response(kept.body.pipeThrough(new DecompressionStream("gzip")), { headers: { "Content-Type": kept.headers.get("Content-Type") || "application/octet-stream" } });   // stored compressed to spare the device
    }
    return fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; });
  })));
});
