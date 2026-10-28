/* CompassED core: API access, sessions, small UI helpers, hash router. Shared by every page. */
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

  const CE = window.CE = {
    cfg: C, demo,
    subjects: [],                         // filled after sign-in
    SUBJ_FALLBACK: [["Maths","maths"],["English","english"],["Science","science"],["Geography","geography"],["French","french"],["Computing","computing"],["Art & Design","art"],["Music","music"],["History","history"],["Spanish","spanish"],["Arabic","arabic"]]
  };

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
      no_match: "That code and username do not go together.",
      locked: "Too many tries. Wait 30 seconds, then try again.",
      disabled: "This account has been switched off. Ask your school.",
      bad_key: "Your teacher session has ended. Sign in again.",
      forbidden: "You do not have access to that class.",
      not_found: "That item is no longer available.",
      not_linked: "That Microsoft account is not linked to a CompassED account yet. Sign in the usual way first, then link it from Settings.",
      db_not_set_up: "The CompassED database tables are not set up yet. Run supabase/compassed-v1.0.sql in Supabase (see README).",
      not_configured: "No database configured. Add the Supabase URL and key in assets/config.js.",
      too_big: "That is too long to save.", empty: "Write something or add a link before handing in.",
      graded: "This work has been marked. Hand in a new version if your teacher asked for one.",
      bad_text: "Please check the text: something is missing or too long.",
      "Failed to fetch": "No connection. Check your internet and try again."
    })[m] || (m ? "Something went wrong (" + m + ")." : "Something went wrong.");
  };

  /* ---------- sessions ---------- */
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const SS = { get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { sessionStorage.removeItem(k); } catch (e) {} } };
  CE.LS = LS;
  CE.student = {
    get() { return LS.get("ce_student"); },
    set(p) { LS.set("ce_student", p); },
    clear() { LS.del("ce_student"); },
    args() { const s = LS.get("ce_student"); return s ? { p_code: s.code, p_user: s.username } : {}; }
  };
  const T_IDLE = 20 * 60 * 1000;   // same 20-minute lock as the Compass Dash Teacher Panel
  CE.teacher = {
    get() {
      const t = SS.get("ce_teacher"); if (!t) return null;
      if (Date.now() - (t.at || 0) > T_IDLE) { SS.del("ce_teacher"); return null; }
      t.at = Date.now(); SS.set("ce_teacher", t); return t;
    },
    set(tok, me) { SS.set("ce_teacher", { tok, me, at: Date.now() }); },
    clear() { SS.del("ce_teacher"); },
    args() { const t = CE.teacher.get(); return t ? { p_key: t.tok } : {}; }
  };
  CE.sapi = (fn, a) => CE.api(fn, Object.assign(CE.student.args(), a || {}));
  CE.tapi = (fn, a) => CE.api(fn, Object.assign(CE.teacher.args(), a || {}));
  CE.signOut = function (role) {
    if (role === "teacher") { const t = CE.teacher.get(); if (t && !demo) CE.api("cd_t_logout", { p_key: t.tok }).catch(() => {}); CE.teacher.clear(); }
    else CE.student.clear();
    location.href = "signin.html";
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
  CE.subj = id => { const s = CE.subjects.find(x => x.id === id); if (s) return s; const f = CE.SUBJ_FALLBACK[id] || ["Subject", "book"]; return { id, name: f[0], icon: f[1] }; };
  CE.subjName = id => CE.subj(id).name; CE.subjIcon = id => CE.icon(CE.subjKey(id));
  const D = CE.date = {
    parse: v => v ? new Date(v) : null,
    short: v => { const d = D.parse(v); return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""; },
    long: v => { const d = D.parse(v); return d ? d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""; },
    time: v => { const d = D.parse(v); return d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""; },
    dt: v => { const d = D.parse(v); if (!d) return ""; const t = D.time(v); return D.short(v) + (t === "00:00" || t === "23:59" ? "" : ", " + t); },
    ago: v => { const d = D.parse(v); if (!d) return "never"; const m = Math.round((Date.now() - d) / 60000); if (m < 1) return "just now"; if (m < 60) return m + " min ago"; const h = Math.round(m / 60); if (h < 24) return h + " h ago"; const dd = Math.round(h / 24); if (dd < 7) return dd + " day" + (dd > 1 ? "s" : "") + " ago"; return D.short(v); },
    until: v => { const d = D.parse(v); if (!d) return ""; const ms = d - Date.now(); const h = Math.round(ms / 3600000); if (ms < 0) return "overdue"; if (h < 1) return "due within the hour"; if (h < 24) return "due in " + h + " h"; const dd = Math.round(h / 24); return "due in " + dd + " day" + (dd > 1 ? "s" : ""); },
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
    m.innerHTML = ""; m.append(box); m.classList.add("show"); m.dataset.lock = opts.lock ? "1" : "";
    const f = box.querySelector("input,textarea,select,button:not(.x)"); if (f) setTimeout(() => f.focus(), 30);
    return box;
  };
  CE.closeModal = () => { const m = CE.$("#modal"); if (m) { m.classList.remove("show"); m.innerHTML = ""; } };
  CE.confirm = (text, okLabel) => new Promise(res => {
    const box = CE.modal(CE.h("div", { class: "stack" }, CE.h("h3", {}, "Are you sure?"), CE.h("p", {}, text),
      CE.h("div", { class: "row" }, CE.h("button", { class: "btn bad", onclick: () => { CE.closeModal(); res(true); } }, okLabel || "Yes, do it"), CE.h("button", { class: "btn ghost", onclick: () => { CE.closeModal(); res(false); } }, "Cancel"))));
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") CE.closeModal(); });

  /* tiny markdown-ish text: paragraphs, **bold**, bullet lines, links */
  CE.rich = s => CE.esc(s || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .split(/\n{2,}/).map(p => /^(- |• )/m.test(p) ? "<ul>" + p.split(/\n/).map(l => "<li>" + l.replace(/^(- |• )/, "") + "</li>").join("") + "</ul>" : "<p>" + p.replace(/\n/g, "<br>") + "</p>").join("");

  /* ---------- hash router ---------- */
  CE.router = function (routes, notFound) {
    const go = () => {
      const path = (location.hash.replace(/^#\/?/, "") || "").split("?")[0];
      const parts = path.split("/").filter(Boolean);
      for (const r of routes) {
        const rp = r.path.split("/").filter(Boolean);
        if (rp.length !== parts.length) continue;
        const params = {}; let ok = true;
        rp.forEach((p, i) => { if (p[0] === ":") params[p.slice(1)] = decodeURIComponent(parts[i]); else if (p !== parts[i]) ok = false; });
        if (ok) { r.handler(params); return; }
      }
      (notFound || routes[0].handler)({});
    };
    addEventListener("hashchange", go); go();
  };
  CE.nav = h => { location.hash = h; };

  /* ---------- shared calendar grid + ICS export ---------- */
  CE.calendar = function (el, year, month, events, onPick) {
    el.innerHTML = ""; el.className = "cal";
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(d => el.append(CE.h("div", { class: "dh" }, d)));
    const first = new Date(year, month, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const today = D.ymd(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const key = D.ymd(d);
      const cell = CE.h("div", { class: "d" + (d.getMonth() !== month ? " o" : "") + (key === today ? " today" : "") }, CE.h("div", { class: "n" }, d.getDate()));
      events.filter(e => D.ymd(e.starts) === key).forEach(e => cell.append(CE.h("div", { class: "ev " + (e.kind || ""), title: e.title, onclick: () => onPick && onPick(e) }, (e.kind === "due" ? "Due: " : "") + e.title)));
      el.append(cell);
      if (i >= 34 && d.getMonth() !== month && d.getDay() === 0) break;
    }
  };
  CE.ics = function (events, calName) {
    const p = n => String(n).padStart(2, "0");
    const stamp = d => { d = new Date(d); return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + "00Z"; };
    const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CompassED//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + esc(calName || "CompassED")];
    events.forEach(e => {
      const s = new Date(e.starts), en = e.ends ? new Date(e.ends) : new Date(s.getTime() + 3600000);
      lines.push("BEGIN:VEVENT", "UID:" + (e.id || Math.random().toString(36).slice(2)) + "@compassed", "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(s), "DTEND:" + stamp(en),
        "SUMMARY:" + esc((e.kind === "due" ? "Due: " : e.kind === "exam" ? "Exam: " : "") + e.title), e.place ? "LOCATION:" + esc(e.place) : null, "DESCRIPTION:" + esc((e.class ? e.class + ". " : "") + "From CompassED"), "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.filter(Boolean).join("\r\n")], { type: "text/calendar" });
    const a = CE.h("a", { href: URL.createObjectURL(blob), download: (calName || "compassed").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".ics" }); document.body.append(a); a.click(); a.remove();
  };

  /* entry motion only while the tab is visible (hidden tabs pause animations and would stay invisible) */
  const vis = () => document.body && document.body.classList.toggle("motion", document.visibilityState === "visible" && !matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.addEventListener("visibilitychange", vis); if (document.body) vis(); else document.addEventListener("DOMContentLoaded", vis);

  /* ---------- shell (sidebar + topbar) ---------- */
  CE.shell = function (opts) {
    const side = CE.$("#side"), scrim = CE.$("#scrim");
    CE.$$("[data-burger]").forEach(b => b.onclick = () => { side.classList.toggle("open"); scrim.classList.toggle("show"); });
    if (scrim) scrim.onclick = () => { side.classList.remove("open"); scrim.classList.remove("show"); };
    addEventListener("hashchange", () => { side.classList.remove("open"); if (scrim) scrim.classList.remove("show"); CE.markNav(); });
    CE.markNav();
  };
  CE.markNav = () => { const h = (location.hash || "#/").split("/").slice(0, 2).join("/"); CE.$$("#side a.nl").forEach(a => a.classList.toggle("on", a.getAttribute("href").split("/").slice(0, 2).join("/") === h)); };
  CE.title = t => { const el = CE.$("#ptitle"); if (el) el.textContent = t; document.title = t + " · CompassED"; };
  CE.loading = el => { el.innerHTML = ""; for (let i = 0; i < 3; i++) el.append(CE.h("div", { class: "card stack" }, CE.h("div", { class: "skel", style: { width: "40%" } }), CE.h("div", { class: "skel" }), CE.h("div", { class: "skel", style: { width: "70%" } }))); };
  CE.fail = (el, e) => { el.innerHTML = ""; el.append(CE.h("div", { class: "empty" }, CE.h("div", { class: "big" }, CE.icon("warn")), CE.h("div", { class: "b" }, CE.errText(e)), CE.h("div", { class: "sm", style: { marginTop: "8px" } }, CE.h("button", { class: "btn sm", onclick: () => location.reload() }, "Try again")))); };
  CE.demoBanner = () => {
    if (!demo) return;
    const b = CE.h("div", { class: "banner" }, CE.icon("eye"), " ", CE.h("span", {}, CE.h("b", {}, "Preview mode."), " This is a sample school kept in your browser. Nothing here reaches the real database."),
      CE.h("button", { class: "btn sm ghost right", onclick: () => { if (confirm("Reset the sample school to its starting point?")) { window.CE_DEMO && window.CE_DEMO.reset(); location.reload(); } } }, "Reset sample"));
    document.body.prepend(b);
  };
})();
