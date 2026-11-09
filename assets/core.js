/* Compass Ed core: API access, sessions, small UI helpers, hash router. Shared by every page. */
(function () {
  const C = window.CE_CONFIG || {};
  const qs = new URLSearchParams(location.search);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let demo = false;
  try {
    if (qs.get("demo") === "0") localStorage.removeItem("ce_demo");
    else if (qs.get("demo") === "1") localStorage.setItem("ce_demo", "1");
    demo = !!C.allowDemo && (local || localStorage.getItem("ce_demo") === "1");
  } catch (e) { demo = !!C.allowDemo && local; }

  const ROOT = /\/(student|teacher)\/[^/]*$/.test(location.pathname) ? "../" : "";
  const CE = window.CE = Object.assign(window.CE || {}, { cfg: C, demo, subjects: [], categories: [], me: null, root: ROOT, PORTAL: { student: ROOT + "student/", teacher: ROOT + "teacher/" } });

  /* ---------- API ---------- */
  CE.api = async function (fn, args) {
    if (demo && window.CE_DEMO) return window.CE_DEMO.call(fn, args || {});
    if (!C.supabaseUrl || !C.supabaseKey) throw new Error("not_configured");
    const h = { "Content-Type": "application/json", apikey: C.supabaseKey };
    if (/^eyJ/.test(C.supabaseKey)) h.Authorization = "Bearer " + C.supabaseKey;
    const r = await fetch(C.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn, { method: "POST", headers: h, body: JSON.stringify(args || {}) });
    if (r.status === 404) throw new Error("db_not_set_up");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };
  CE.errText = function (e) {
    const m = typeof e === "string" ? e : (e && (e.error || e.message)) || "";
    return ({
      no_match: "That username and password do not match.",
      locked: "Too many tries. Wait a minute, then try again.",
      disabled: "This account has been switched off. Ask a teacher.",
      bad_key: "Your session has ended. Sign in again.",
      forbidden: "You do not have access to that.",
      not_found: "That item is no longer available.",
      bad_code: "That code is not right. Check it with your teacher.",
      bad_user: "Usernames are 3 to 24 letters, numbers, dots or underscores.",
      bad_pw: "Passwords need at least 8 characters.",
      taken: "That username is already taken. Try another.",
      no_class: "That class does not exist.",
      closed: "This competition is not open for entries.",
      db_not_set_up: "The Compass Ed database is not set up yet. Run supabase/compassed-v2.0.sql in Supabase (see README).",
      not_configured: "No database configured. Add the Supabase URL and key in assets/config.js.",
      consent: "Tick the boxes to accept the Terms of Service and Privacy Policy first.",
      cd_no_match: "Compass Dash did not recognise that student code and username.",
      no_compassdash: "Compass Dash is not installed in this database.",
      no_http: "Calendar feeds need the database's http extension. In Supabase open Database > Extensions, enable \"http\", then try again.",
      feed_fetch: "The feed could not be fetched. Check that the address opens in a browser and is an .ics calendar link.",
      feed_format: "That address is not an iCalendar (.ics) feed.",
      mirrored: "This event comes from a calendar feed. Change it in the source calendar, or remove the feed.",
      no_free_codes: "No free codes are left.",
      too_many: "You have sent feedback very recently. Wait half a minute and try again.",
      bad_rating: "Choose a star rating first.",
      too_big: "That is too long to save.", empty: "Write something or add a link first.",
      graded: "This work has been marked. Hand in a new version if your teacher asked for one.",
      bad_text: "Please check the text: something is missing or too long.",
      "Failed to fetch": "No connection. Check your internet and try again."
    })[m] || (m ? "Something went wrong (" + m + ")." : "Something went wrong.");
  };

  /* ---------- session (one model for every role) ---------- */
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  CE.LS = LS;
  const pushSub = () => "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration().then(r => r && r.pushManager && r.pushManager.getSubscription()) : Promise.resolve(null);
  const parentPush = () => { try { return Object.keys(localStorage).some(k => k.startsWith("ce_pp_")); } catch (e) { return false; } };   // a parent link turned its weekly summary on here (parent.js)
  const IDLE = 20 * 60 * 1000;   // staff sessions lock in this browser after 20 minutes without use
  // one sign-in with Compass Dash: leaving Compass Ed also ends a Teacher Panel session open in this tab
  // (Compass Dash signs its student account out by itself the next time it opens without this session)
  const dashOut = () => { try { const k = sessionStorage.getItem("cdAK") || ""; if (/^t:/.test(k) && !demo) CE.api("cd_t_logout", { p_key: k }).catch(() => {}); ["cdAK", "cdAKt", "cdT", "cdCE"].forEach(x => sessionStorage.removeItem(x));
    Object.keys(sessionStorage).forEach(x => x.startsWith("ce_off_") && sessionStorage.removeItem(x)); } catch (e) {} };   // the offline copies belong to the person leaving
  CE.auth = {
    get() {
      const s = LS.get("ce_auth"); if (!s || !s.tok) return null;
      if (s.me && s.me.role !== "student" && Date.now() - (s.at || 0) > IDLE) { LS.del("ce_auth"); dashOut(); return null; }
      s.at = Date.now(); LS.set("ce_auth", s); return s;
    },
    set(tok, me) { LS.set("ce_auth", { tok, me, at: Date.now() }); },
    clear() { const t = (LS.get("ce_auth") || {}).tok; if (t) { const q = (LS.get("cgOutbox") || []).filter(x => !(x.body && x.body.p_key === t)); q.length ? LS.set("cgOutbox", q) : LS.del("cgOutbox"); }   // Compass Dash's offline queue may hold this session's homework scores
      LS.del("ce_auth"); dashOut();   // and stop deadline reminders reaching this device for the next person who signs in
      if (!parentPush()) try { pushSub().then(x => x && x.unsubscribe()).catch(() => {}); } catch (e) {} },   // a parent's weekly summary shares the subscription: CE.signOut then drops only this account's reminders
    args() { const s = CE.auth.get(); return s ? { p_key: s.tok } : {}; }
  };
  CE.capi = async (fn, a) => {
    const r = await CE.api(fn, Object.assign(CE.auth.args(), a || {}));
    if (r && r.error === "bad_key") { CE.auth.clear(); location.replace(ROOT + "signin.html"); throw new Error("bad_key"); }
    return r;
  };
  // shortcut: a session the server already ended (bad_key) can't drop its reminder row, so with a parent's summary on, that student's reminders keep reaching this device until another student turns reminders on here; fine for a family phone
  CE.signOut = async function () { const s = CE.auth.get();
    if (s) { if (parentPush()) await Promise.race([pushSub().then(x => x && CE.api("ed_s_push_del", { p_key: s.tok, p_endpoint: x.endpoint })), new Promise(r => setTimeout(r, 3000))]).catch(() => {});   // never hold up signing out
      CE.api("ed_logout", { p_key: s.tok }).catch(() => {}); }
    CE.auth.clear(); CE.go(ROOT + "signin.html"); };
  /* Load the profile (and lists) for a portal page. Redirects to sign-in when there is no session or the wrong role. */
  CE.requireRole = async function (roles) {
    const s = CE.auth.get();
    if (!s) { location.replace(ROOT + "signin.html?next=" + encodeURIComponent((/\/teacher\//.test(location.pathname) ? "teacher" : "student") + location.hash)); return null; }
    let me = s.me;
    try { const r = await CE.capi("ed_me"); if (r.ok) { me = r; CE.auth.set(s.tok, r); } } catch (e) { if (e.message === "bad_key") return null; }
    if (!roles.includes(me.role)) { location.replace(me.role === "student" ? CE.PORTAL.student : CE.PORTAL.teacher); return null; }
    CE.me = me; CE.subjects = me.subjects || []; CE.categories = me.categories || [];
    if (me.must_pw) await CE.gatePassword();
    if (!(me.consent && me.consent.terms)) await CE.gateConsent(me);
    setTimeout(() => CE.feedbackButton && CE.feedbackButton(), 0);
    return me;
  };
  /* ---------- gates: full-screen steps that must be completed before the portal opens ---------- */
  CE.gate = (content) => { let g = CE.$("#gate"); if (!g) { g = CE.h("div", { id: "gate", class: "gate" }); document.body.append(g); } g.innerHTML = ""; g.append(CE.h("div", { class: "box", role: "dialog", "aria-modal": "true" }, content)); return g; };
  CE.ungate = () => { const g = CE.$("#gate"); if (g) g.remove(); };
  CE.gatePassword = () => new Promise(res => {
    const h = CE.h, pw = h("input", { class: "in", type: "password", autocomplete: "new-password", minlength: 8, placeholder: "At least 8 characters" }), pw2 = h("input", { class: "in", type: "password", autocomplete: "new-password" }), er = h("div", { class: "err" });
    const go = async () => { er.textContent = ""; if (pw.value.length < 8) return er.textContent = CE.errText("bad_pw"); if (pw.value !== pw2.value) return er.textContent = "The two passwords are not the same."; const r = await CE.capi("ed_pw_set", { p_new: pw.value }); if (!r.ok) return er.textContent = CE.errText(r); CE.toast("Password set", "ok"); CE.ungate(); res(); };
    CE.gate(h("form", { class: "stack", onsubmit: e => { e.preventDefault(); go(); } }, h("span", { class: "kicker" }, "One more step"), h("h2", { style: { margin: 0 } }, "Set a new password"), h("p", { class: "sm mut", style: { margin: 0 } }, "You signed in with a code, so choose the password you will use from now on. Your code keeps working too, until a teacher revokes it."), h("label", { class: "f" }, "New password", pw), h("label", { class: "f" }, "Type it again", pw2), er, h("button", { class: "btn cyan lg w", type: "submit" }, "Save password"), h("button", { class: "btn ghost w", type: "button", onclick: CE.signOut }, "Sign out instead")));
    pw.focus();
  });
  CE.gateConsent = (me) => new Promise(res => {
    const h = CE.h, t = h("input", { type: "checkbox" }), p = h("input", { type: "checkbox" }), par = h("input", { type: "checkbox" }), er = h("div", { class: "err" });
    const go = async () => { er.textContent = ""; if (!t.checked || !p.checked) return er.textContent = CE.errText("consent"); const r = await CE.capi("ed_consent", { p_terms: true, p_privacy: true, p_parent: par.checked }); if (!r.ok) return er.textContent = CE.errText(r); if (CE.me) CE.me.consent = r.consent; const s = CE.auth.get(); if (s && s.me) { s.me.consent = r.consent; CE.auth.set(s.tok, s.me); } CE.ungate(); res(); };
    CE.gate(h("form", { class: "stack", onsubmit: e => { e.preventDefault(); go(); } }, h("span", { class: "kicker" }, "Before you carry on"), h("h2", { style: { margin: 0 } }, "A quick agreement"), h("p", { class: "sm mut", style: { margin: 0 } }, "Compass Ed keeps your name, username, class, work, points and uploads so the site can work. Nothing is sold or used for advertising. Please read and accept these two documents."),
      h("label", { class: "chk" }, t, h("span", {}, "I accept the ", h("a", { href: ROOT + "terms.html", target: "_blank" }, "Terms of Service"))),
      h("label", { class: "chk" }, p, h("span", {}, "I have read the ", h("a", { href: ROOT + "privacy.html", target: "_blank" }, "Privacy Policy"))),
      me.role === "student" ? h("label", { class: "chk" }, par, h("span", { class: "sm" }, "I am under 13 and a parent or carer has agreed to this (", h("a", { href: ROOT + "consent.html", target: "_blank" }, "consent form"), ")")) : null,
      er, h("button", { class: "btn cyan lg w", type: "submit" }, "Agree and continue"), h("button", { class: "btn ghost w", type: "button", onclick: CE.signOut }, "Sign out")));
  });
  /* ---------- cookie notice (essential storage only; shown once) ---------- */
  CE.cookieBanner = () => {
    if (LS.get("ce_cookie_ok") || /parent\.html$/.test(location.pathname)) return;
    const h = CE.h, b = h("div", { class: "cookie", role: "region", "aria-label": "Cookies and storage" },
      h("div", { class: "grow" }, h("b", {}, "Only essential storage."), " Compass Ed uses your browser's storage to keep you signed in and remember your display settings. No advertising, no tracking cookies. ", h("a", { href: ROOT + "cookies.html" }, "Cookie Policy")),
      h("button", { class: "btn sm cyan", onclick: () => { LS.set("ce_cookie_ok", { at: Date.now(), v: 1 }); b.remove(); } }, "OK"));
    document.body.append(b);
  };


  /* ---------- helpers ---------- */
  CE.$ = (s, r) => (r || document).querySelector(s);
  CE.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  CE.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  CE.h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (k === "html") el.innerHTML = v; else if (k === "style" && typeof v === "object") Object.assign(el.style, v); else el.setAttribute(k, v === true ? "" : v); }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
    return el;
  };
  CE.subj = id => CE.subjects.find(x => x.id === id) || { id, name: "Subject", icon: "book" };
  CE.subjName = id => CE.subj(id).name; CE.subjIcon = id => CE.icon(CE.subj(id).icon);
  CE.cat = id => CE.categories.find(x => x.id === id) || { id, name: "Campus", icon: "compass" };
  CE.catName = id => CE.cat(id).name; CE.catIcon = id => CE.icon(CE.cat(id).icon);
  const D = CE.date = {
    parse: v => v ? new Date(v) : null,
    short: v => { const d = D.parse(v); return d ? d.toLocaleDateString((CE.locale || "en-GB"), { weekday: "short", day: "numeric", month: "short" }) : ""; },
    long: v => { const d = D.parse(v); return d ? d.toLocaleDateString((CE.locale || "en-GB"), { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""; },
    time: v => { const d = D.parse(v); return d ? d.toLocaleTimeString((CE.locale || "en-GB"), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : ""; },
    dt: v => { const d = D.parse(v); if (!d) return ""; const t = D.time(v); return D.short(v) + (t === "00:00" || t === "23:59" ? "" : ", " + t); },
    ago: v => { const d = D.parse(v); if (!d) return "never"; const m = Math.round((Date.now() - d) / 60000); if (m < 1) return "just now"; if (m < 60) return m + " min ago"; const h = Math.round(m / 60); if (h < 24) return h + " h ago"; const dd = Math.round(h / 24); if (dd < 7) return dd + " day" + (dd > 1 ? "s" : "") + " ago"; return D.short(v); },
    until: v => { const d = D.parse(v); if (!d) return ""; const ms = d - Date.now(); const h = Math.round(ms / 3600000); if (ms < 0) return "overdue"; if (h < 1) return "due within the hour"; if (h < 24) return "due in " + h + " h"; const dd = Math.round(h / 24); return "due in " + dd + " day" + (dd > 1 ? "s" : ""); },
    left: v => { const d = D.parse(v); if (!d) return ""; const ms = d - Date.now(); if (ms < 0) return "closed"; const h = Math.round(ms / 3600000); if (h < 24) return h + " h left"; const dd = Math.round(h / 24); return dd + " day" + (dd > 1 ? "s" : "") + " left"; },
    ymd: d => { d = d instanceof Date ? d : new Date(d); const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); },
    local: v => { const d = D.parse(v); if (!d) return ""; const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); }
  };
  CE.pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  CE.initials = n => String(n || "?").replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "?";

  let toastT;
  CE.toast = (msg, kind) => {
    let t = CE.$("#toast"); if (!t) { t = CE.h("div", { id: "toast", class: "toast", role: "status" }); document.body.append(t); }
    t.textContent = msg; t.className = "toast show " + (kind || ""); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200);
  };
  CE.modal = (content, opts) => {
    opts = opts || {};
    let m = CE.$("#modal"); if (!m) { m = CE.h("div", { id: "modal", class: "modal", onclick: e => { if (e.target === m && !m.dataset.lock) CE.closeModal(); } }); document.body.append(m); }
    const box = CE.h("div", { class: "box" + (opts.wide ? " wide" : ""), role: "dialog", "aria-modal": "true" }, CE.h("button", { class: "ib x", "aria-label": "Close", onclick: CE.closeModal }, CE.icon("cross")));
    if (typeof content === "string") box.insertAdjacentHTML("beforeend", content); else box.append(content);
    if (!m.contains(document.activeElement)) m._back = document.activeElement;   // where focus goes back to when it closes
    m.innerHTML = ""; m.append(box); m.classList.add("show"); m.dataset.lock = opts.lock ? "1" : "";
    const f = box.querySelector("input,textarea,select,button:not(.x)"); if (f) setTimeout(() => f.focus(), 30);
    return box;
  };
  CE.closeModal = () => { const m = CE.$("#modal"); if (m) { m.classList.remove("show"); m.innerHTML = ""; if (m._back && m._back.isConnected) m._back.focus(); m._back = null; } };
  CE.confirm = (text, okLabel) => new Promise(res => {
    CE.modal(CE.h("div", { class: "stack" }, CE.h("h3", {}, "Are you sure?"), CE.h("p", {}, text),
      CE.h("div", { class: "row" }, CE.h("button", { class: "btn bad", onclick: () => { CE.closeModal(); res(true); } }, okLabel || "Yes, do it"), CE.h("button", { class: "btn ghost", onclick: () => { CE.closeModal(); res(false); } }, "Cancel"))));
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") CE.closeModal(); });

  CE.rich = s => CE.esc(s || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .split(/\n{2,}/).map(p => /^(- |• )/m.test(p) ? "<ul>" + p.split(/\n/).map(l => "<li>" + l.replace(/^(- |• )/, "") + "</li>").join("") + "</ul>" : "<p>" + p.replace(/\n/g, "<br>") + "</p>").join("");

  /* Render lesson / activity blocks (text, heading, list, key, check, video, link, image) */
  CE.blocks = blocks => {
    const h = CE.h, wrap = h("div", { class: "lesson" });
    (blocks || []).forEach(b => {
      const el = h("div", { class: "blk" });
      if (b.t === "heading") el.append(h("h3", {}, b.text));
      else if (b.t === "text") el.innerHTML = CE.rich(b.text);
      else if (b.t === "list") el.append(h("ul", {}, ...(b.items || []).map(i => h("li", { html: CE.rich(i).replace(/^<p>|<\/p>$/g, "") }))));
      else if (b.t === "key") el.append(h("div", { class: "key" }, h("b", {}, "Key point" + (b.q ? ": " + b.q : "")), h("div", {}, b.text)));
      else if (b.t === "image") { const u = String(b.url || ""); if (/^https:\/\//.test(u)) el.append(h("figure", { class: "fig" }, h("img", { src: u, alt: b.text || "", loading: "lazy" }), b.text ? h("figcaption", { class: "sm mut" }, b.text) : null)); }
      else if (b.t === "video") { const u = String(b.url || ""); const ok = /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(u); el.append(ok ? h("div", { class: "vid" }, h("iframe", { src: u, title: b.text || "Video", allow: "accelerometer; encrypted-media; picture-in-picture", allowfullscreen: true, loading: "lazy" })) : h("a", { class: "item", href: u, target: "_blank", rel: "noopener" }, CE.icon("play"), b.text || u), b.text && ok ? h("div", { class: "sm mut", style: { marginTop: "6px" } }, b.text) : null); }
      else if (b.t === "link") el.append(h("a", { class: "item", href: b.url, target: "_blank", rel: "noopener" }, h("div", { class: "ico sm" }, CE.icon("link")), h("div", { class: "grow" }, h("div", { class: "t" }, b.text || b.url), h("div", { class: "s" }, b.url))));
      else if (b.t === "check") { const q = h("div", { class: "card flat q" }, h("div", { class: "b" }, "Quick check: " + b.q)); (b.a || []).forEach((opt, i) => q.append(h("button", { class: "opt", onclick: () => { if (q.dataset.done) return; q.dataset.done = 1; CE.$$(".opt", q).forEach((o, j) => o.classList.add(j === b.c ? "ok" : j === i ? "bad" : "x")); q.append(h("div", { class: "sm " + (i === b.c ? "cy b" : "mut") }, i === b.c ? "Correct!" : "Not quite. The answer is " + b.a[b.c] + ".")); } }, h("span", { class: "k" }, "ABCD"[i]), opt))); el.append(q); }
      wrap.append(el);
    });
    return wrap;
  };
  /* ---------- read aloud: the browser's own voices. The voice follows the language of the text itself, because a
     lesson is usually written in English even when the page around it is in French or Arabic. ---------- */
  CE.plain = html => new DOMParser().parseFromString(String(html || "").replace(/<br\s*\/?>|<\/(p|li|h\d)>/gi, "$&\n"), "text/html").body.textContent || "";   // keep line breaks so sentences don't run together
  CE.blocksText = blocks => (blocks || []).map(b => b.t === "heading" ? b.text : b.t === "text" ? CE.plain(CE.rich(b.text)) : b.t === "list" ? (b.items || []).map(i => CE.plain(CE.rich(i))).join("\n")
    : b.t === "key" ? [b.q, b.text].filter(Boolean).join("\n") : b.t === "check" ? b.q : b.t === "image" ? b.text : "").filter(Boolean).join("\n");   // never the quiz answer buttons
  const SAY = window.speechSynthesis;
  const sayLang = t => {
    if ((t.match(/[؀-ۿ]/g) || []).length > (t.match(/[A-Za-z]/g) || []).length) return "ar";
    const fr = (t.match(/\b(le|la|les|des|de|du|un|une|est|et|en|sur|pas|ne|pour|que|dans|vous|au|avec)\b|\bl'|[éèêàçùœ]/gi) || []).length, en = (t.match(/\b(the|and|is|to|of|in|for|you|that|with|it)\b/gi) || []).length;
    return fr > en ? "fr" : fr < en ? "en" : CE.lang === "fr" ? "fr" : "en";   // a tie follows the page language
  };
  let saying = null;   // { btn, label }
  CE.sayStop = () => { if (!SAY) return; SAY.cancel(); if (saying) { const s = saying; saying = null; s.label(false); } };
  CE.readAloud = getText => {   // a Listen / Stop button, or null where the browser cannot speak
    if (!SAY || !window.SpeechSynthesisUtterance) return null;
    const btn = CE.h("button", { class: "btn sm ghost say", type: "button" });
    const label = on => { btn.replaceChildren(CE.icon(on ? "stop" : "volume"), CE.t(on ? "Stop" : "Listen")); btn.classList.toggle("on", on); };   // the label already says Listen or Stop
    btn.onclick = () => {
      const mine = saying && saying.btn === btn; CE.sayStop(); if (mine) return;
      const text = String(getText() || "").replace(/[ \t]+/g, " ").trim(); if (!text) return;
      const lang = sayLang(text), pref = { en: "en-gb", fr: "fr-fr", ar: "ar-sa" }[lang], vs = SAY.getVoices(), rate = +CE.prefs.get().sayRate || 1;
      const voice = vs.find(v => (v.lang || "").toLowerCase().replace("_", "-") === pref) || vs.find(v => (v.lang || "").toLowerCase().startsWith(lang));
      const chunks = [];   // Chrome stops a long utterance after about 15 seconds, so speak a sentence or two at a time
      (text.match(/(?:[^.!?؟…\n]|[.!?؟…](?=\S))+[.!?؟…]*\n*/g) || [text]).forEach(s => (s.trim().match(/.{1,200}(?:\s|$)|.{1,200}/g) || []).forEach(p => {   // "3.14" and web addresses stay whole; a very long sentence is cut at a space
        p = p.trim(); if (!p) return; if (chunks.length && (chunks[chunks.length - 1] + " " + p).length < 220) chunks[chunks.length - 1] += " " + p; else chunks.push(p); }));
      saying = { btn, label }; label(true);
      chunks.forEach((c, i) => { const u = new SpeechSynthesisUtterance(c); u.lang = voice ? voice.lang : pref; if (voice) u.voice = voice; u.rate = rate;
        if (i === chunks.length - 1) u.onend = u.onerror = () => { if (saying && saying.btn === btn) { saying = null; label(false); } }; SAY.speak(u); });
    };
    label(false); return btn;
  };
  if (SAY) { addEventListener("hashchange", () => CE.sayStop()); addEventListener("pagehide", () => CE.sayStop()); }

  /* ---------- a switch for notifications on this device (v2.9): deadline reminders for students, the weekly summary for
     parents. It shows only once the school's sender is running (st.ready), and each visit refreshes the device's language and
     time zone. o: { title, text, on (the confirmation shown once), status(endpoint), save(keys), del(endpoint) } ---------- */
  const b64key = k => Uint8Array.from(atob(k.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - k.length % 4) % 4)), c => c.charCodeAt(0));
  CE.pushKeys = s => { const j = s.toJSON(); return { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_lang: CE.lang || "en", p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }; };
  CE.pushCard = async o => {
    const h = CE.h, key = CE.cfg.vapidPublicKey, can = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const reg = can ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
    let sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    const st = await o.status(sub ? sub.endpoint : "").catch(() => null);
    if (!key || !st || !st.ok || !(st.ready || CE.demo)) return null;
    if (sub && st.on) o.save(CE.pushKeys(sub)).catch(() => {});   // keeps the language and time zone up to date
    const box = h("div", { class: "stack" });
    const toggle = async cb => { cb.disabled = true;
      try {
        if (cb.checked) {
          if (await Notification.requestPermission() !== "granted") { draw(false); return CE.toast("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.", "bad"); }
          const opt = { userVisibleOnly: true, applicationServerKey: b64key(key) };
          sub = await reg.pushManager.subscribe(opt).catch(async e => { if (e.name !== "InvalidStateError" || !sub) throw e; await sub.unsubscribe(); return reg.pushManager.subscribe(opt); });   // made with an older key: start again
          const x = await o.save(CE.pushKeys(sub)); if (!x.ok) throw new Error(CE.errText(x));
          reg.showNotification("Compass Ed", { body: CE.t(o.on), icon: CE.root + "assets/icon-192.png", tag: "push-on" }).catch(() => {});
          draw(true);
        } else { if (sub) { const x = await o.del(sub.endpoint); if (!x || !x.ok) throw new Error(CE.errText(x)); } draw(false); }   // the browser subscription stays: other children's summaries or a student's reminders may share it
      } catch (e) { draw(!cb.checked); CE.toast(String(e.message || e), "bad"); }
      finally { const i = box.querySelector("input"); if (i) i.focus(); } };   // the switch is redrawn: keep keyboard focus on it
    const draw = on => box.replaceChildren(h("div", { class: "row between" }, h("div", {}, h("b", {}, o.title), h("div", { class: "sm mut" }, o.text)),
        reg && !CE.demo ? h("label", { class: "chk" }, h("input", { type: "checkbox", checked: on, "aria-label": o.title, onchange: e => toggle(e.target) }), on ? "On" : "Off") : null),
      !reg || CE.demo ? h("p", { class: "xs mut", style: { margin: 0 } }, CE.demo ? "Preview: the sample campus can't send reminders." : /iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? "On iPhone or iPad, add Compass Ed to your Home Screen first (Share, then Add to Home Screen) and turn reminders on there." : "This browser can't show reminders.") : null);
    draw(!!(sub && st.on)); return box;
  };

  /* ---------- the year portfolio (v2.9): one school year of a student's record, shared by both portals and made to print ---------- */
  CE.ayLabel = y => y + "/" + String(y + 1).slice(2);   // a slash keeps "2026/27" in order inside Arabic text; a dash flips it
  CE.GOAL_ST = { active: ["In progress", ""], done: ["Achieved", "ok"], dropped: ["Let go", "warn"] };
  CE.portfolio = (r, href) => {
    const h = CE.h, D = CE.date, s = r.student, TERMS = ["Autumn term", "Spring term", "Summer term"], PLACE = ["", "1st place", "2nd place", "3rd place"];
    const sec = (title, ...kids) => h("section", { class: "card" }, h("h3", {}, title), ...kids), none = t => h("p", { class: "sm mut", style: { margin: 0 } }, t);
    const stat = (n, l) => h("div", { class: "card stat" }, h("span", { class: "n" }, n), h("span", { class: "l" }, l));
    const goal = g => h("div", { class: "pf-goal" }, h("div", { class: "row between" }, h("b", {}, g.title), h("span", { class: "badge " + CE.GOAL_ST[g.status][1] }, CE.GOAL_ST[g.status][0])),
      g.subj != null ? h("div", { class: "xs mut" }, CE.subjName(g.subj)) : null, g.plan ? h("p", { class: "sm" }, g.plan) : null, g.reflection ? h("blockquote", { class: "refl sm" }, g.reflection) : null);
    return h("div", { class: "stack pf" },
      h("div", { class: "row between noprint" }, h("div", { class: "row" }, r.ay > r.first_ay ? h("a", { class: "btn sm ghost", href: href(r.ay - 1) }, (document.documentElement.dir === "rtl" ? "→ " : "← ") + CE.ayLabel(r.ay - 1)) : null,
        r.ay < r.now_ay ? h("a", { class: "btn sm ghost", href: href(r.ay + 1) }, CE.ayLabel(r.ay + 1) + (document.documentElement.dir === "rtl" ? " ←" : " →")) : null), h("button", { class: "btn cyan", onclick: () => print() }, "Print")),
      h("header", { class: "card ink pf-head" }, h("div", { class: "kicker" }, r.school || "Compass Ed"), h("h1", {}, s.name),
        h("div", {}, "Year portfolio " + CE.ayLabel(r.ay)), h("div", { class: "sm" }, [s.class, s.year ? "Year " + s.year : null, s.house ? CE.HOUSE_NAMES[s.house] : null].filter(Boolean).join(" · "))),
      h("div", { class: "grid g4" }, stat(r.lessons, "Lessons completed"), stat(r.checkpoints, "Checkpoints passed"), stat(r.activities.length, "Activities done"), stat(r.points, "House points")),
      sec("Goals and reflections", ...(r.goals.length ? [1, 2, 3].filter(t => r.goals.some(g => g.term === t)).map(t => h("div", { class: "pf-term" }, h("h4", {}, TERMS[t - 1]), ...r.goals.filter(g => g.term === t).map(goal))) : [none("No goals set this year.")])),
      h("div", { class: "grid g2" },
        sec("Competitions", r.competitions.length ? h("div", { class: "list" }, ...r.competitions.map(c => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon(c.place ? "medal" : "trophy")),
          h("div", { class: "grow" }, h("div", { class: "t sm" }, c.title), h("div", { class: "s xs" }, (c.place ? PLACE[c.place] || c.place + "th place" : "Entered") + " · " + D.short(c.at)))))) : none("No competitions entered this year.")),
        sec("Clubs", r.clubs.length ? h("div", { class: "list" }, ...r.clubs.map(c => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("users")), h("div", { class: "grow" }, h("div", { class: "t sm" }, c.title), h("div", { class: "s xs" }, c.day))))) : none("No clubs this year."))),
      sec("Activities", r.activities.length ? h("div", { class: "row", style: { gap: "6px" } }, ...r.activities.map(a => h("span", { class: "badge" }, a.title))) : none("No activities done this year.")),
      sec("Work handed in", r.work.length ? h("div", { class: "tbw" }, h("table", { class: "tb" }, h("thead", {}, h("tr", {}, ...["Work", "Subject", "Handed in", "Score"].map(t => h("th", {}, t)))),
        h("tbody", {}, ...r.work.map(w => h("tr", {}, h("td", {}, w.title), h("td", {}, w.subj != null ? CE.subjName(w.subj) : "–"), h("td", {}, D.short(w.at)), h("td", {}, w.score != null ? w.score + "%" : w.status === "returned" ? "Returned" : "Not marked yet")))))) : none("No work handed in this year.")),
      h("p", { class: "xs mut" }, "From Compass Ed · " + D.long(new Date())));
  };

  /* ---------- hash router ---------- */
  CE.router = function (routes, notFound) {
    let first = true;
    const go = () => {
      const path = (location.hash.replace(/^#\/?/, "") || "").split("?")[0];
      const parts = path.split("/").filter(Boolean);
      let fn = null;
      for (const r of routes) {
        const rp = r.path.split("/").filter(Boolean);
        if (rp.length !== parts.length) continue;
        const params = {}; let ok = true;
        rp.forEach((p, i) => { if (p[0] === ":") params[p.slice(1)] = decodeURIComponent(parts[i]); else if (p !== parts[i]) ok = false; });
        if (ok) { fn = () => r.handler(params); break; }
      }
      if (!fn) fn = () => (notFound || routes[0].handler)({});
      const sheet = CE.$(".main"); if (sheet) sheet.scrollTop = 0; if (!first) scrollTo({ top: 0, behavior: "instant" });
      if (first) { first = false; fn(); } else CE.txRoute(fn);   /* the boot route paints plainly; later routes swap with a short transition */
    };
    addEventListener("hashchange", go); go();
  };
  /* In-portal route changes: a quick blur-and-settle swap through the View Transitions API (Chrome, Edge, Safari 18, Firefox 144).
     Elsewhere, or with reduced motion, a hidden tab or an open dialog, the route simply renders as before. */
  CE.txRoute = fn => {
    if (!document.startViewTransition || !txOk() || CE.$(".modal.show, .gate")) return fn();
    const t = document.startViewTransition(() => { fn(); });
    t.updateCallbackDone.catch(() => {}); t.ready.catch(() => {}); t.finished.catch(() => {});
  };
  CE.nav = h => { location.hash = h; };
  CE.q = k => new URLSearchParams(location.hash.split("?")[1] || "").get(k);

  /* ---------- shared calendar grid + ICS export ---------- */
  CE.calendar = function (el, year, month, events, onPick) {
    el.innerHTML = ""; el.className = "cal";
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => el.append(CE.h("div", { class: "dh" }, d)));
    const first = new Date(year, month, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = D.ymd(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const key = D.ymd(d);
      const cell = CE.h("div", { class: "d" + (d.getMonth() !== month ? " o" : "") + (key === today ? " today" : "") }, CE.h("div", { class: "n" }, d.getDate()));
      events.filter(e => D.ymd(e.starts) === key).forEach(e => cell.append(CE.h("div", { class: "ev " + (e.kind || ""), title: e.title, onclick: () => onPick && onPick(e) }, e.title)));
      el.append(cell);
      if (i >= 34 && d.getMonth() !== month && d.getDay() === 0) break;
    }
  };
  CE.ics = function (events, calName) {
    const p = n => String(n).padStart(2, "0");
    const stamp = d => { d = new Date(d); return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + "00Z"; };
    const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Compass Ed//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + esc(calName || "Compass Ed")];
    events.forEach(e => {
      const s = new Date(e.starts), en = e.ends ? new Date(e.ends) : new Date(s.getTime() + 3600000);
      lines.push("BEGIN:VEVENT", "UID:" + (e.id || Math.random().toString(36).slice(2)) + "@compassed", "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(s), "DTEND:" + stamp(en),
        "SUMMARY:" + esc((e.kind === "due" ? "Due: " : e.kind === "exam" ? "Exam: " : "") + e.title), e.place ? "LOCATION:" + esc(e.place) : null, "DESCRIPTION:" + esc((e.class ? e.class + ". " : "") + "From Compass Ed"), "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.filter(Boolean).join("\r\n")], { type: "text/calendar" });
    const a = CE.h("a", { href: URL.createObjectURL(blob), download: (calName || "compassed").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".ics" }); document.body.append(a); a.click(); a.remove();
  };

  /* entry motion only while the tab is visible (hidden tabs pause animations and would stay invisible) */
  const vis = () => document.body && document.body.classList.toggle("motion", document.visibilityState === "visible" && !matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.addEventListener("visibilitychange", vis); if (document.body) vis(); else document.addEventListener("DOMContentLoaded", vis);


  /* ---------- user settings: theme, dyslexia-friendly, detail level, transparency ---------- */
  CE.prefs = {
    get() { return Object.assign({ theme: "auto", dys: false, detail: "standard", glass: 0 }, LS.get("ce_prefs") || {}); },
    set(p) { LS.set("ce_prefs", Object.assign(CE.prefs.get(), p)); CE.prefs.apply(); },
    apply() {
      const p = CE.prefs.get(), root = document.documentElement, b = document.body;
      const dark = p.theme === "dark" || (p.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      root.setAttribute("data-theme", dark ? "dark" : "light");
      if (!b) return;
      b.classList.toggle("dys", !!p.dys); b.classList.toggle("compact", p.detail === "compact"); b.classList.toggle("detailed", p.detail === "detailed");
      b.classList.toggle("glass", p.glass > 0); b.style.setProperty("--glass", String(Math.min(60, Math.max(0, +p.glass || 0))));
      if (p.dys && !document.getElementById("lexend")) { const l = CE.h("link", { id: "lexend", rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap" }); document.head.append(l); }
    }
  };
  CE.prefs.apply(); if (!document.body) document.addEventListener("DOMContentLoaded", () => CE.prefs.apply());
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => CE.prefs.apply());
  /* the settings card every portal shows */
  CE.prefsCard = () => {
    const p = CE.prefs.get(), h = CE.h;
    const seg = (opts, val, on) => h("div", { class: "seg" }, ...opts.map(([v, l]) => h("button", { class: String(v) === String(val) ? "on" : "", "aria-pressed": String(String(v) === String(val)), onclick: e => { on(v);
      for (const b of e.currentTarget.parentNode.children) { const s = b === e.currentTarget; b.classList.toggle("on", s); b.setAttribute("aria-pressed", String(s)); } } }, l)));
    const box = h("div", { class: "stack" },
      h("div", { class: "row between" }, h("div", {}, h("b", {}, "Appearance"), h("div", { class: "sm mut" }, "Light, dark or follow the device.")), seg([["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]], p.theme, v => CE.prefs.set({ theme: v }))),
      h("div", { class: "row between" }, h("div", {}, h("b", {}, "Dyslexia-friendly reading"), h("div", { class: "sm mut" }, "Lexend typeface, wider spacing, shorter lines and a warmer page.")), h("label", { class: "chk" }, h("input", { type: "checkbox", checked: p.dys, "aria-label": "Dyslexia-friendly reading", onchange: e => CE.prefs.set({ dys: e.target.checked }) }), p.dys ? "On" : "Off")),
      window.speechSynthesis && CE.me && CE.me.role === "student" ? h("div", { class: "row between" }, h("div", {}, h("b", {}, "Read aloud"), h("div", { class: "sm mut" }, "How fast the Listen button reads lessons and notices.")), seg([[1, "Normal"], [0.8, "Slower"]], p.sayRate || 1, v => CE.prefs.set({ sayRate: +v }))) : null,
      h("div", { class: "row between" }, h("div", {}, h("b", {}, "Detail level"), h("div", { class: "sm mut" }, "Compact shows less text per card; detailed shows more.")), seg([["compact", "Compact"], ["standard", "Standard"], ["detailed", "Detailed"]], p.detail, v => CE.prefs.set({ detail: v }))),
      h("div", { class: "row between" }, h("div", {}, h("b", {}, "Interface transparency"), h("div", { class: "sm mut" }, "Glass effect on cards and bars. 0 is solid.")), h("input", { type: "range", min: 0, max: 60, step: 5, value: p.glass, style: { width: "160px" }, oninput: e => CE.prefs.set({ glass: +e.target.value }) })));
    return box;
  };

  /* ---------- offline: keep the last copy of what you read, serve it when the network is down ---------- */
  const READ = /^ed_(s_(home|explore|activity|comp|subjects|lesson|quiz|assigns|review|progress|calendar|anns|news|clubs|badges|timetable|slips)|me|board|t_(home|content|assigns|subs|class|heatmap|anns|events|clubs|bank))$/;
  const rawApi = CE.api;
  CE.api = async function (fn, args) {
    const key = "ce_off_" + fn + ":" + JSON.stringify(Object.assign({}, args, { p_key: undefined }));
    try {
      const r = await rawApi(fn, args);
      if (READ.test(fn) && r && r.ok) { try { sessionStorage.setItem(key, JSON.stringify(r)); } catch (e) { Object.keys(sessionStorage).forEach(k => k.startsWith("ce_off_") && sessionStorage.removeItem(k)); } }   // full: start the offline copies again
      CE.offline(false); return r;
    } catch (e) {
      if (e.message === "Failed to fetch" && READ.test(fn)) { const c = sessionStorage.getItem(key); if (c) { CE.offline(true); return JSON.parse(c); } }
      throw e;
    }
  };
  CE.offline = on => { let b = CE.$("#offline"); if (on && !b) { b = CE.h("div", { id: "offline", class: "offline" }, "You're offline. Showing the last copy of this page; changes won't save until you're back online."); document.body.prepend(b); } if (!on && b) b.remove(); };
  addEventListener("online", () => CE.offline(false));
  /* Vercel Web Analytics (cookieless page counts) and Speed Insights (load-time measurements), only where Vercel serves the
     scripts: the GitHub Pages copy has no such files. Vercel's script counts the portal's hash routes by itself, one view per change. */
  if (/\.vercel\.app$/.test(location.hostname)) ["/_vercel/insights/script.js", "/_vercel/speed-insights/script.js"].forEach(src => { const s = document.createElement("script"); s.defer = true; s.src = src; document.head.append(s); });
  /* ---------- the aurora: the landing page's moving background, drawn live instead of played from a video ----------
     One small WebGL canvas per .aurora element, rendered at low resolution and stretched (the CSS gradient underneath is the fallback).
     It sleeps off screen and in hidden tabs; reduced-motion users get one still frame. CE.aurora.tint("#hex") eases it towards a colour. */
  const AU_FS = "precision mediump float;uniform vec2 r;uniform float t;uniform vec3 c;uniform vec2 m;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}float b(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.+9.;a*=.5;}return v;}void main(){vec2 u=gl_FragCoord.xy/r,p=u*vec2(r.x/r.y,1.)*2.1;float s=t*.045,w=b(p+vec2(s,-s*.7)),x=b(p+2.7*w+vec2(-s*.8,s)+m*.45),y=b(p*.7-1.9*w+vec2(s*.6,s*.3));vec3 k=mix(vec3(.03,.27,.33),c,smoothstep(.42,.68,y));k=mix(k,vec3(.19,.64,.42),smoothstep(.5,.74,w)*.5);k=mix(k,vec3(.24,.39,.87),smoothstep(.5,.72,y*(1.-u.x)+w*u.x)*.5);k*=smoothstep(.38,.76,x)*1.3;float v=smoothstep(1.3,.2,length((u-vec2(.5,.58))*vec2(1.05,1.35)));gl_FragColor=vec4(k*v,1.);}";
  const auTint = [.3, .77, .81], auTo = [.3, .77, .81], auPt = [0, 0], auWake = [];
  CE.aurora = el => {
    const c = CE.h("canvas", { "aria-hidden": "true" }), gl = c.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" }); if (!gl) return el;
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; }, pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}")); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, AU_FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return el;
    gl.useProgram(pr); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.bindAttribLocation(pr, 0, "a"); gl.vertexAttribPointer(gl.getAttribLocation(pr, "a"), 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n), uR = U("r"), uT = U("t"), uC = U("c"), uM = U("m"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fit = () => { const w = el.clientWidth || 2, h = el.clientHeight || 2, k = Math.min(1, 440 / Math.max(w, h)); c.width = Math.max(2, w * k | 0); c.height = Math.max(2, h * k | 0); gl.viewport(0, 0, c.width, c.height); };
    let raf = 0, last = 0, seen = false;
    const draw = now => {
      const moved = Math.abs(auTo[0] - auTint[0]) + Math.abs(auTo[1] - auTint[1]) + Math.abs(auTo[2] - auTint[2]) > .004;
      raf = seen && (!still || moved) && !document.hidden ? requestAnimationFrame(draw) : 0;
      const dt = last ? Math.min(100, now - last) : 16.7; last = now;
      auTint.forEach((v, i) => { auTint[i] = v + (auTo[i] - v) * (1 - Math.pow(.94, dt / 33)); });   /* the same colour ease at any frame rate */
      gl.uniform2f(uR, c.width, c.height); gl.uniform1f(uT, still ? 40 : 40 + now / 1000); gl.uniform3fv(uC, auTint); gl.uniform2fv(uM, auPt); gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!c.parentNode) el.append(c);   /* only once there is a picture: an opaque empty canvas would hide the CSS gradient underneath */
    };
    const wake = () => { if (!raf && !document.hidden && seen) raf = requestAnimationFrame(draw); };
    new IntersectionObserver(es => { seen = es[0].isIntersecting; if (seen) { fit(); wake(); } }).observe(el);
    document.addEventListener("visibilitychange", wake); addEventListener("resize", () => { fit(); wake(); }); auWake.push(wake);
    return el;
  };
  CE.aurora.tint = hex => { [1, 3, 5].forEach((p, i) => { auTo[i] = parseInt(hex.substr(p, 2), 16) / 255; }); auWake.forEach(f => f()); };
  CE.aurora.point = (x, y) => { auPt[0] = x; auPt[1] = y; };
  CE.$$(".aurora").forEach(CE.aurora);

  /* ---------- page transitions: the compass ----------
     Leaving a page: a black veil blurs it away while the compass needle spins up and settles on north, then we navigate.
     The arriving page (assets/tx.js, run before its first paint) opens the veil from the compass and flies through it.
     Nothing runs for reduced-motion users, hidden tabs, modifier clicks, downloads, external links or in-page anchors. */
  const TX_ART = ["compass-rose.png", "compass-needle.png"].map(f => ROOT + "assets/art/" + f);
  const txOk = () => !matchMedia("(prefers-reduced-motion: reduce)").matches && document.visibilityState === "visible" && !CE.$(".tx");
  let txTimer = 0;
  const leave = url => { try { sessionStorage.setItem("ce_tx", String(Date.now())); } catch (e) {} location.href = url; };
  CE.go = function (url) {
    if (txTimer) { clearTimeout(txTimer); txTimer = setTimeout(() => leave(url), 150); return; }   /* a second request while the compass is up retargets it */
    if (!txOk()) { location.href = url; return; }
    const c = CE.h("div", { class: "tx", "aria-hidden": "true" }, CE.h("div", { class: "tx-veil" }),
      CE.h("div", { class: "tx-c" }, CE.h("img", { class: "tx-rose", src: TX_ART[0], alt: "", draggable: "false" }), CE.h("img", { class: "tx-needle", src: TX_ART[1], alt: "", draggable: "false" })));
    document.body.append(c);
    let gone = false; addEventListener("pagehide", () => { gone = true; }, { once: true });
    txTimer = setTimeout(() => leave(url), 520);
    setTimeout(() => { if (!gone) { c.remove(); txTimer = 0; try { sessionStorage.removeItem("ce_tx"); } catch (e) {} } }, 15000);   /* the browser never left (a blocked page): put the page back */
  };
  const samePage = u => u.pathname.replace(/\/index\.html$/, "/") === location.pathname.replace(/\/index\.html$/, "/") && u.search === location.search;
  document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self") || a.closest("[data-no-tx]")) return;
    const href = a.getAttribute("href"); if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return;
    let u; try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return;
    if (samePage(u) && u.hash) { if (u.pathname !== location.pathname) { e.preventDefault(); location.hash = u.hash; } return; }   /* in-page anchor, even "index.html#…" from "/" */
    if (!/(\/|\.html?)$/i.test(u.pathname) && /\.[a-z0-9]+$/i.test(u.pathname)) return;   /* only pages get the compass, never files */
    e.preventDefault(); CE.go(u.href);
  });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) (window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 800 }) : f => setTimeout(f, 1500))(() => TX_ART.forEach(s => { const i = new Image(); i.src = s; }));
  addEventListener("pageshow", e => { if (e.persisted) { CE.$$(".tx").forEach(x => x.remove()); document.documentElement.classList.remove("tx-in"); } });
  if ("serviceWorker" in navigator && !local) {
    /* when a new version of the site takes over, reload once so the page runs the new scripts straight away */
    let had = !!navigator.serviceWorker.controller;
    /* a new version took over: reload once so the page is not left with the old styles and scripts (at most once every 10 s, so an update can never loop) */
    navigator.serviceWorker.addEventListener("controllerchange", () => { let t = 0; try { t = +sessionStorage.getItem("ce_reloaded") || 0; } catch (e) {} if (had && Date.now() - t > 10000) { try { sessionStorage.setItem("ce_reloaded", String(Date.now())); } catch (e) {} location.reload(); } had = true; });
    navigator.serviceWorker.register(ROOT + "sw.js").then(r => { r.update().catch(() => {}); }).catch(() => {});
    setTimeout(() => sessionStorage.removeItem("ce_reloaded"), 15000);
  }

  /* ---------- file uploads (Supabase Storage bucket "uploads"; preview mode keeps small files in the browser) ---------- */
  CE.upload = async function (file) {
    if (file.size > 10 * 1024 * 1024) throw new Error("That file is over 10 MB.");
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
    const path = (CE.me ? CE.me.id : "x") + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + "." + ext;
    if (demo) { if (file.size > 400000) throw new Error("Preview mode can only keep files under 400 KB."); const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }); return { url, name: file.name }; }
    const r = await fetch(C.supabaseUrl.replace(/\/+$/, "") + "/storage/v1/object/uploads/" + path, { method: "POST", headers: { apikey: C.supabaseKey, Authorization: "Bearer " + C.supabaseKey, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file });
    if (!r.ok) throw new Error(r.status === 404 ? "Uploads are not set up yet (run compassed-v2.1.sql)." : "Upload failed (" + r.status + ")");
    CE.capi("ed_s_file", { p_path: path, p_name: file.name, p_size: file.size }).catch(() => {});
    return { url: C.supabaseUrl.replace(/\/+$/, "") + "/storage/v1/object/public/uploads/" + path, name: file.name };
  };
  /* a small "attach file" control that appends the uploaded link to a text input of space-separated links */
  CE.attach = (linksInput) => {
    const h = CE.h, inp = h("input", { type: "file", accept: "image/*,application/pdf,video/mp4,audio/*,.txt", class: "hide", multiple: true });
    const btn = h("button", { class: "btn sm ghost", type: "button", onclick: () => inp.click() }, CE.icon("link"), "Attach a photo or file");
    inp.onchange = async () => { for (const f of inp.files) { btn.disabled = true; btn.textContent = "Uploading " + f.name + "…"; try { const u = await CE.upload(f); linksInput.value = (linksInput.value + " " + u.url).trim(); CE.toast("Attached " + f.name, "ok"); } catch (e) { CE.toast(e.message, "bad"); } } btn.disabled = false; btn.innerHTML = ""; btn.append(CE.icon("link"), "Attach a photo or file"); inp.value = ""; };
    return h("span", {}, inp, btn);
  };
  /* render a list of links: images inline, everything else as a link */
  CE.links = (links) => { const h = CE.h, w = h("div", { class: "stack" }); (links || []).forEach(l => { if (/^data:image|\.(png|jpe?g|gif|webp)(\?|$)/i.test(l) || /\/storage\/v1\/object\/public\/uploads\/.*\.(png|jpe?g|gif|webp)$/i.test(l)) w.append(h("a", { href: l, target: "_blank", rel: "noopener" }, h("img", { src: l, alt: "", style: { maxWidth: "100%", maxHeight: "360px", borderRadius: "12px" }, loading: "lazy" }))); else w.append(h("a", { href: l, target: "_blank", rel: "noopener", class: "row", style: { gap: "6px" } }, CE.icon("link"), l.length > 70 ? l.slice(0, 67) + "…" : l)); }); return w; };

  /* ---------- badges (computed from the numbers ed_s_badges returns) ---------- */
  CE.BADGES = [
    ["first-step", "First step", "Complete your first activity", "explore", b => b.activities >= 1], ["explorer", "Explorer", "10 activities done", "compass", b => b.activities >= 10], ["all-rounder", "All-rounder", "Activities in 5 categories", "grid", b => b.cats >= 5],
    ["bookworm", "Bookworm", "10 lessons completed", "lesson", b => b.lessons >= 10], ["master", "Master", "Pass a mastery checkpoint", "flag", b => b.checkpoints >= 1], ["grand-master", "Grand master", "5 checkpoints passed", "trophy", b => b.checkpoints >= 5],
    ["perfect", "Perfect score", "100% on a quiz", "spark", b => b.perfect >= 1], ["contender", "Contender", "Enter a competition", "medal", b => b.entries >= 1], ["placed", "On the podium", "Place in a competition", "medal", b => b.places >= 1], ["champion", "Champion", "Win a competition", "trophy", b => b.wins >= 1],
    ["on-time", "Handed in", "Hand in 5 pieces of work", "pencil", b => b.handins >= 5], ["memory", "Memory", "50 flashcard reviews", "repeat", b => b.reviews >= 50], ["joiner", "Joiner", "Join a club", "users", b => b.clubs >= 1], ["critic", "Kind critic", "Write a peer review", "eye", b => b.peer >= 1],
    ["100-points", "Century", "100 house points", "cup", b => b.pts >= 100], ["500-points", "High flyer", "500 house points", "cup", b => b.pts >= 500]
  ];
  CE.badges = b => CE.BADGES.map(([id, name, desc, icon, test]) => ({ id, name, desc, icon, on: !!(b && test(b)) }));
  CE.HOUSE_NAMES = { N: "North", E: "East", S: "South", W: "West" };
  CE.HOUSE_COLORS = { N: "red", E: "green", S: "blue", W: "yellow" };
  CE.srcTag = (src, name) => src ? CE.h("span", { class: "src-tag " + src, title: name || "" }, CE.icon("link"), { globalcampus: "Global Campus", compassdash: "Compass Dash" }[src] || (name || "Feed")) : null;
  /* a card of Compass Dash house XP, challenges and the top of its leaderboard (data from ed_s_cd / ed_t_cd) */
  CE.cdHousesCard = (cd, myHouse) => {
    if (!cd || !cd.on || !cd.houses) return null;
    const h = CE.h, D = CE.date, hs = (cd.houses.houses || []).slice().sort((a, b) => b.xp - a.xp), top = Math.max(1, ...hs.map(x => x.xp)), ch = cd.houses.chal || [], cup = (cd.houses.cups || [])[0];
    return h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, "Compass Dash house cup"), CE.srcTag("compassdash", "Compass Dash")), h("div", { class: "stack" },
      h("div", { class: "sm mut" }, "XP earned on Compass Dash counts for your house there." + (cup ? " Last week's cup: " + (CE.HOUSE_NAMES[cup.house] || cup.house) + " with " + (cup.xp || 0).toLocaleString() + " XP." : "") + (cd.linked != null && typeof cd.linked === "number" ? " " + cd.linked + " student" + (cd.linked === 1 ? "" : "s") + " linked." : "")),
      ...hs.map((x, i) => h("div", { class: "house-" + x.h }, h("div", { class: "row between sm" }, h("b", {}, (i + 1) + ". " + (CE.HOUSE_NAMES[x.h] || x.h) + (x.h === myHouse ? " (mine)" : "") + " · " + (x.members || 0) + " member" + (x.members === 1 ? "" : "s")), h("span", {}, (x.xp || 0).toLocaleString() + " XP · " + (x.wk || 0).toLocaleString() + " this week")), h("div", { class: "hbar" }, h("i", { style: { width: CE.pct(x.xp || 0, top) + "%" } })))),
      ch.length ? h("div", {}, h("h4", {}, "House challenges"), h("div", { class: "list" }, ...ch.map(c => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("trophy")), h("div", { class: "grow" }, h("div", { class: "t sm" }, c.title), h("div", { class: "s xs" }, [c.kind === "class" ? (c.class || "class") + " challenge" : "Whole-school challenge", c.goal ? (c.done != null ? c.done + " of " : "goal ") + c.goal + " " + (c.metric || "") : null, c.ends ? D.left(c.ends) : null].filter(Boolean).join(" · "))))))) : null,
      cd.board && cd.board.length ? h("div", {}, h("h4", {}, "Top on Compass Dash"), h("div", { class: "list" }, ...cd.board.slice(0, 5).map((b, i) => h("div", { class: "item" }, h("span", { class: "badge" + (i < 3 ? " cyan" : "") }, i + 1), h("div", { class: "grow" }, h("div", { class: "t sm" }, b.name), h("div", { class: "s xs" }, (b.xp || 0).toLocaleString() + " XP · " + (b.mast || 0) + " topics mastered")))))) : null,
      h("a", { class: "btn sm ghost", href: "#/dash" }, "Open Compass Dash")));
  };
  /* school links (Global Campus, Compass Dash, ...) as tiles */
  /* Compass Dash, inside the portal. It reads this Compass Ed session itself and signs in as the same person
     (the bridge at the end of dash/index.html), so this page only frames it. */
  CE.dashPage = page => {
    CE.title("Compass Dash"); page.innerHTML = "";
    const ds = CE.q("s"), dt = CE.q("t"), topic = /^\d+$/.test(ds || "") && /^\d+$/.test(dt || "") ? "#/topic/" + ds + "/" + dt : "";   // #/dash?s=&t= opens one topic (homework links)
    const f = CE.h("iframe", { class: "dash-frame", src: ROOT + "dash/" + topic, title: "Compass Dash", allow: "fullscreen; autoplay" });
    // full screen: the real thing where the browser allows it, else (iPhone) Compass Dash fills the page until Exit
    const wrap = CE.h("div", { class: "dash-wrap" }), root = document.documentElement;
    const isFull = () => (document.fullscreenElement || document.webkitFullscreenElement) === wrap || wrap.classList.contains("max");
    const label = () => { const on = isFull(); fsBtn.replaceChildren(CE.icon(on ? "shrink" : "expand"), CE.t(on ? "Exit full screen" : "Full screen")); fsBtn.setAttribute("aria-pressed", on ? "true" : "false"); };
    const unmax = () => { wrap.classList.remove("max"); root.classList.remove("dash-max-on"); label(); };
    const toggle = () => {
      if (isFull()) { if (wrap.classList.contains("max")) unmax(); else (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      const req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
      const fallback = () => { wrap.classList.add("max"); root.classList.add("dash-max-on"); label(); };
      if (!req) fallback();
      else { try { const p = req.call(wrap); if (p && p.catch) p.catch(fallback); } catch (e) { fallback(); }
        setTimeout(() => { if (!isFull()) fallback(); }, 700); }   // some embedded browsers neither show it nor say no
      try { f.contentWindow.focus(); } catch (e) {}
    };
    const fsBtn = CE.h("button", { class: "btn sm ghost dash-fs", type: "button", onclick: toggle });
    const onFs = () => { if (!wrap.isConnected) return document.removeEventListener("fullscreenchange", onFs), document.removeEventListener("webkitfullscreenchange", onFs); label(); };
    document.addEventListener("fullscreenchange", onFs); document.addEventListener("webkitfullscreenchange", onFs);
    addEventListener("hashchange", unmax, { once: true });   // leaving the page always gives the portal back
    wrap.append(fsBtn, f); label();
    page.append(wrap);
  };
  CE.linkTiles = links => { const h = CE.h; return (links || []).length ? h("div", { class: "grid g2" }, ...links.map(l => { let host = ""; try { host = new URL(l.url).hostname.replace(/^www\./, ""); } catch (e) {} return h("a", { class: "ext", href: l.url, target: "_blank", rel: "noopener" }, h("div", { class: "lg" }, (l.name || "?").trim().slice(0, 2).toUpperCase()), h("div", { class: "grow" }, h("div", { class: "t" }, l.name), h("div", { class: "s" }, l.blurb || host)), CE.icon("ext")); })) : null; };
  CE.PAT = { 1: "hub", 2: "art", 3: "world", 4: "perform", 5: "words", 6: "impact", 7: "steam", 8: "sport" };
  CE.emptyArt = (art, title, sub) => CE.h("div", { class: "empty art" }, CE.h("img", { src: ROOT + "assets/art/empty-" + art + ".svg", alt: "" }), CE.h("div", { class: "b" }, title), sub ? CE.h("div", { class: "sm" }, sub) : null);

  /* ---------- search (client-side over what the portal already loads) ---------- */
  CE.searchBox = (placeholder, onInput) => { const h = CE.h, i = h("input", { class: "in", placeholder, oninput: () => onInput(i.value.trim().toLowerCase()) }); return h("div", { class: "srch" }, CE.icon("explore"), i); };

  /* ---------- shell (sidebar + topbar) ---------- */
  CE.shell = function () {
    const side = CE.$("#side"), scrim = CE.$("#scrim");
    CE.$$("[data-burger]").forEach(b => b.onclick = () => { side.classList.toggle("open"); scrim.classList.toggle("show"); });
    if (scrim) scrim.onclick = () => { side.classList.remove("open"); scrim.classList.remove("show"); };
    addEventListener("hashchange", () => { side.classList.remove("open"); if (scrim) scrim.classList.remove("show"); CE.markNav(); });
    CE.markNav(); CE.feedbackButton();
  };
  /* ---------- feedback button (students and staff send; only the administrator reads, under Admin > Feedback) ---------- */
  CE.FB_CATS = ["Bug report", "Feature request", "Suggestion", "Other"];
  CE.feedbackButton = function () {
    if (!CE.auth.get() || CE.$("#fbBtn")) return;
    const h = CE.h, b = h("button", { id: "fbBtn", class: "fab-fb", type: "button", "aria-label": "Send feedback", onclick: CE.feedbackOpen }, CE.icon("megaphone"), h("span", {}, "Feedback"));
    document.body.append(b);
  };
  CE.feedbackOpen = function () {
    const h = CE.h; let rating = 0;
    const stars = h("div", { class: "stars", role: "radiogroup", "aria-label": "Rating" }, ...[1, 2, 3, 4, 5].map(k => h("button", { type: "button", role: "radio", "aria-checked": "false", "aria-label": k + " star" + (k > 1 ? "s" : ""), onclick: () => { rating = k; CE.$$("button", stars).forEach((x, i) => { x.classList.toggle("on", i < k); x.setAttribute("aria-checked", i === k - 1); }); } }, "★")));
    const cat = h("select", { class: "in" }, ...CE.FB_CATS.map(c => h("option", { value: c }, c))), msg = h("textarea", { class: "in", rows: 5, maxlength: 2000, placeholder: "What is working, what is not, or what would help? Please do not include passwords or other people's personal details." }), hp = h("input", { class: "hide", tabindex: -1, autocomplete: "off", "aria-hidden": "true" }), er = h("div", { class: "err" }), send = h("button", { class: "btn cyan", type: "button" }, "Send feedback");
    const page = (CE.me ? (CE.me.role === "student" ? "Student portal " : "Staff portal ") : "") + (location.hash || "#/");
    send.onclick = async () => {
      er.textContent = "";
      if (!rating) return er.textContent = CE.errText("bad_rating");
      if (msg.value.trim().length < 10) return er.textContent = "Please write at least 10 characters.";
      if (hp.value) return CE.closeModal();
      const last = +(LS.get("ce_fb_at") || 0); if (Date.now() - last < 30000) return er.textContent = CE.errText("too_many");
      send.disabled = true; send.textContent = "Sending…";
      try { const r = await CE.capi("ed_feedback_send", { p_rating: rating, p_cat: cat.value, p_msg: msg.value.trim(), p_page: page }); if (!r.ok) { er.textContent = CE.errText(r); return; } LS.set("ce_fb_at", Date.now()); CE.closeModal(); CE.toast("Thanks, your feedback has been sent to the administrator.", "ok"); }
      catch (e) { er.textContent = CE.errText(e); } finally { send.disabled = false; send.textContent = "Send feedback"; }
    };
    CE.modal(h("div", { class: "stack" }, h("h3", {}, "Send feedback"), h("p", { class: "sm mut", style: { margin: 0 } }, "Tell the administrator what is working and what is not. Only they can read it."), h("label", { class: "f" }, "Rating", stars), h("label", { class: "f" }, "Category", cat), h("label", { class: "f" }, "Message", msg), hp, h("div", { class: "xs mut" }, "Sent from: " + page), er, h("div", { class: "row" }, send, h("button", { class: "btn ghost", type: "button", onclick: CE.closeModal }, "Cancel"))));
    setTimeout(() => msg.focus(), 50);
  };
  CE.markNav = () => { const h = (location.hash || "#/").split("?")[0].split("/").slice(0, 2).join("/"); CE.$$("#side a.nl").forEach(a => a.classList.toggle("on", a.getAttribute("href").split("/").slice(0, 2).join("/") === h)); CE.shellUp(); };
  /* portal shell: the active pill slides between menu items, the menu folds to an icon rail (remembered on this device), Ctrl/Cmd+K opens Search */
  CE.shellUp = () => {
    const side = CE.$("#side"); if (!side) return;
    if (!side.dataset.up) {
      side.dataset.up = "1"; side.classList.add("has-pill"); side.prepend(CE.h("i", { class: "nl-pill", "aria-hidden": "true" }));
      CE.$$("a.nl", side).forEach(a => { a.title = a.textContent.trim(); });
      const shell = side.closest(".shell"), bar = CE.$(".topbar"), mini = v => { shell.classList.toggle("mini", v); LS.set("ce_side", v ? 1 : 0); tg.setAttribute("aria-pressed", String(v)); setTimeout(CE.shellUp, 260); };
      const tg = CE.h("button", { class: "ib mini-t", "aria-label": "Collapse menu", title: "Collapse menu", onclick: () => mini(!shell.classList.contains("mini")) }, CE.icon("menu"));
      bar.prepend(tg); if (LS.get("ce_side")) mini(true);
      const sr = CE.$("a[href='#/search']", bar); if (sr) { sr.dataset.k = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K"; sr.addEventListener("click", e => { e.preventDefault(); CE.palette(); }); }
      addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); CE.palette(); } });
      /* a soft light follows the pointer across the key numbers */
      const pg = CE.$("#page"); if (pg) pg.addEventListener("pointermove", e => { const k = e.target.closest && e.target.closest(".kpi,.glow"); if (k) { const b = k.getBoundingClientRect(); k.style.setProperty("--gx", e.clientX - b.left + "px"); k.style.setProperty("--gy", e.clientY - b.top + "px"); } }, { passive: true });
    }
    if (!side.dataset.lift) { side.dataset.lift = "1"; const pg = CE.$("#page"), hd = CE.$("#phead"), mn = CE.$(".main");
      /* a page's own title line moves up into the header band, buttons and all, whichever page drew it */
      if (hd && pg) new MutationObserver(() => { if (CE.watchTitle) CE.watchTitle(); if (hd.classList.contains("hide")) return; const l = pg.firstElementChild; if (!l || !(l.matches(".page-lead") || (l.matches(".row.between") && CE.$(":scope>div>h2", l)))) return; const t = CE.$("h2", l), sb = CE.$(".sm", l); CE.head({ title: t && t.textContent, sub: sb ? sb.textContent : "", acts: [...l.children].slice(1) }); l.remove(); }).observe(pg, { childList: true });
      /* the top bar shows the page title only once the page's own title (the header band, or a detail page's h1) has scrolled out of view */
      if (hd && mn && pg) { const tio = new IntersectionObserver(([e]) => mn.classList.toggle("past", !e.isIntersecting)); let wt = 0;
        CE.watchTitle = () => { const t = hd.classList.contains("hide") ? CE.$("h1", pg) : hd; tio.disconnect(); clearTimeout(wt); if (t) tio.observe(t); else wt = setTimeout(() => { if (hd.classList.contains("hide") && !CE.$("h1", pg)) mn.classList.add("past"); }, 400); }; } }
    const a = CE.$("a.nl.on", side), p = CE.$(".nl-pill", side); if (!p) return;
    p.style.opacity = a ? 1 : 0; if (a) { p.style.height = a.offsetHeight + "px"; p.style.transform = "translateY(" + a.offsetTop + "px)"; }
  };
  /* numbers count up once, and arrive at once for anyone who prefers less motion */
  CE.countUp = root => { const still = matchMedia("(prefers-reduced-motion: reduce)").matches; CE.$$("[data-n]", root).forEach(el => { const to = +el.dataset.n; if (still || !to) { el.textContent = to; return; } const t0 = performance.now(), dur = Math.min(900, 420 + to * 8); const f = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }); };
  /* drawn subject art, used for headers and tiles */
  CE.artSrc = n => ROOT + "assets/art/" + (n === "book" ? n : "subj/" + n) + ".svg";
  CE.art = (n, cls) => CE.h("img", { class: cls || "art", src: CE.artSrc(n), alt: "", onerror: e => { e.target.style.visibility = "hidden"; } });
  CE.iconArt = ic => ({ sport: "pe", french: "languages", spanish: "languages", arabic: "languages" })[ic] || ic;
  CE.subjArt = id => CE.iconArt(CE.subj(id).icon);
  CE.CAT_ART = { 1: "computing", 2: "art", 3: "geography", 4: "drama", 5: "english", 6: "languages", 7: "science", 8: "pe" };
  /* one header for every section: an aurora band with the section's drawing, its title, a line about it and its live numbers.
     A portal lists its sections in CE.heads { route: [art, line] }. Detail pages are left out and keep the plain top bar. */
  CE.heads = {};
  const headEl = () => { const el = CE.$("#phead"), h = CE.h; if (el && !el.firstChild) el.append(CE.aurora(h("div", { class: "aurora" })), h("div", { class: "ph-t" }, h("span", { class: "ph-k", id: "phK" }), h("h1", { id: "phT" }), h("p", { id: "phS" }), h("div", { class: "row ph-a", id: "phA" })), h("div", { class: "ph-r", id: "phR" }), h("img", { class: "ph-art", id: "phI", alt: "" })); return el; };
  CE.head = o => {
    const el = headEl(), h = CE.h; if (!el) return; const $ = id => CE.$("#" + id, el);
    if (o.title) $("phT").textContent = o.title;
    if (o.sub != null) $("phS").textContent = o.sub;
    if (o.kicker != null) $("phK").textContent = o.kicker;
    if (o.art) $("phI").src = CE.artSrc(o.art);
    if (o.acts) $("phA").replaceChildren(...o.acts);
    if (o.ring != null) $("phR").replaceChildren(h("div", { class: "ph-ring" }, CE.ring(o.ring), h("span", {}, o.ringLabel)));
    if (o.stats) { $("phR").replaceChildren(...o.stats.map(([n, l, href]) => h(href ? "a" : "span", { class: "ph-st", href }, h("b", { "data-n": typeof n === "number" ? n : null }, n), h("small", {}, l)))); CE.countUp(el); }
  };
  CE.ring = p => CE.h("div", { class: "ring", style: { "--p": p } }, CE.h("span", {}, p + "%"));
  CE.tile = o => CE.h(o.href ? "a" : "div", { class: "tile glow" + (o.cls ? " " + o.cls : ""), href: o.href, "data-art": o.art }, o.ring != null ? CE.ring(o.ring) : o.badge || null, CE.h("div", { class: "tl-t" }, CE.h("h3", {}, o.title), o.sub ? CE.h("p", {}, o.sub) : null), CE.art(o.art));
  CE.ticket = (c, tags, sub) => { const left = Math.ceil((new Date(c.closes) - Date.now()) / 864e5), open = left > 0; return CE.h("a", { class: "ticket glow" + (open ? "" : " off"), href: "#/competition/" + c.id }, CE.h("div", { class: "tk-d" }, CE.h("b", {}, open ? left : CE.date.short(c.closes)), CE.h("small", {}, open ? (left === 1 ? "day left" : "days left") : "Closed")), CE.h("div", { class: "tk-b" }, CE.h("div", { class: "row tk-tags" }, tags), CE.h("h4", {}, c.title), CE.h("p", { class: "sm mut" }, sub))); };
  CE.podium = (r, mine) => { const top = Math.max(1, ...r.house.map(x => x.pts)); return CE.h("div", { class: "podium" }, ...r.house.map((x, i) => CE.h("div", { class: "pod house-" + x.house + (x.house === mine ? " me" : "") }, CE.h("div", { class: "pod-w" }, CE.h("div", { class: "pod-b", style: { height: Math.max(12, CE.pct(x.pts, top)) + "%" } }, CE.h("b", {}, x.pts.toLocaleString()))), CE.h("div", { class: "pod-n" }, (i + 1) + ". " + (r.houses[x.house] || x.house)), CE.h("small", {}, (x.house === mine ? "Your house · " : "") + x.week + " this week")))); };
  /* Ctrl K: jump to any page by name, or carry the words over to the full search page */
  CE.palette = () => {
    if (CE.$("#pal")) return;
    const h = CE.h, seen = new Set(), all = [], add = (label, href, ico) => { if (!seen.has(href)) { seen.add(href); all.push({ label, href, ico }); } };
    CE.$$("#side a.nl:not(.hide)").forEach(a => add(a.title, a.getAttribute("href"), CE.$("svg", a) ? a.querySelector(".i").cloneNode(true) : null));
    (CE.jump || []).forEach(([l, href]) => add(CE.t(l), href));
    const ph = CE.t("Search or jump to…"), inp = h("input", { class: "pal-in", type: "search", placeholder: ph, "aria-label": ph }), list = h("div", { class: "pal-l" }), d = h("dialog", { id: "pal", class: "pal" }, h("div", { class: "pal-h" }, CE.icon("explore"), inp, h("kbd", { class: "kbd" }, "esc")), list);
    let sel = 0, rows = [];
    const go = r => { d.close(); location.hash = r.href; };
    const draw = () => { const raw = inp.value.trim(), q = raw.toLowerCase(); rows = all.filter(r => !q || r.label.toLowerCase().includes(q)); if (q.length > 1) rows.push({ label: CE.t("Search everything for") + " “" + raw + "”", href: "#/search?q=" + encodeURIComponent(raw) }); sel = Math.min(sel, Math.max(0, rows.length - 1)); list.replaceChildren(...rows.map((r, i) => h("a", { class: "item" + (i === sel ? " on" : ""), href: r.href, onclick: e => { e.preventDefault(); go(r); } }, h("div", { class: "ico sm" }, r.ico ? r.ico.cloneNode(true) : CE.icon("compass")), h("div", { class: "t sm" }, r.label)))); };
    inp.addEventListener("input", () => { sel = 0; draw(); });
    d.addEventListener("keydown", e => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length) { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length; draw(); list.children[sel].scrollIntoView({ block: "nearest" }); } else if (e.key === "Enter" && rows[sel]) { e.preventDefault(); go(rows[sel]); } });
    d.addEventListener("click", e => { if (e.target === d) d.close(); }); d.addEventListener("close", () => d.remove());
    document.body.append(d); d.showModal(); draw(); inp.focus();
  };
  /* sub-tabs under the top bar: a page group calls CE.subnav([[label, hash], ...]) */
  CE.subnav = tabs => { let el = CE.$("#subnav"); if (!el) return; el.innerHTML = ""; if (!tabs || !tabs.length) { el.classList.add("hide"); return; } el.classList.remove("hide"); const cur = (location.hash || "#/").split("?")[0]; tabs.forEach(([l, hsh, m]) => el.append(CE.h("a", { class: "tab" + ((m ? m.test(cur) : cur === hsh) ? " on" : ""), href: hsh }, l))); };
  CE.title = t => { const el = CE.$("#ptitle"); if (el) el.textContent = t; document.title = t + " · Compass Ed";
    const head = headEl(); if (!head) return; const m = CE.heads[location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "home"]; head.classList.toggle("hide", !m); if (CE.watchTitle) CE.watchTitle();
    if (m) { CE.head({ title: t, sub: m[1] || "", art: m[0], kicker: "" }); CE.$("#phR").replaceChildren(); CE.$("#phA").replaceChildren(); } };
  CE.loading = el => { el.innerHTML = ""; for (let i = 0; i < 3; i++) el.append(CE.h("div", { class: "card stack" }, CE.h("div", { class: "skel", style: { width: "40%" } }), CE.h("div", { class: "skel" }), CE.h("div", { class: "skel", style: { width: "70%" } }))); };
  CE.fail = (el, e) => { el.innerHTML = ""; el.append(CE.h("div", { class: "empty" }, CE.h("div", { class: "big" }, CE.icon("warn")), CE.h("div", { class: "b" }, CE.errText(e)), CE.h("div", { class: "sm", style: { marginTop: "8px" } }, CE.h("button", { class: "btn sm", onclick: () => location.reload() }, "Try again")))); };
  CE.demoBanner = () => {
    if (!demo) return;
    const b = CE.h("div", { class: "banner" }, CE.icon("eye"), " ", CE.h("span", {}, CE.h("b", {}, "Preview mode."), " This is a sample campus kept in your browser. Nothing here reaches the real database."),
      CE.h("button", { class: "btn sm ghost right", onclick: () => { if (confirm("Reset the sample campus to its starting point?")) { window.CE_DEMO && window.CE_DEMO.reset(); CE.auth.clear(); CE.go(ROOT + "signin.html"); } } }, "Reset sample"));
    document.body.prepend(b);
  };
  if (document.body) CE.cookieBanner(); else document.addEventListener("DOMContentLoaded", CE.cookieBanner);
})();
