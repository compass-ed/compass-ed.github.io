/* Compass Ed offline support: keeps the app shell and any lesson, activity or page you have opened on this device.
   Pages: network first (fall back to the saved copy). Assets: saved copy first, refreshed in the background.
   Database calls are never cached here (the page keeps its own small cache of content it has read). */
const V = "ce-v8", SHELL = "ce-shell-" + V, RT = "ce-rt-" + V;
const CORE = ["./", "index.html", "about.html", "signin.html", "student/", "student/index.html", "teacher/", "teacher/index.html", "parent.html", "versions.html", "404.html", "privacy.html", "terms.html", "cookies.html", "consent.html", "manifest.webmanifest",
  "assets/app.css", "assets/config.js", "assets/core.js", "assets/campus.js", "assets/icons.js", "assets/demo.js", "assets/public.js", "assets/signin.js", "assets/student.js", "assets/teacher.js", "assets/parent.js",
  "assets/logo.svg", "assets/logo-white.svg", "assets/favicon.svg", "assets/art/signin-bg.jpg", "assets/art/band.jpg", "assets/versions/v2.4.svg", "assets/icon-192.png", "assets/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SHELL && x !== RT).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;             // database and fonts: always live
  if (e.request.mode === "navigate" || u.pathname.endsWith(".html")) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(SHELL).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(m => { const net = fetch(e.request).then(r => { const c = r.clone(); caches.open(RT).then(x => x.put(e.request, c)); return r; }).catch(() => m); return m || net; }));
});
