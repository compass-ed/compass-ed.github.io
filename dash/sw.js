/* Compass Dash offline support (v2.7.9). Upload this file next to index.html.
   It keeps the whole site on the device, so it opens and works without internet.
   - The page itself: the newest copy from the network. If the connection is missing, or slower than 3.5 seconds
     (patchy school Wi-Fi), the saved copy opens straight away and the newer one is saved for next time; open
     pages are then told a new version is ready so they can offer a refresh.
   - Icons, pictures, the app manifest, scripts and fonts: the saved copy straight away, refreshed in the background.
   - The trailer video and student account data (Supabase) always come from the network and are never saved here. */
const V = "v3", SHELL = "cd-shell-" + V, RT = "cd-rt-" + V, MAX_RT = 80, SLOW = 3500;
const CORE = ["./", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "compass-dash-trailer.jpg", "404.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL)
    .then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== SHELL && x !== RT).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

/* a page asks whether the site is saved here */
self.addEventListener("message", e => {
  if (e.data && e.data.type === "cd-status" && e.source)
    caches.match("./").then(m => e.source.postMessage({ type: "cd-status", saved: !!m }));
});

const tell = msg => self.clients.matchAll({ type: "window" }).then(L => L.forEach(c => c.postMessage(msg)));
const stamp = r => r && (r.headers.get("etag") || r.headers.get("last-modified") || "");

async function trim(name) {
  const c = await caches.open(name), k = await c.keys();
  for (let i = 0; i < k.length - MAX_RT; i++) await c.delete(k[i]);
}

/* the site's own page: network first, but never left waiting on a slow connection */
function page(e) {
  return caches.open(SHELL).then(async c => {
    const saved = await c.match("./");
    let usedSaved = false;
    const net = fetch(new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" })).then(async res => {   /* a navigation can't be re-fetched with options, so ask afresh (no-cache revalidates cheaply) */
      if (res && res.ok && res.type === "basic") {
        await c.put("./", res.clone());
        if (usedSaved && saved && stamp(saved) && stamp(res) && stamp(saved) !== stamp(res)) tell({ type: "cd-update" });
      }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    if (!saved) return net.catch(() => new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Offline · Compass Dash</title>" +
      "<body style='font:16px system-ui;padding:40px;text-align:center'><h1>You're offline</h1><p>Compass Dash hasn't been saved on this device yet. Open it once with internet and it will work offline after that.</p>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }));
    return Promise.race([
      net.then(r => r && r.ok ? r : (usedSaved = true, saved)).catch(() => (usedSaved = true, saved)),
      new Promise(r => setTimeout(() => { usedSaved = true; r(saved); }, SLOW))
    ]);
  });
}

/* anything else of ours: the saved copy now, a fresh one in the background */
async function staleWhileRevalidate(e, keepIn) {
  const hit = await caches.match(e.request, { ignoreSearch: true });
  const net = fetch(e.request).then(res => {
    if (res && (res.ok || res.type === "opaque") && res.status !== 206) {
      const cp = res.clone();
      caches.open(keepIn).then(c => c.put(e.request, cp)).then(() => keepIn === RT && trim(RT)).catch(() => {});
    }
    return res;
  });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

/* versioned files (fonts, libraries) never change: the saved copy if there is one */
async function cacheFirst(e) {
  const hit = await caches.match(e.request);
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res && (res.ok || res.type === "opaque")) { const cp = res.clone(); caches.open(RT).then(c => c.put(e.request, cp)).then(() => trim(RT)).catch(() => {}); }
  return res;
}

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.headers.has("range")) return;            /* video streaming and anything that changes data */
  const u = new URL(r.url), scope = new URL(self.registration.scope);
  if (/(^|\.)supabase\.co$/.test(u.hostname)) return;                    /* student account data: always live */
  if (u.origin === scope.origin) {
    if (r.destination === "video" || r.destination === "audio" || /\.(mp4|webm|mp3)$/i.test(u.pathname)) return;
    const root = u.pathname === scope.pathname || u.pathname === scope.pathname + "index.html";
    if (r.mode === "navigate" && root) return e.respondWith(page(e));
    if (r.mode === "navigate") return e.respondWith(fetch(r).catch(() => caches.match("./")));
    if (!u.pathname.startsWith(scope.pathname) || u.pathname.endsWith("/sw.js")) return;
    return e.respondWith(staleWhileRevalidate(e, CORE.some(p => scope.pathname + p.replace("./", "") === u.pathname) ? SHELL : RT));
  }
  if (u.hostname === "fonts.gstatic.com" || u.hostname === "cdnjs.cloudflare.com") return e.respondWith(cacheFirst(e));
  if (u.hostname === "fonts.googleapis.com") return e.respondWith(staleWhileRevalidate(e, RT));
});
