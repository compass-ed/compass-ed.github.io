/* The home page stage: a compass wheel of subjects around an open book. Choosing a subject turns the wheel and the page, and each
   subject's page holds a working preview of a real Compass Ed feature. All of it is sample data: nothing here is saved anywhere. */
(function () {
  const h = CE.h, $$ = CE.$$, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = document.getElementById("scene"); if (!scene) return;
  const stage = document.getElementById("stage"), me = CE.auth && CE.auth.get(), role = me && me.me && me.me.role;
  const home = role === "student" ? "student/" : role ? "teacher/" : "signin.html";

  /* ---------- the feature previews (also used by the "Schoolwork, too" section) ---------- */
  const btn = (label, onclick, cls) => h("button", { type: "button", class: "pv-btn " + (cls || ""), onclick }, label);
  const status = () => h("p", { class: "pv-out", role: "status" });
  const P = {
    mastery(d) {
      const out = status(), again = btn("Try again", () => box.replaceWith(box = opts()), "soft hide");
      const opts = () => h("div", { class: "pv-opts" }, d.opts.map((o, i) => h("button", { type: "button", class: "pv-opt", onclick: e => {
        $$(".pv-opt", box).forEach((b, j) => { b.disabled = true; b.classList.toggle("ok", j === d.a); }); if (i !== d.a) e.currentTarget.classList.add("no");
        out.textContent = i === d.a ? "Correct. That counts towards your 80% pass mark." : "Not this time. It comes back in your review queue."; again.classList.remove("hide");
      } }, o)));
      let box = opts(); again.addEventListener("click", () => { out.textContent = ""; again.classList.add("hide"); });
      return h("div", { class: "pv" }, h("p", { class: "pv-q" }, d.q), box, out, again);
    },
    review(d) {
      let i = 0, left = d.length; const body = h("div", { class: "pv-flash" }), root = h("div", { class: "pv" }, body);
      const face = () => { body.innerHTML = ""; if (!left) { body.append(h("p", { class: "pv-q" }, "Queue clear. Nothing to review today."), btn("Start again", () => { left = d.length; i = 0; face(); }, "soft")); return; }
        const c = d[i % d.length]; body.append(h("span", { class: "pv-tag" }, left + " left"), h("p", { class: "pv-q" }, c[0]), btn("Show answer", () => { body.innerHTML = "";
          body.append(h("span", { class: "pv-tag" }, left + " left"), h("p", { class: "pv-q" }, c[0]), h("p", { class: "pv-a" }, c[1]), h("div", { class: "pv-row" }, btn("Again", () => { i++; face(); }, "soft"), btn("Got it", () => { i++; left--; face(); }))); })); };
      face(); return root;
    },
    playlist(d) {
      const bar = h("i", { style: { width: "0%" } }), root = h("div", { class: "pv" }), list = h("div", { class: "pv-list" }), count = h("p", { class: "pv-out" }, "0 of " + d.length + " done");
      d.forEach(t => list.append(h("label", { class: "pv-chk" }, h("input", { type: "checkbox", onchange: () => { const n = $$("input:checked", list).length; bar.style.width = n / d.length * 100 + "%"; count.textContent = n + " of " + d.length + " done"; } }), h("span", {}, t))));
      root.append(list, h("div", { class: "pv-bar" }, bar), count); return root;
    },
    calendar(d) {
      return h("div", { class: "pv pv-list" }, d.map(e => { const b = btn("Add", ev => { const on = ev.currentTarget.classList.toggle("on"); ev.currentTarget.textContent = on ? "Added" : "Add"; ev.currentTarget.setAttribute("aria-pressed", on); }, "sm soft");
        return h("div", { class: "pv-ev" }, h("div", {}, h("b", {}, e[1]), h("span", {}, e[0])), b); }));
    },
    next(d) {
      let i = 0; const root = h("div", { class: "pv" }), draw = () => { root.innerHTML = ""; const t = d[i % d.length]; root.append(h("div", { class: "pv-next" }, h("span", { class: "pv-tag" }, t[0]), h("p", { class: "pv-q" }, t[1]), h("p", { class: "pv-out" }, t[2])), btn("Mark as done", () => { i++; draw(); })); };
      draw(); return root;
    },
    draft() {
      let v = 0; const log = h("div", { class: "pv-log" }), ta = h("textarea", { class: "pv-in", rows: 3, "aria-label": "Your draft", placeholder: "Start your answer here" }), out = status();
      const save = btn("Save draft", () => { v++; log.prepend(h("span", {}, "Version " + v + " saved")); out.textContent = ""; }, "soft"), send = btn("Hand in", () => { if (!ta.value.trim() && !v) { out.textContent = "Write something first."; return; } v = v || 1; ta.disabled = save.disabled = send.disabled = true; out.textContent = "Handed in. Every version is kept for your teacher."; });
      return h("div", { class: "pv" }, ta, h("div", { class: "pv-row" }, save, send), log, out);
    },
    comp(d) {
      const b = btn("Enter", e => { const on = e.currentTarget.classList.toggle("on"); e.currentTarget.textContent = on ? "Entered" : "Enter"; pts.textContent = on ? "10 house points on their way" : ""; }), pts = status();
      return h("div", { class: "pv pv-next" }, h("span", { class: "pv-tag" }, d[0]), h("p", { class: "pv-q" }, d[1]), h("p", { class: "pv-out" }, d[2]), b, pts);
    },
    clubs(d) {
      return h("div", { class: "pv pv-list" }, d.map(c => h("div", { class: "pv-ev" }, h("div", {}, h("b", {}, c[0]), h("span", {}, c[1])), btn("Join", e => { const on = e.currentTarget.classList.toggle("on"); e.currentTarget.textContent = on ? "Joined" : "Join"; }, "sm soft"))));
    },
    langs(d) {
      const text = h("p", { class: "pv-q", "data-no-i18n": "" }), seg = h("div", { class: "pv-seg", "data-no-i18n": "", role: "group", "aria-label": "Language" }), pick = i => { text.textContent = d[i][1]; text.dir = d[i][2]; text.lang = d[i][3]; $$("button", seg).forEach((b, j) => b.classList.toggle("on", i === j)); };
      d.forEach((l, i) => seg.append(h("button", { type: "button", onclick: () => pick(i) }, l[0]))); pick(0);
      return h("div", { class: "pv" }, seg, text, h("p", { class: "pv-out" }, "Every page, in all three."));
    },
    houses(d) {
      const pts = d.map(x => x[2]), list = h("div", { class: "pv-list" }), draw = () => { const top = Math.max(...pts); $$("button", list).forEach((b, i) => { b.querySelector("i").style.width = pts[i] / top * 100 + "%"; b.querySelector("em").textContent = pts[i]; }); };
      d.forEach((x, i) => list.append(h("button", { type: "button", class: "pv-house house-" + x[1], onclick: () => { pts[i] += 25; draw(); } }, h("span", {}, x[0]), h("u", {}, h("i", {})), h("em", {}))));
      draw(); return h("div", { class: "pv" }, list, h("p", { class: "pv-out" }, "Tap a house to add points."));
    },
    notice(d) {
      const n = h("b", {}, d[1]), b = btn("Mark as read", e => { n.textContent = d[1] + 1; e.currentTarget.disabled = true; e.currentTarget.textContent = "Read"; bar.style.width = (d[1] + 1) / d[2] * 100 + "%"; }), bar = h("i", { style: { width: d[1] / d[2] * 100 + "%" } });
      return h("div", { class: "pv" }, h("p", { class: "pv-q" }, d[0]), b, h("div", { class: "pv-bar" }, bar), h("p", { class: "pv-out" }, "Read by ", n, " of " + d[2]));
    },
    overview(d) {
      const out = h("p", { class: "pv-out", role: "status" }, "Tap a square to see that topic."), grid = h("div", { class: "pv-heat", style: { "--c": d.units.length } }, h("span", {}), d.units.map(u => h("b", {}, u)));
      d.rows.forEach(r => { grid.append(h("span", {}, r[0])); r[1].forEach((v, i) => grid.append(h("button", { type: "button", class: "h" + v, "aria-label": r[0] + ", " + d.units[i], onclick: () => { out.textContent = r[0] + " · " + d.units[i] + " · " + ["Not started", "Needs help", "Secure", "Mastered"][v]; } }))); });
      return h("div", { class: "pv" }, grid, out);
    }
  };
  const SAMPLE = {
    mastery: { q: "What is three quarters of 120?", opts: ["60", "80", "90", "100"], a: 2 },
    review: [["What is a metaphor?", "Saying one thing is another: the classroom was a zoo."], ["What does a semicolon join?", "Two full sentences that belong together."]],
    next: [["Due tomorrow", "Finish your source analysis", "Suggested from your deadlines"], ["In your playlist", "Watch part two of the Silk Road", "About ten minutes"], ["Review queue", "Three flashcards are waiting", "Spaced out so they stick"]],
    notice: ["Auditions for the school play open on Thursday.", 23, 28]
  };

  /* ---------- the subjects: the same list the portals use ---------- */
  const S = [
    { id: "maths", name: "Maths", c: "#4cc4cf", line: "Number, algebra, geometry and data, one unit at a time.", t: "Mastery checkpoint", p: "mastery", d: SAMPLE.mastery },
    { id: "english", name: "English", c: "#7a95ff", line: "Reading, writing and speaking, with room for your own voice.", t: "Review queue", p: "review", d: SAMPLE.review },
    { id: "science", name: "Science", c: "#30a46c", line: "Biology, chemistry and physics, tested by doing.", t: "Lesson playlist", p: "playlist", d: ["Watch: how enzymes work", "Read: the lock and key model", "Quiz: five quick questions"] },
    { id: "geography", name: "Geography", c: "#3e8fe0", line: "People, places and the big questions about the planet.", t: "School calendar", p: "calendar", d: [["Thursday", "Year 8 field trip"], ["Monday", "Map skills quiz"], ["Wednesday", "Rivers project due"]] },
    { id: "history", name: "History", c: "#e0a75c", line: "What happened, why it mattered and how we know.", t: "What to do next", p: "next", d: SAMPLE.next },
    { id: "computing", name: "Computing", c: "#2fa9b5", line: "Code, data and how the digital world works.", t: "Draft, then hand in", p: "draft" },
    { id: "art", name: "Art & Design", c: "#e5484d", line: "Drawing, design, photography and making things.", t: "Competitions", p: "comp", d: ["6 days left", "Design the house banner", "Open to every year group"] },
    { id: "music", name: "Music", c: "#8a6bf0", line: "Listening, playing, composing and performing together.", t: "ECA clubs", p: "clubs", d: [["Choir", "Monday · 15:15"], ["Ukulele club", "Wednesday · 15:15"], ["Music theory", "Thursday · 15:15"]] },
    { id: "languages", name: "Languages", c: "#1b8e99", line: "New words, new voices and the confidence to use them.", t: "Three languages", p: "langs", d: [["English", "The trip leaves at eight on Thursday.", "ltr", "en"], ["Français", "Le départ est jeudi à huit heures.", "ltr", "fr"], ["العربية", "تنطلق الرحلة يوم الخميس في الساعة الثامنة.", "rtl", "ar"]] },
    { id: "pe", name: "PE & Wellbeing", c: "#f5c518", line: "Sport, healthy habits and looking after yourself.", t: "House points", p: "houses", d: [["North", "N", 1240], ["East", "E", 1185], ["South", "S", 1310], ["West", "W", 1120]] },
    { id: "drama", name: "Drama", c: "#c66bf0", line: "Stories, stagecraft and finding your voice.", t: "Announcements with receipts", p: "notice", d: SAMPLE.notice }
  ];
  const art = id => "assets/art/subj/" + id + ".svg";
  const folio = (s, n) => h("span", { class: "pg-folio", "aria-hidden": "true" }, String(S.indexOf(s) * 2 + n));
  const leftOf = s => h("div", { class: "pg-body" }, folio(s, 2), h("h2", {}, s.name), h("p", {}, s.line), h("img", { class: "pg-art", src: art(s.id), alt: "" }), h("a", { class: "pg-go", href: home }, "Open this subject"));
  const rightOf = s => h("div", { class: "pg-body" }, h("div", { class: "pg-head" }, h("b", {}, s.t), h("span", { class: "pv-tag" }, "Sample preview")), P[s.p](s.d), folio(s, 3));

  /* ---------- build the scene ---------- */
  const NIB = "M256 18C245 88 206 158 204 222 203 262 231 288 240 328 244 348 248 370 252.500 394V242.586A15 15 0 0 1 252.500 213.414V92C252.500 90 254 88 256 88 258 88 259.500 90 259.500 92V213.414A15 15 0 0 1 259.500 242.586V394C264 370 268 348 272 328 281 288 309 262 308 222 306 158 267 88 256 18Z";
  const svgNS = "http://www.w3.org/2000/svg", nib = document.createElementNS(svgNS, "svg"); nib.setAttribute("viewBox", "196 10 120 392"); nib.setAttribute("class", "nib"); nib.setAttribute("aria-hidden", "true"); nib.innerHTML = '<path fill="#4cc4cf" d="' + NIB + '"/>';
  const dial = h("img", { class: "dial", src: "assets/art/dial.svg", alt: "", "aria-hidden": "true" });
  const wheel = h("div", { class: "wheel", role: "radiogroup", "aria-label": "Choose a subject" });
  const pgA = h("div", { class: "pg pg-a" }, h("div", { class: "pg-run" }, h("span", { id: "schoolName" }, "Campus"))), pgB = h("div", { class: "pg pg-b paper" });
  const leaf = h("div", { class: "leaf", "aria-hidden": "true" }, h("div", { class: "leaf-f paper" }), h("div", { class: "leaf-b paper" }));
  const live = h("div", { class: "sr", role: "status" }), ribbon = h("span", { class: "ribbon" });
  const book = h("div", { class: "book paper" }, h("img", { class: "book-art", src: "assets/art/book.svg", alt: "An open book" }), pgA, pgB, leaf, ribbon);
  scene.append(dial, wheel, nib, book, live);
  const cards = S.map((s, i) => { const b = h("button", { type: "button", class: "sc", role: "radio", "aria-checked": "false", tabindex: "-1", style: { "--sc": s.c }, onclick: () => pick(i) }, h("img", { src: art(s.id), alt: "", draggable: "false" }), h("span", {}, s.name)); wheel.append(b); return b; });

  /* ---------- the wheel ---------- */
  const n = S.length, step = Math.PI * 2 / n; let cur = 0, a = 0, to = 0, v = 0, grow = still ? 1 : 0, raf = 0;
  const place = () => {
    const Rx = wheel.clientWidth / 2, Ry = wheel.clientHeight, g = .62 + .38 * grow;
    cards.forEach((c, i) => {
      const t = Math.atan2(Math.sin(i * step + a), Math.cos(i * step + a)), off = Math.abs(t), on = Math.max(0, Math.min(1, (1.62 - off) / .28)), near = Math.max(0, 1 - off / (step * .8));
      c.style.transform = "translate(-50%,-50%) translate(" + (Rx * Math.sin(t) * g).toFixed(1) + "px," + (-Ry * Math.cos(t) * g).toFixed(1) + "px) rotate(" + (t * .5).toFixed(3) + "rad) scale(" + (.9 + .2 * near).toFixed(3) + ")";
      c.style.opacity = on * grow; c.style.visibility = on || i === cur ? "visible" : "hidden"; c.style.zIndex = off < step / 2 ? 3 : 1;
    });
    dial.style.transform = "translate(-50%,-50%) rotate(" + a.toFixed(4) + "rad)";
  };
  let was = 0;
  const spin = now => {
    const dt = Math.min(24, was ? (now - was) / 16.7 : 1); was = now;   /* in 60ths of a second, so a slow machine lands at the same moment */
    v += (to - a) * .09 * dt; v *= Math.pow(.74, dt); a += v * dt; grow += (1 - grow) * (1 - Math.pow(.92, dt)); place();
    if (Math.abs(to - a) < .001 && Math.abs(v) < .001 && grow > .995) { a = to; grow = 1; place(); raf = was = 0; return; }
    raf = requestAnimationFrame(spin);
  };
  const kick = () => { if (still) { a = to; grow = 1; place(); } else if (!raf) raf = requestAnimationFrame(spin); };

  /* ---------- the page turn ---------- */
  const fill = (el, body) => { const old = el.querySelector(":scope > .pg-body"); if (old) old.replaceWith(body); else el.append(body); };
  const copy = el => { const c = el.cloneNode(true); $$("[id]", c).forEach(x => x.removeAttribute("id")); $$("input,button,a,textarea", c).forEach(x => x.setAttribute("tabindex", "-1")); return c; };
  let settle = null;
  const show = (s, dir) => {
    const L = leftOf(s), R = rightOf(s), sign = document.documentElement.dir === "rtl" ? -1 : 1;
    live.textContent = CE.t(s.name) + ". " + CE.t(s.t);
    if (still || !dir || !leaf.animate) { fill(pgA, L); fill(pgB, R); return; }
    if (settle) settle();   /* a turn still in the air lands now, or it would overwrite the page it was replaced by */
    const [front, back] = [leaf.children[0], leaf.children[1]]; front.innerHTML = back.innerHTML = "";
    /* forward: the right page lifts and lands on the left; back: the reverse. New content waits underneath the leaf. */
    const fwd = dir > 0; leaf.classList.toggle("rev", !fwd);
    if (fwd) { front.append(copy(pgB)); fill(pgB, R); const c = copy(pgA); fill(c, L.cloneNode(true)); back.append(c); }
    else { front.append(copy(pgA)); fill(pgA, L); const c = copy(pgB); fill(c, R.cloneNode(true)); back.append(c); $$(".pg-a,.pg-b", leaf).forEach(x => x.classList.add("inleaf")); }
    leaf.style.display = "block";
    const turn = leaf.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(" + (fwd ? -180 : 180) * sign + "deg)" }], { duration: 760, easing: "cubic-bezier(.42,.04,.18,1)" });
    settle = () => { settle = null; turn.onfinish = null; turn.cancel(); leaf.style.display = "none"; front.innerHTML = back.innerHTML = ""; if (fwd) fill(pgA, L); else fill(pgB, R); };
    turn.onfinish = settle;
    if (nib.animate) nib.animate([{ transform: "translateX(-50%) rotate(0deg)" }, { transform: "translateX(-50%) rotate(" + 9 * dir + "deg)" }, { transform: "translateX(-50%) rotate(" + -4 * dir + "deg)" }, { transform: "translateX(-50%) rotate(0deg)" }], { duration: 900, easing: "ease-out" });
  };
  function pick(i, focus) {
    i = (i + n) % n; if (i === cur && cards[i].getAttribute("aria-checked") === "true") return;
    const steps = ((i - cur + n + n / 2) % n) - n / 2, dir = steps >= 0 ? 1 : -1; cur = i; to -= steps * step;
    cards.forEach((c, j) => { c.setAttribute("aria-checked", j === i); c.tabIndex = j === i ? 0 : -1; }); if (focus) { cards[i].style.visibility = "visible"; cards[i].focus({ preventScroll: true }); }
    stage.style.setProperty("--subj", S[i].c); CE.aurora.tint(S[i].c); show(S[i], dir); kick();
  }
  wheel.addEventListener("keydown", e => { const rtl = document.documentElement.dir === "rtl", go = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key]; if (go) { e.preventDefault(); pick(cur + go, true); } else if (e.key === "Home") { e.preventDefault(); pick(0, true); } else if (e.key === "End") { e.preventDefault(); pick(n - 1, true); } });
  /* swipe the book or the wheel sideways to turn */
  let sx = null; scene.addEventListener("pointerdown", e => { sx = e.target.closest("input,textarea,a") ? null : e.clientX; });
  addEventListener("pointerup", e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 56) pick(cur + (dx < 0 ? 1 : -1) * (document.documentElement.dir === "rtl" ? -1 : 1)); });
  addEventListener("resize", place);

  /* ---------- pointer and scroll: the stage leans towards you and settles as you leave it ---------- */
  if (!still) {
    let qx = 0, qy = 0, tick = 0;
    if (matchMedia("(hover:hover)").matches) stage.addEventListener("pointermove", e => { qx = e.clientX / innerWidth - .5; qy = e.clientY / innerHeight - .5; if (!tick) tick = requestAnimationFrame(() => { tick = 0; stage.style.setProperty("--px", qx.toFixed(3)); stage.style.setProperty("--py", qy.toFixed(3)); stage.style.setProperty("--mx", (qx + .5) * 100 + "%"); stage.style.setProperty("--my", (qy + .5) * 100 + "%"); CE.aurora.point(qx, qy); }); });
    let st = 0; addEventListener("scroll", () => { if (st) return; st = requestAnimationFrame(() => { st = 0; const p = Math.min(1, scrollY / stage.offsetHeight); if (p < 1 || stage.style.getPropertyValue("--sp") !== "1") stage.style.setProperty("--sp", p.toFixed(3)); }); }, { passive: true });
  }

  /* opening: the book opens and the wheel spins out of it */
  if (!still) { a = 1.1; if (book.animate) book.animate([{ opacity: 0, transform: "translateY(26px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "cubic-bezier(.16,1,.3,1)" }); }
  pick(0); place(); kick();
  if (role) { const a2 = document.querySelector(".crown-side .btn.cyan"); if (a2) { a2.href = home; a2.textContent = role === "student" ? "Open my campus" : "Open staff portal"; } }

  /* ---------- "Schoolwork, too": six real features you can try ---------- */
  const sw = document.getElementById("sw"); if (!sw) return;
  const FEATURES = {
    next: ["next", SAMPLE.next], mastery: ["mastery", SAMPLE.mastery], review: ["review", SAMPLE.review],
    draft: ["draft"], notice: ["notice", SAMPLE.notice],
    overview: ["overview", { units: ["Algebra", "Fractions", "Geometry", "Data"], rows: [["Amira", [3, 3, 2, 1]], ["Ben", [2, 1, 2, 0]], ["Chloe", [3, 2, 3, 3]], ["Dev", [1, 2, 0, 2]]] }]
  };
  const tabs = $$("[data-sw]", sw), panel = sw.querySelector(".sw-panel"), sheet = sw.querySelector(".sw-sheet");
  const open = (t, focus) => {
    tabs.forEach(x => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; });
    const f = FEATURES[t.dataset.sw]; sheet.innerHTML = ""; sheet.append(h("div", { class: "pg-head" }, h("b", {}, t.querySelector("b").textContent), h("span", { class: "pv-tag" }, "Sample preview")), P[f[0]](f[1]));
    sheet.setAttribute("aria-labelledby", t.id); panel.style.setProperty("--pos", tabs.indexOf(t) * 2 + 1); if (focus) t.focus();
  };
  tabs.forEach((t, i) => { t.style.setProperty("--pos", i * 2); t.addEventListener("click", () => open(t)); });
  sw.querySelector("[role=tablist]").addEventListener("keydown", e => { const go = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (!go) return; e.preventDefault(); open(tabs[(tabs.indexOf(document.activeElement) + go + tabs.length) % tabs.length], true); });
  open(tabs[0]);
})();
