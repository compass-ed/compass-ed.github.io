/* Compass Quest: the auto-marked work of every subject, one question at a time. A front end over the existing Compass Ed RPCs (no SQL of its own). */

/* The retry rules, kept free of the page so tools/quest-check.js can run them in Node. */
const QUEST = {
  wrong: results => results.map((r, k) => r.ans !== r.c ? k : -1).filter(k => k >= 0),   // positions marked wrong
  retry(answers, results) { const ask = QUEST.wrong(results); return { ask, answers: answers.map((v, k) => ask.includes(k) ? null : v) }; },   // re-ask only those; right answers are kept
  payload: answers => answers.map(v => v == null ? -1 : v),   // always the full set; unanswered goes as -1
};
if (typeof module === "object" && module.exports) module.exports = QUEST;

(async function () {
  if (typeof CE === "undefined") return;
  const $ = CE.$, h = CE.h, D = CE.date, capi = CE.capi, page = $("#page");
  $(".skip").onclick = e => { e.preventDefault(); page.focus(); }; // a plain #page link would be read as a route by the hash router
  const me = await CE.requireRole(["student", "teacher", "admin"]); if (!me) return;
  const staff = me.role !== "student";
  CE.demoBanner();
  $("#signout").onclick = CE.signOut;
  if (staff) $("#backEd").href = "../teacher/";
  if (CE.langSwitch && !$(".lang-sw")) $(".qtop").append(CE.langSwitch());
  const TABS = staff ? [["Classes", "#/", "users"]] : [["My Quest", "#/", "flag"], ["Review", "#/review", "repeat"], ["Progress", "#/progress", "chart"]];
  $("#qnav").append(...TABS.map(([l, href, ic]) => h("a", { href }, CE.icon(ic), h("span", {}, l))));
  const title = (t, tab) => { document.title = t + " · Compass Quest"; document.body.classList.toggle("playing", tab === "play"); CE.$$("#qnav a").forEach(a => { const on = a.getAttribute("href") === (tab && tab !== "play" ? tab : "#/"); a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); }); };
  const ring = p => { const r = CE.ring(p); r.setAttribute("role", "img"); r.setAttribute("aria-label", p + "%"); if (p >= 100) r.classList.add("full"); return r; };
  const lead = (t, sub, act) => h("div", { class: "page-lead" }, h("div", {}, h("h1", { class: "qh" }, t), sub ? h("div", { class: "sm mut" }, sub) : null), act || null);
  const subjHead = id => h("h2", {}, CE.subjIcon(id), CE.subjName(id));

  /* ---------- student: My Quest ---------- */
  function tasksOf(A, S) {
    const now = Date.now(), tasks = [], set = new Set();
    A.rows.forEach(a => {
      const best = a.sub && a.sub.score != null ? a.sub.score : null, t = { subj: a.subj, title: a.title, due: a.due, best, done: best != null };
      if (a.kind === "quiz" && a.quiz_id) { set.add(a.quiz_id); tasks.push(Object.assign(t, { tag: "Quiz", href: "#/play/" + a.quiz_id + "?assign=" + a.id })); }
      else if (a.kind === "dash") tasks.push(Object.assign(t, { tag: "Compass Dash", note: a.dash_topic, ext: true, href: "../dash/" + (/^\d+$/.test(a.dash_s) && /^\d+$/.test(a.dash_t) ? "#/topic/" + a.dash_s + "/" + a.dash_t : "") }));
    });
    const shown = tasks.filter(t => !t.done || !t.due || new Date(t.due) > now - 7 * 864e5);   // finished work drops off a week after its due date
    const next = {};   // from the subjects you study: the next three unfinished quizzes or checkpoints in each, not the whole course
    S.units.forEach(u => u.quizzes.forEach(q => { const cp = q.kind === "checkpoint", done = q.best != null && (!cp || q.best >= q.threshold); if (done || set.has(q.id) || (next[u.subj] = next[u.subj] || 0) >= 3) return; next[u.subj]++; shown.push({ subj: u.subj, title: q.title, note: u.title, tag: cp ? "Checkpoint" : "Practice quiz", due: null, best: q.best, done: false, href: "#/play/" + q.id }); }));
    return shown;
  }
  const taskRow = t => h("a", { class: "item qtask" + (t.done ? " done" : ""), href: t.href }, ring(t.best || 0),
    h("div", { class: "grow" }, h("div", { class: "t" }, t.title), h("div", { class: "s" }, [t.tag, t.note, t.done ? "Best score counts" : t.due ? D.until(t.due) : null].filter(Boolean).join(" · "))),
    t.done ? h("span", { class: "badge ok" }, CE.icon("check"), "Done") : h("span", { class: "go" }, t.best != null ? "Retry" : t.ext ? "Open" : "Start", CE.icon(t.ext ? "ext" : "arrow")));

  async function home() {
    title("My Quest"); CE.loading(page);
    try {
      const [A, S, R] = await Promise.all([capi("ed_s_assigns"), capi("ed_s_subjects"), capi("ed_s_review")]);
      const bad = [A, S, R].find(x => !x.ok); if (bad) return CE.fail(page, bad);
      const tasks = tasksOf(A, S), done = tasks.filter(t => t.done).length, todo = tasks.find(t => !t.done && !t.ext) || tasks.find(t => !t.done);
      const written = A.rows.filter(a => (a.kind === "homework" || a.kind === "assignment") && (!a.sub || a.sub.status === "draft")).length;
      page.innerHTML = "";
      page.append(h("section", { class: "qhero" }, ring(CE.pct(done, tasks.length)), h("div", { class: "grow" },
        h("h1", { class: "qh" }, "My Quest"), h("div", { class: "sm" }, tasks.length ? done + " of " + tasks.length + " tasks done" : "Nothing set right now"),
        todo ? h("a", { class: "btn qa lg", href: todo.href, style: { marginTop: "12px" } }, done || tasks.some(t => t.best != null) ? "Keep going" : "Start", CE.icon("arrow")) : null)));
      if (R.due.length) page.append(h("a", { class: "item qtask", href: "#/review" }, h("div", { class: "ico" }, CE.icon("repeat")), h("div", { class: "grow" }, h("div", { class: "t" }, "Review cards"), h("div", { class: "s" }, R.due.length === 1 ? "1 card due today" : R.due.length + " cards due today")), h("span", { class: "go" }, "Review", CE.icon("arrow"))));
      const groups = new Map(); tasks.forEach(t => groups.set(t.subj, (groups.get(t.subj) || []).concat(t)));
      groups.forEach((ts, subj) => page.append(h("section", { class: "qgroup" }, subjHead(subj), h("div", { class: "list" }, ...ts.map(taskRow)))));
      if (!tasks.length) page.append(CE.emptyArt("sprout", "You're all caught up", "Quizzes, checkpoints and Compass Dash homework from your teachers will appear here."));
      if (written) page.append(h("a", { class: "sm b qmore", href: "../student/#/assignments" }, written === 1 ? "1 piece of written work is in Compass Ed" : written + " pieces of written work are in Compass Ed", " →"));
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- student: the task player ---------- */
  async function play(p) {
    title("Quest", "play"); CE.loading(page); const assign = +(CE.q("assign") || 0) || null;
    try {
      const r = await capi("ed_s_quiz", { p_id: +p.id }); if (!r.ok) return CE.fail(page, r);
      title(r.title, "play"); page.innerHTML = "";
      const back = h("a", { class: "back", href: "#/" }, "← My Quest"), box = h("div", { class: "card qplay" }), live = h("div", { class: "qsr", role: "status", "aria-live": "polite" });
      page.append(h("div", {}, back), box, live);
      const lock = (t, s) => { box.innerHTML = ""; box.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("lock")), h("div", { class: "b" }, t), h("div", { class: "sm" }, s || ""))); };
      if (r.open === false) return lock(r.opens && new Date(r.opens) > Date.now() ? "This assessment opens " + D.dt(r.opens) : "This assessment closed " + D.dt(r.closes), r.minutes ? "Time limit: " + r.minutes + " minutes." : "");
      if (!r.qs.length) return lock("This quiz has no questions yet.");
      const n = r.qs.length; let answers = new Array(n).fill(null), ask = r.qs.map((_, k) => k), pos = 0, round = 1, why = {}, started = Date.now(), timerId = null, stage = "ask", best = 0;
      const label = (r.kind === "checkpoint" ? "Mastery checkpoint · pass mark " + r.threshold + "%" : "Quiz") + " · " + CE.subjName(r.subj);
      const timer = r.minutes ? h("span", { class: "timer", title: "Time left" }) : null;
      /* Each round is its own attempt on the server, so a timed quiz gets its full time again on a retry round (the server still enforces the closing time). */
      const clock = () => { started = Date.now(); if (!timer) return; clearInterval(timerId); const tick = () => { const left = r.minutes * 60 - Math.floor((Date.now() - started) / 1000); if (left <= 0) { CE.toast("Time's up: marking what you answered.", "bad"); submit(); return; } timer.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); timer.classList.toggle("low", left <= 60); }; tick(); timerId = setInterval(tick, 500); };
      const pick = k => { answers[ask[pos]] = k; render(); const on = $(".opt.on", box); if (on) on.focus(); };
      const move = d => { pos += d; render(); $(".qq", box).focus(); };
      const fwd = () => pos < ask.length - 1 ? move(1) : answers.every(v => v != null) ? submit() : null;
      const key = e => {
        if (stage !== "ask" || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || $(".modal.show, .gate")) return;
        const q = r.qs[ask[pos]], k = e.key.length !== 1 ? -1 : /[1-9]/.test(e.key) ? +e.key - 1 : "abcd".indexOf(e.key.toLowerCase());
        if (k >= 0 && k < q.a.length) { e.preventDefault(); pick(k); }
        else if (e.key === "Enter" && answers[ask[pos]] != null && !(e.target.closest && e.target.closest("a, button:not(.opt.on), summary"))) { e.preventDefault(); fwd(); }
      };
      addEventListener("keydown", key);
      addEventListener("hashchange", () => { clearInterval(timerId); removeEventListener("keydown", key); document.body.classList.remove("playing"); }, { once: true });

      const render = () => {
        const idx = ask[pos], q = r.qs[idx], last = pos === ask.length - 1; box.innerHTML = "";
        box.append(h("div", { class: "row between" }, h("div", { class: "xs b qkick" }, round > 1 ? "Retry · " + label : label), h("div", { class: "row" }, timer, h("span", { class: "badge" }, (pos + 1) + " / " + ask.length))));
        box.append(h("div", { class: "bar", style: { margin: "12px 0 18px" } }, h("i", { style: { width: CE.pct(pos, ask.length) + "%" } })));
        box.append(h("h1", { class: "qq", tabindex: "-1" }, q.q));
        if (why[idx]) box.append(h("details", { class: "sm qwhy" }, h("summary", {}, "A hint from last time"), h("div", { class: "mut" }, why[idx])));
        box.append(h("div", { class: "q", role: "group", "aria-label": "Answers" }, ...q.a.map((o, k) => h("button", { class: "opt" + (answers[idx] === k ? " on" : ""), type: "button", "aria-pressed": String(answers[idx] === k), onclick: () => pick(k) }, h("span", { class: "k", "aria-hidden": "true" }, String(k + 1)), h("span", {}, o)))));
        box.append(h("div", { class: "qact" }, h("button", { class: "btn ghost", type: "button", disabled: pos === 0, "aria-label": "Previous question", onclick: () => move(-1) }, "← Back"),
          h("button", { class: "btn qa grow", type: "button", disabled: last ? answers.some(v => v == null) : answers[idx] == null, onclick: fwd }, last ? "Mark my answers" : "Next →")));
        box.append(h("div", { class: "xs mut qhint" }, "Keys 1 to 4 choose an answer. Enter moves on."));
      };

      const submit = async () => {
        if (stage === "mark") return; stage = "mark"; clearInterval(timerId);
        box.innerHTML = ""; box.append(h("div", { class: "skel" }), h("div", { class: "skel", style: { width: "60%" } })); live.textContent = CE.t("Marking your answers…");
        let x; try { x = await capi("ed_s_quiz_done", { p_id: r.id, p_answers: QUEST.payload(answers), p_assign: assign, p_secs: Math.round((Date.now() - started) / 1000) }); } catch (e) { if (e.message === "bad_key") return; x = { ok: false, error: e.message }; }
        if (!x.ok) {   // answers stay in memory: marking can be sent again without redoing the round
          stage = "fail"; if (x.error === "closed" || x.error === "not_open") return lock(x.error === "closed" ? "This assessment has closed, so these answers could not be marked." : "This assessment is not open yet.");
          box.innerHTML = ""; live.textContent = CE.t("Your answers could not be marked."); box.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("warn")), h("div", { class: "b" }, "Your answers could not be marked."), h("div", { class: "sm" }, CE.errText(x)), h("div", { class: "sm" }, "Your answers are still here."), h("button", { class: "btn qa", type: "button", style: { marginTop: "12px" }, onclick: submit }, "Send them again")));
          return;
        }
        if (x.pts) CE.toast("+" + x.pts + " house points for mastering this unit", "ok");
        best = Math.max(best, x.pct); result(x);
      };

      const resCard = (res, k, full) => { const q = r.qs[k], ok = res.ans === res.c; return h("div", { class: "card flat res " + (ok ? "ok" : "bad") }, h("div", { class: "b" }, (k + 1) + ". " + q.q), h("div", { class: "sm row", style: { gap: "4px" } }, CE.icon(ok ? "check" : "cross"), ok ? q.a[res.c] : "You chose " + (q.a[res.ans] || "nothing") + (full ? " · correct: " + q.a[res.c] : "")), !ok && res.why ? h("div", { class: "sm mut" }, h("b", {}, "Why: "), res.why) : null); };
      /* After a round: the wrong ones with their explanation but not the answer (they are about to be asked again); `stopped` or all right shows everything. */
      const result = (x, stopped) => {
        stage = "done"; const wrong = QUEST.wrong(x.results), fin = stopped || !wrong.length, score = x.score + " / " + x.out_of + " · " + x.pct + "%"; box.innerHTML = "";
        const msg = !wrong.length ? (round > 1 ? "Every question right. That is how it sticks." : "Every question right, first time.") : r.kind === "checkpoint" && !fin ? (x.passed ? "Checkpoint passed. Fix the last few to finish it off." : "Not yet: you need " + r.threshold + "%. Read why, then retry the ones you missed.") : fin ? (r.kind === "checkpoint" ? (x.passed ? "Checkpoint passed. This unit counts as mastered." : "Not yet: you need " + r.threshold + "%. Revisit the lesson and try again.") : "Your best score counts. The ones you missed are in your review queue.") : "Read why, then retry only the ones you missed.";
        const hd = h("h1", { class: "qq", tabindex: "-1", style: { margin: "8px 0 4px" } }, score);
        box.append(h("div", { style: { textAlign: "center", padding: "6px 0 16px" } }, h("div", { class: "big xl", style: { display: "inline-block" } }, CE.icon(!wrong.length ? "trophy" : x.passed && x.pct >= 50 ? "spark" : "muscle")), hd, h("p", { class: "mut", style: { margin: 0 } }, msg), best > x.pct ? h("p", { class: "sm b", style: { margin: "6px 0 0" } }, "Best this time: " + best + "%") : null));
        live.textContent = score + ". " + CE.t(msg);
        if (fin) x.results.forEach((res, k) => box.append(resCard(res, k, true)));
        else { box.append(h("h2", { class: "qsub" }, wrong.length === 1 ? "1 to fix" : wrong.length + " to fix")); wrong.forEach(k => box.append(resCard(x.results[k], k, false))); }
        box.append(h("div", { class: "qact wrap" }, ...(fin ? [h("a", { class: "btn qa grow", href: "#/" }, "Back to My Quest"), wrong.length ? h("a", { class: "btn ghost", href: "#/review" }, "Review queue") : null, h("button", { class: "btn ghost", type: "button", onclick: () => { answers = new Array(n).fill(null); ask = r.qs.map((_, k) => k); pos = 0; round = 1; why = {}; stage = "ask"; clock(); render(); $(".qq", box).focus(); } }, "Start again")]
          : [h("button", { class: "btn qa grow", type: "button", onclick: () => { why = {}; wrong.forEach(k => { why[k] = x.results[k].why; }); ({ ask, answers } = QUEST.retry(answers, x.results)); pos = 0; round++; stage = "ask"; clock(); render(); $(".qq", box).focus(); } }, wrong.length === 1 ? "Retry the 1 I missed" : "Retry the " + wrong.length + " I missed"), h("button", { class: "btn ghost", type: "button", onclick: () => result(x, true) }, "Stop here")])));
        hd.focus();
      };
      clock(); render();
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- student: review (the same spaced queue as Compass Ed) ---------- */
  async function review() {
    title("Review", "#/review"); CE.loading(page);
    try {
      const r = await capi("ed_s_review"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = ""; page.append(lead("Review", "Flashcards made from anything you got wrong, spaced out so it sticks."));
      const tmr = () => r.tomorrow > 0 ? (r.tomorrow === 1 ? "1 card is due tomorrow." : r.tomorrow + " cards are due tomorrow.") : r.tomorrow === 0 ? "Nothing is due tomorrow." : "";
      if (!r.due.length) return page.append(CE.emptyArt("sprout", r.total ? "Nothing due today" : "Your review queue is empty", r.total ? (r.tomorrow > 0 ? tmr() : "You have " + r.total + " cards. The next one is due " + (r.next ? D.short(r.next) : "soon") + ".") : "Wrong quiz answers and lesson key points become flashcards here, spaced out so they stick."));
      let i = 0, flipped = false, done = 0, busy = false; const q = r.due.slice(), box = h("div", { class: "qrev" }); page.append(box);
      const GRADES = [["Forgot", 0, "ghost"], ["Hard", 1, "ghost"], ["Good", 2, ""], ["Easy", 3, "qa"]];
      const grade = async g => { if (busy || !flipped || i >= q.length) return; busy = true; let x; try { x = await capi("ed_s_review_done", { p_id: q[i].id, p_grade: g }); } catch (e) { x = { ok: false, error: e.message }; } busy = false; if (!x.ok) return CE.toast(CE.errText(x), "bad"); done++; i++; flipped = false; if (x.due_in === 1 && r.tomorrow != null) r.tomorrow++; CE.toast(x.due_in ? "Again in " + x.due_in + " day" + (x.due_in > 1 ? "s" : "") : "You'll see it again today"); render(); };
      const key = e => { if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || $(".modal.show, .gate")) return; if (flipped && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(+e.key - 1); } };
      addEventListener("keydown", key); addEventListener("hashchange", () => removeEventListener("keydown", key), { once: true });
      const render = () => {
        box.innerHTML = "";
        if (i >= q.length) return box.append(h("div", { class: "empty", role: "status" }, h("div", { class: "big" }, CE.icon("spark")), h("div", { class: "b" }, "Done for today"), h("div", { class: "sm" }, done + " cards reviewed. " + (tmr() || "Come back tomorrow.")), h("a", { class: "btn qa", href: "#/", style: { marginTop: "12px" } }, "Back to My Quest")));
        const c = q[i];
        box.append(h("div", { class: "row between sm mut", style: { marginBottom: "10px" } }, h("span", { class: "row", style: { gap: "6px" } }, CE.subjIcon(c.subj), CE.subjName(c.subj)), h("span", {}, (i + 1) + " / " + q.length)));
        const card = h("button", { class: "cardf" + (flipped ? " back" : ""), type: "button", "aria-live": "polite", onclick: () => { flipped = !flipped; render(); } }, flipped ? c.back : c.front);
        box.append(h("div", { class: "flash" }, card), h("p", { class: "sm mut", style: { textAlign: "center", margin: "10px 0" } }, flipped ? "How well did you know it?" : "Think of the answer, then tap the card to flip it."));
        if (flipped) box.append(h("div", { class: "grid grades" }, ...GRADES.map(([l, g, k]) => h("button", { class: "btn " + k, type: "button", onclick: () => grade(g) }, l))));
        card.focus({ preventScroll: true });
      };
      render();
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- student: progress (only what the server already counts) ---------- */
  async function progress() {
    title("Progress", "#/progress"); CE.loading(page);
    try {
      const [B, P, C] = await Promise.all([capi("ed_board"), capi("ed_s_progress"), capi("ed_s_cd").catch(() => null)]);
      if (!P.ok) return CE.fail(page, P);
      page.innerHTML = ""; page.append(lead("Progress", "What you have finished, subject by subject."));
      const stat = (n, l) => h("div", { class: "card stat" }, h("div", { class: "n" }, String(n)), h("div", { class: "l sm mut" }, l));
      const stats = h("div", { class: "qstats" }); page.append(stats);
      if (B.ok) stats.append(stat(B.my_pts, "House points"), stat(B.my_week, "Points this week"));
      if (C && C.ok && C.my && C.my.ok !== false) stats.append(stat(C.my.xp || 0, "Compass Dash XP"));
      const subs = P.subjects.filter(s => s.checkpoints || s.assigns || s.quiz_avg != null);
      if (subs.length) page.append(h("section", { class: "qgroup" }, h("h2", {}, "By subject"), h("div", { class: "list" }, ...subs.map(s => { const all = s.checkpoints + s.assigns, got = s.checkpoints_passed + s.assigns_done;
        return h("div", { class: "item qtask" }, ring(CE.pct(got, all)), h("div", { class: "grow" }, h("div", { class: "t" }, s.name), h("div", { class: "s" }, [s.checkpoints ? s.checkpoints_passed + "/" + s.checkpoints + " checkpoints" : null, s.assigns ? s.assigns_done + "/" + s.assigns + " set tasks" : null, s.quiz_avg != null ? "quiz average " + s.quiz_avg + "%" : null].filter(Boolean).join(" · ")))); }))));
      if (P.recent.length) page.append(h("section", { class: "qgroup" }, h("h2", {}, "Recent attempts"), h("div", { class: "list" }, ...P.recent.map(x => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.subjIcon(x.subj)), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.title), h("div", { class: "s xs" }, D.ago(x.at))), h("span", { class: "badge" + (x.score === x.out_of ? " ok" : "") }, x.score + " / " + x.out_of))))));
      if (B.ok && B.recent && B.recent.length) page.append(h("section", { class: "qgroup" }, h("h2", {}, "Points earned"), h("div", { class: "list" }, ...B.recent.map(x => h("div", { class: "item" }, h("span", { class: "badge ink" }, "+" + x.pts), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.reason), h("div", { class: "s xs" }, D.ago(x.at))))))));
      if (!subs.length && !P.recent.length) page.append(CE.emptyArt("sprout", "Nothing to show yet", "Finish a task in My Quest and it will be counted here."));
      page.append(h("a", { class: "sm b qmore", href: "../student/#/progress" }, "Lessons, badges and goals are in Compass Ed", " →"));
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- staff: class completion ---------- */
  async function classes() {
    title("Classes"); CE.loading(page);
    try {
      const r = await capi("ed_t_assigns"); if (!r.ok) return CE.fail(page, r);
      const rows = r.rows.filter(a => a.kind === "quiz" || a.kind === "dash"), stats = {};
      // shortcut: scores are fetched for the 24 most recent tasks only (one call each, four at a time); older rows show the hand-in count without an average. Upgrade if a single RPC ever returns averages.
      const recent = rows.slice(0, 24);
      for (let i = 0; i < recent.length; i += 4) (await Promise.all(recent.slice(i, i + 4).map(a => capi("ed_t_subs", { p_assign: a.id }).catch(() => null)))).forEach((s, k) => { if (!s || !s.ok) return; const sc = s.rows.map(x => x.sub && x.sub.status !== "draft" ? x.sub.score : null).filter(v => v != null); stats[recent[i + k].id] = { done: sc.length, total: s.rows.length, avg: sc.length ? Math.round(sc.reduce((p, v) => p + v, 0) / sc.length) : null }; });
      page.innerHTML = ""; page.append(lead("Class completion", "Auto-marked work only: quizzes and Compass Dash homework.", h("a", { class: "btn qa", href: "../teacher/#/assignments" }, "Set work")));
      if (!rows.length) return page.append(CE.emptyArt("inbox", "No auto-marked work set yet", "Set a quiz or a Compass Dash topic in the staff portal and its completion appears here."));
      const groups = new Map(); rows.forEach(a => groups.set(a.class_id, (groups.get(a.class_id) || []).concat(a)));
      groups.forEach(as => page.append(h("section", { class: "qgroup" }, h("h2", {}, CE.icon("users"), as[0].class), h("div", { class: "list" }, ...as.map(a => { const s = stats[a.id] || { done: a.submitted, total: a.n, avg: null };
        return h("a", { class: "item qtask", href: "../teacher/#/assignment/" + a.id }, ring(CE.pct(s.done, s.total)), h("div", { class: "grow" }, h("div", { class: "t" }, a.title), h("div", { class: "s" }, [a.kind === "dash" ? "Compass Dash" : "Quiz", CE.subjName(a.subj), a.due ? "due " + D.short(a.due) : null, s.done + "/" + s.total + " done"].filter(Boolean).join(" · "))), s.avg != null ? h("span", { class: "badge" }, "avg " + s.avg + "%") : null, h("span", { class: "go" }, CE.icon("arrow"))); })))));
    } catch (e) { CE.fail(page, e); }
  }

  CE.router(staff ? [{ path: "/", handler: classes }] : [{ path: "/", handler: home }, { path: "/play/:id", handler: play }, { path: "/review", handler: review }, { path: "/progress", handler: progress }]);
})();
