/* Compass Ed offline support: keeps the app shell and any lesson, activity or page you have opened on this device.
   Pages: network first (fall back to the saved copy). Assets: saved copy first, refreshed in the background.
   Database calls are never cached here (the page keeps its own small cache of content it has read). */
const V = "ce-v34", SHELL = "ce-shell-" + V, RT = "ce-rt-" + V;
const CORE = ["./", "index.html", "about.html", "signin.html", "student/", "student/index.html", "teacher/", "teacher/index.html", "parent.html", "versions.html", "404.html", "privacy.html", "terms.html", "cookies.html", "consent.html", "manifest.webmanifest",
  "assets/app.css", "assets/tx.js", "assets/i18n.js", "assets/i18n/fr.js", "assets/i18n/ar.js", "assets/config.js", "assets/core.js", "assets/campus.js", "assets/icons.js", "assets/demo.js", "assets/public.js", "assets/home.js", "assets/signin.js", "assets/student.js", "assets/teacher.js", "assets/parent.js",
  "assets/logo.svg", "assets/logo-white.svg", "assets/favicon.svg", "assets/art/book.svg", "assets/art/dial.svg", "assets/art/stage-geo.svg", "assets/art/sting.svg", "assets/art/subj/maths.svg", "assets/art/subj/english.svg", "assets/art/subj/science.svg", "assets/art/subj/geography.svg", "assets/art/subj/history.svg", "assets/art/subj/computing.svg", "assets/art/subj/art.svg", "assets/art/subj/music.svg", "assets/art/subj/languages.svg", "assets/art/subj/pe.svg", "assets/art/subj/drama.svg", "assets/versions/v2.4.svg", "assets/icon-192.png", "assets/icon-512.png", "assets/art/compass-rose.png", "assets/art/compass-needle.png"];
/* Take over immediately so a new version applies on the very next load; the shell is cached right after activation. */
self.addEventListener("install", e => { e.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith("ce-") && x !== SHELL && x !== RT).map(x => caches.delete(x)))).then(() => self.clients.claim())
  .then(() => caches.open(SHELL).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))))); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;             // database and fonts: always live
  /* Videos, range requests and Vercel's own analytics scripts go straight to the network: streaming a 20 MB trailer into the
     cache kept the old worker busy for a minute and held up every update, and the scripts must never be served stale. */
  if (/\.(mp4|webm|m4a|mp3|ogg)$/i.test(u.pathname) || e.request.headers.has("range") || u.pathname.startsWith("/_vercel/")) return;
  if (e.request.mode === "navigate" || u.pathname.endsWith(".html")) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(SHELL).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(e.request).then(m => { const net = fetch(e.request).then(r => { const c = r.clone(); caches.open(RT).then(x => x.put(e.request, c)); return r; }).catch(() => m); return m || net; }));
});
/* Deadline reminders (v2.9): the ed-remind function sends {title, body, url, tag}; tapping one opens that piece of work. */
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || "Compass Ed", { body: d.body || "", icon: "assets/icon-192.png", tag: d.tag || "ce", data: { url: d.url || "student/" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "student/", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window" }).then(ws => {
    const w = ws.find(c => c.url.split("#")[0] === url.split("#")[0]);
    return w ? w.focus().then(c => c.navigate ? c.navigate(url) : c).catch(() => self.clients.openWindow(url)) : self.clients.openWindow(url);   // navigate() fails on a tab this worker doesn't control
  }));
});
