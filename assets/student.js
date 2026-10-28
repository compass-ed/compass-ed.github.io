/* CompassED student portal. */
(async function () {
  const $ = CE.$, h = CE.h, D = CE.date, page = $("#page");
  const me = await CE.requireRole(["student"]); if (!me) return;
  CE.demoBanner();
  $("#meAv").textContent = CE.initials(me.name); $("#meName").textContent = me.name;
  $("#meClass").textContent = (me.class ? me.class.name : "No class yet") + (me.year ? " · Year " + me.year : "");
  $("#signout").onclick = CE.signOut;
  CE.shell();

  const S = { home: null };
  const KIND = { homework: "Homework", assignment: "Assignment", quiz: "Quiz" };
  const card = (title, body, extra) => h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, title), extra || null), body);
  const statusBadge = a => a.status === "returned" ? h("span", { class: "badge ok" }, "Returned" + (a.score != null ? " · " + a.score + "%" : "")) : a.status === "submitted" ? h("span", { class: "badge cyan" }, "Handed in") : a.status === "draft" ? h("span", { class: "badge warn" }, "Draft saved") : a.due && new Date(a.due) < Date.now() ? h("span", { class: "badge bad" }, "Overdue") : h("span", { class: "badge" }, D.until(a.due) || "No due date");
  const kindIcon = k => CE.icon({ exam: "exam", trip: "bus", deadline: "alarm", competition: "trophy", due: "alarm" }[k] || "calendar");
  const compBadge = c => h("span", { class: "badge " + (c.kind === "tournament" ? "ink" : c.kind === "challenge" ? "" : "cyan") }, c.kind);

  /* ---------- notifications and counters ---------- */
  async function loadBell() {
    try {
      const r = S.home || await CE.capi("ed_s_home"); if (!r.ok) return;
      const un = r.notifs.filter(n => !n.read).length, bn = $("#bellN"); bn.textContent = un; bn.classList.toggle("hide", !un);
      const pop = $("#bellPop"); pop.innerHTML = "";
      pop.append(h("div", { class: "row between", style: { padding: "4px 10px 8px" } }, h("b", {}, "Notifications"), un ? h("button", { class: "btn sm ghost", onclick: async () => { await CE.capi("ed_notif_read", { p_id: null }); S.home = null; loadBell(); } }, "Mark all read") : null));
      if (!r.notifs.length) pop.append(h("div", { class: "empty" }, "Nothing yet."));
      r.notifs.slice(0, 12).forEach(n => pop.append(h("a", { class: "item" + (n.read ? "" : " un"), href: n.link || "#/", onclick: async () => { pop.classList.remove("show"); if (!n.read) { await CE.capi("ed_notif_read", { p_id: n.id }); S.home = null; loadBell(); } } },
        h("div", { class: "ico sm" }, CE.icon({ grade: "checkcircle", assign: "pencil", announce: "megaphone", event: "calendar", playlist: "book", competition: "trophy", points: "cup", club: "users", peer: "eye" }[n.kind] || "bell")), h("div", { class: "grow" }, h("div", { class: "t sm" }, n.title), h("div", { class: "s xs" }, n.body ? n.body + " · " : "", D.ago(n.created))))));
      const due = r.assigns.filter(a => a.status === "todo" || a.status === "draft").length + (r.review_due ? 1 : 0); $("#nDue").textContent = due; $("#nDue").classList.toggle("hide", !due);
      $("#nAnn").textContent = r.unread_anns; $("#nAnn").classList.toggle("hide", !r.unread_anns);
    } catch (e) {}
  }
  $("#bell").onclick = e => { e.stopPropagation(); $("#bellPop").classList.toggle("show"); };
  document.addEventListener("click", e => { if (!$("#bellWrap").contains(e.target)) $("#bellPop").classList.remove("show"); });

  /* ---------- What to do next ---------- */
  function whatNext(home, subj) {
    const todo = home.assigns.filter(a => a.status === "todo" || a.status === "draft").sort((p, q) => (p.due || "9") < (q.due || "9") ? -1 : 1);
    const soon = todo.find(a => a.due && new Date(a.due) - Date.now() < 48 * 3600000);
    if (soon) return { icon: "alarm", kicker: new Date(soon.due) < Date.now() ? "Overdue" : "Due soon", title: (soon.status === "draft" ? "Finish and hand in: " : "Do: ") + soon.title, sub: CE.subjName(soon.subj) + " · " + D.until(soon.due), href: "#/assignment/" + soon.id, cta: soon.status === "draft" ? "Continue" : "Start" };
    if (home.review_due >= 5) return { icon: "repeat", kicker: "Keep it in memory", title: "Review " + home.review_due + " cards", sub: "About " + Math.ceil(home.review_due / 4) + " minutes", href: "#/review", cta: "Review" };
    if (subj) for (const p of subj.playlists) for (const it of p.items) {
      if (it.t === "lesson") { const l = subj.units.flatMap(u => u.lessons).find(x => x.id === it.id); if (l && !l.done) return { icon: "book", kicker: "Next in " + p.title, title: l.title, sub: CE.subjName(p.subj) + " · " + l.minutes + " min lesson", href: "#/lesson/" + l.id, cta: "Open lesson" }; }
      else { const q = subj.units.flatMap(u => u.quizzes).find(x => x.id === it.id); if (q && (q.best == null || (q.kind === "checkpoint" && q.best < q.threshold))) return { icon: q.kind === "checkpoint" ? "flag" : "question", kicker: "Next in " + p.title, title: q.title, sub: CE.subjName(p.subj) + " · " + q.n + " questions" + (q.best != null ? " · best " + q.best + "%" : ""), href: "#/quiz/" + q.id, cta: q.kind === "checkpoint" ? "Take checkpoint" : "Take quiz" }; }
    }
    if (todo.length) return { icon: "pencil", kicker: "On your list", title: todo[0].title, sub: CE.subjName(todo[0].subj) + (todo[0].due ? " · " + D.until(todo[0].due) : ""), href: "#/assignment/" + todo[0].id, cta: "Open" };
    const comp = home.competitions.find(c => !c.entered);
    if (comp) return { icon: "trophy", kicker: "Open for entries", title: comp.title, sub: comp.kind + " · " + D.left(comp.closes), href: "#/competition/" + comp.id, cta: "Have a look" };
    if (home.review_due) return { icon: "repeat", kicker: "Quick win", title: "Review " + home.review_due + " card" + (home.review_due > 1 ? "s" : ""), sub: "Two minutes, then you're done", href: "#/review", cta: "Review" };
    return { icon: "explore", kicker: "All caught up", title: "Explore something new", sub: "Pick a category and try an activity", href: "#/explore", cta: "Explore" };
  }

  /* ---------- home ---------- */
  async function home() {
    CE.title("Home"); CE.loading(page);
    try {
      const [hm, subj, bd] = await Promise.all([CE.capi("ed_s_home"), CE.capi("ed_s_subjects"), CE.capi("ed_board").catch(() => null)]); if (hm.ok && bd && bd.ok) hm.pts = bd.my_pts;
      if (!hm.ok) return CE.fail(page, hm); S.home = hm; loadBell();
      const nx = whatNext(hm, subj.ok ? subj : null);
      const hour = new Date().getHours(), greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      const todo = hm.assigns.filter(a => a.status === "todo" || a.status === "draft"), week = todo.filter(a => a.due && new Date(a.due) - Date.now() < 7 * 864e5);
      page.innerHTML = "";
      page.append(h("div", {}, h("h2", {}, greet + ", " + me.name.split(" ")[0] + "."), h("p", { class: "mut", style: { margin: 0 } }, todo.length ? todo.length + " thing" + (todo.length > 1 ? "s" : "") + " on your list" + (week.length ? ", " + week.length + " due this week" : "") + "." : "Your list is clear. Time to explore.")));
      page.append(h("a", { class: "card tint next", href: nx.href, style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "big" }, CE.icon(nx.icon)), h("div", {}, h("div", { class: "xs cy b", style: { letterSpacing: ".08em", textTransform: "uppercase" } }, "What to do next · " + nx.kicker), h("div", { class: "b", style: { fontSize: "18px" } }, nx.title), h("div", { class: "sm mut" }, nx.sub)), h("span", { class: "btn" }, nx.cta)));
      if (hm.news.length) { const f = hm.news[0]; page.append(h("a", { class: "card ink", href: "#/news", style: { textDecoration: "none" } }, h("div", { class: "kicker", style: { color: "var(--cyan)" } }, "Campus news"), h("h3", { style: { color: "#fff" } }, f.title), h("p", { class: "mut", style: { margin: 0 } }, f.body.replace(/\*\*/g, "")))); }
      page.append(h("div", { class: "grid g4" },
        h("div", { class: "card stat" }, h("span", { class: "n" }, week.length), h("span", { class: "l" }, "Due this week")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, hm.review_due), h("span", { class: "l" }, "Cards to review")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, hm.activities_done), h("span", { class: "l" }, "Activities done")),
        h("a", { class: "card stat", href: "#/house", style: { textDecoration: "none", color: "inherit" } }, h("span", { class: "n" }, (hm.pts != null ? hm.pts : "–")), h("span", { class: "l" }, "House points"))));
      const g = h("div", { class: "grid g2" }); page.append(g);
      g.append(card("Up next", hm.assigns.filter(a => a.status !== "returned").length ? h("div", { class: "list" }, ...hm.assigns.filter(a => a.status !== "returned").slice(0, 6).map(a => h("a", { class: "item", href: "#/assignment/" + a.id }, h("div", { class: "ico" }, CE.subjIcon(a.subj)), h("div", { class: "grow" }, h("div", { class: "t" }, a.title), h("div", { class: "s" }, CE.subjName(a.subj) + " · " + KIND[a.kind] + (a.due ? " · " + D.short(a.due) : ""))), statusBadge(a)))) : h("div", { class: "empty" }, "No work set yet."), h("a", { class: "btn sm ghost", href: "#/assignments" }, "All")));
      g.append(card("Competitions & challenges", hm.competitions.length ? h("div", { class: "list" }, ...hm.competitions.slice(0, 5).map(c => h("a", { class: "item", href: "#/competition/" + c.id }, h("div", { class: "ico" }, CE.catIcon(c.cat)), h("div", { class: "grow" }, h("div", { class: "t" }, c.title), h("div", { class: "s" }, c.kind + " · " + D.left(c.closes))), c.entered ? h("span", { class: "badge ok" }, "Entered") : compBadge(c)))) : h("div", { class: "empty" }, "Nothing open right now."), h("a", { class: "btn sm ghost", href: "#/competitions" }, "All")));
      g.append(card("Playlists", hm.playlists.length ? h("div", { class: "list" }, ...hm.playlists.map(p => h("a", { class: "item", href: "#/subject/" + p.subj + "?playlist=" + p.id }, h("div", { class: "ico" }, CE.subjIcon(p.subj)), h("div", { class: "grow" }, h("div", { class: "t" }, p.title), h("div", { class: "bar", style: { marginTop: "6px" } }, h("i", { style: { width: CE.pct(p.done, p.n) + "%" } }))), h("span", { class: "badge" + (p.done === p.n ? " ok" : "") }, p.done + "/" + p.n)))) : h("div", { class: "empty" }, "Your teacher hasn't set a playlist yet."), h("a", { class: "btn sm ghost", href: "#/subjects" }, "Subjects")));
      g.append(card("Coming up", hm.events.length ? h("div", { class: "list" }, ...hm.events.slice(0, 5).map(e => h("a", { class: "item", href: "#/calendar" }, h("div", { class: "ico" }, kindIcon(e.kind)), h("div", { class: "grow" }, h("div", { class: "t" }, e.title), h("div", { class: "s" }, D.dt(e.starts) + (e.place ? " · " + e.place : "")))))) : h("div", { class: "empty" }, "Nothing in the next two weeks."), h("a", { class: "btn sm ghost", href: "#/calendar" }, "Calendar")));
      CE.capi("ed_s_cd").then(cd => { if (!cd.ok || !cd.on) return; const my = cd.my && cd.my.ok !== false ? cd.my : null;
        g.append(h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, "Compass Dash"), CE.srcTag("compassdash", "Compass Dash")), cd.linked && my ? h("div", { class: "stack" }, h("div", { class: "grid g3" }, h("div", {}, h("div", { class: "cd-xp" }, (my.xp || 0).toLocaleString()), h("div", { class: "xs mut" }, "XP")), h("div", {}, h("div", { class: "cd-xp" }, (my.wk || 0).toLocaleString()), h("div", { class: "xs mut" }, "This week")), h("div", {}, h("div", { class: "cd-xp" }, my.mast || 0), h("div", { class: "xs mut" }, "Topics mastered"))),
          (my.assigns || []).length ? h("div", { class: "list" }, ...my.assigns.slice(0, 4).map(a => h("a", { class: "item", href: "https://compassdash.github.io/Compassdash/", target: "_blank", rel: "noopener" }, h("div", { class: "ico sm" }, CE.icon("game")), h("div", { class: "grow" }, h("div", { class: "t sm" }, a.title), h("div", { class: "s xs" }, (a.due ? D.until(a.due) : "no due date") + (a.tasks ? " · " + ((a.done || []).length) + " of " + a.tasks + " tasks done" : "")))))) : h("div", { class: "sm mut" }, "No Compass Dash assignments right now."),
          h("div", { class: "row" }, h("a", { class: "btn sm", href: "https://compassdash.github.io/Compassdash/", target: "_blank", rel: "noopener" }, "Open Compass Dash"), h("a", { class: "btn sm ghost", href: "#/house" }, "House cup"))) : h("div", { class: "stack" }, h("p", { class: "sm mut", style: { margin: 0 } }, "Compass Dash is the school's revision site. Link your Compass Dash student code and username to see your XP, mastery and assignments here."), h("div", { class: "row" }, h("a", { class: "btn sm", href: "#/settings" }, "Link my account"), h("a", { class: "btn sm ghost", href: "#/house" }, "House cup"))))); }).catch(() => {});
      CE.api("ed_links").then(l => { if (l.ok && (l.links || []).length) g.append(card("School links", CE.linkTiles(l.links))); }).catch(() => {});
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- explore ---------- */
  async function explore(p) {
    const cat = +(p && p.cat) || 0; CE.title(cat ? CE.catName(cat) : "Explore"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_explore", { p_cat: cat }); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "pill-row" }, h("a", { class: "pill" + (!cat ? " on" : ""), href: "#/explore" }, "All"), ...CE.categories.map(c => h("a", { class: "pill" + (c.id === cat ? " on" : ""), href: "#/explore/" + c.id }, c.name))));
      if (cat) { const c = CE.cat(cat); page.append(h("div", { class: "row" }, h("div", { class: "ico lg" }, CE.icon(c.icon)), h("div", {}, h("h2", { style: { margin: 0 } }, c.name), h("div", { class: "sm mut" }, c.blurb)))); }
      else page.append(h("div", { class: "grid g4" }, ...CE.categories.map(c => h("a", { class: "subj pat", style: { "--pat": "url(" + CE.root + "assets/art/pat-" + (CE.PAT[c.id] || "hub") + ".svg)" }, href: "#/explore/" + c.id }, h("div", { class: "row between" }, h("div", { class: "ico" }, CE.icon(c.icon)), h("span", { class: "badge" }, r.activities.filter(a => a.cat === c.id).length)), h("h4", { style: { margin: 0 } }, c.name), h("div", { class: "xs mut" }, c.blurb)))));
      const open = r.competitions.filter(c => c.open);
      if (open.length) page.append(card("Open competitions & challenges", h("div", { class: "grid g3" }, ...open.map(c => h("a", { class: "card flat feat", href: "#/competition/" + c.id, style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "row between" }, compBadge(c), h("span", { class: "xs mut" }, D.left(c.closes))), h("h4", {}, c.title), h("p", { class: "sm mut", style: { margin: 0 } }, c.blurb), c.entered ? h("span", { class: "badge ok", style: { marginTop: "8px" } }, "Entered") : null)))));
      const acts = r.activities;
      page.append(card((cat ? "" : "All ") + "activities (" + acts.length + ")", acts.length ? h("div", { class: "grid g3" }, ...acts.map(a => h("a", { class: "card flat feat", href: "#/activity/" + a.id, style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "row between" }, h("div", { class: "ico sm" }, CE.catIcon(a.cat)), a.done ? h("span", { class: "badge ok" }, "Done") : h("span", { class: "badge" }, a.minutes + " min")), h("h4", {}, a.title), h("p", { class: "sm mut", style: { margin: 0 } }, a.blurb), h("div", { class: "xs mut", style: { marginTop: "6px" } }, CE.catName(a.cat) + (a.ages !== "all" ? " · " + (a.ages === "11plus" ? "11+" : "under 11") : ""))))) : h("div", { class: "empty" }, "No activities here yet.")));
    } catch (e) { CE.fail(page, e); }
  }

  async function activity(p) {
    CE.title("Activity"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_activity", { p_id: +p.id }); if (!r.ok) return CE.fail(page, r);
      CE.title(r.title); page.innerHTML = "";
      page.append(h("div", {}, h("a", { class: "sm", href: "#/explore/" + r.cat }, "← " + CE.catName(r.cat)), h("h1", { style: { fontSize: "32px", marginTop: "6px" } }, r.title), h("div", { class: "row sm mut" }, h("span", { class: "row", style: { gap: "4px" } }, CE.icon("clock"), r.minutes + " min"), r.done ? h("span", { class: "badge ok" }, "Done") : null), r.blurb ? h("p", { class: "mut" }, r.blurb) : null));
      page.append(CE.blocks(r.blocks));
      const done = h("div", { class: "card tint row between", style: { maxWidth: "780px" } }, h("div", {}, h("div", { class: "b" }, r.done ? "You've done this one." : "Finished?"), h("div", { class: "sm mut" }, "Mark it done to keep track of what you've tried.")), r.done ? null : h("button", { class: "btn cyan", onclick: async e => { e.target.disabled = true; const x = await CE.capi("ed_s_activity_done", { p_id: r.id }); if (x.ok) { CE.toast("Nice one ✓ +" + (x.pts || 5) + " house points", "ok"); S.home = null; done.firstChild.firstChild.textContent = "You've done this one."; e.target.remove(); } else { CE.toast(CE.errText(x), "bad"); e.target.disabled = false; } } }, "Mark as done"));
      page.append(done);
    } catch (e) { CE.fail(page, e); }
  }

  async function competitions() {
    CE.title("Competitions"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_explore", { p_cat: 0 }); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      const open = r.competitions.filter(c => c.open), closed = r.competitions.filter(c => !c.open);
      page.append(h("p", { class: "mut", style: { margin: 0 } }, "Competitions, challenges and tournaments across the campus. Enter before they close; winners get a notification."));
      page.append(card("Open now (" + open.length + ")", open.length ? h("div", { class: "grid g3" }, ...open.map(c => h("a", { class: "card flat feat", href: "#/competition/" + c.id, style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "row between" }, compBadge(c), h("span", { class: "xs mut" }, D.left(c.closes))), h("h4", {}, c.title), h("p", { class: "sm mut", style: { margin: 0 } }, c.blurb), h("div", { class: "row", style: { marginTop: "8px" } }, c.cat ? h("span", { class: "badge" }, CE.catName(c.cat)) : null, c.entered ? h("span", { class: "badge ok" }, "Entered") : null)))) : CE.emptyArt("trophy", "Nothing open right now", "New competitions are announced in Notices.")));
      if (closed.length) page.append(card("Recently closed", h("div", { class: "list" }, ...closed.map(c => h("a", { class: "item", href: "#/competition/" + c.id }, h("div", { class: "ico sm" }, CE.icon("trophy")), h("div", { class: "grow" }, h("div", { class: "t" }, c.title), h("div", { class: "s" }, "Closed " + D.short(c.closes))), c.entered ? h("span", { class: "badge" }, "You entered") : null)))));
    } catch (e) { CE.fail(page, e); }
  }

  async function competition(p) {
    CE.title("Competition"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_comp", { p_id: +p.id }); if (!r.ok) return CE.fail(page, r);
      CE.title(r.title); page.innerHTML = "";
      page.append(h("div", {}, h("a", { class: "sm", href: "#/competitions" }, "← Competitions"), h("div", { class: "row", style: { marginTop: "6px" } }, compBadge(r), r.cat ? h("span", { class: "badge" }, CE.catName(r.cat)) : null, h("span", { class: "badge " + (r.open ? "ok" : "") }, r.open ? "Open · " + D.left(r.closes) : "Closed " + D.short(r.closes))), h("h1", { style: { fontSize: "32px", marginTop: "6px" } }, r.title), r.blurb ? h("p", { class: "mut" }, r.blurb) : null));
      page.append(CE.blocks(r.blocks));
      if (r.results.length) page.append(card("Results", h("div", { class: "list" }, ...r.results.map(x => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("medal")), h("div", { class: "grow" }, h("div", { class: "t" }, x.name), h("div", { class: "s" }, ["", "1st place", "2nd place", "3rd place"][x.place] || x.place + "th")))))));
      const e = r.entry;
      if (e && e.place) page.append(h("div", { class: "card", style: { borderColor: "var(--ok)", maxWidth: "780px" } }, h("div", { class: "hd" }, h("h3", {}, "Your result"), h("span", { class: "badge ok" }, ["", "1st", "2nd", "3rd"][e.place] || e.place + "th")), e.note ? h("div", { class: "pre" }, e.note) : null));
      const body = h("textarea", { class: "in", placeholder: "Your entry: the text, a title, or a description of what you're sending.", style: { minHeight: "160px" } }, e ? e.body : "");
      const links = h("input", { class: "in", placeholder: "Links to photos, videos or files, separated by spaces", value: e ? (e.links || []).join(" ") : "" });
      const show = h("input", { type: "checkbox", checked: !!(e && e.show) });
      page.append(card(e ? "Your entry" : "Enter", h("div", { class: "stack" }, e ? h("div", { class: "sm mut" }, "Entered " + D.dt(e.at) + (r.open ? ". You can update it until the closing date." : ".")) : null, e && e.links && e.links.length ? CE.links(e.links) : null, body, links, r.open ? CE.attach(links) : null, h("label", { class: "chk" }, show, "If I win a place, show my entry in the public gallery"),
        r.open ? h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const ls = links.value.split(/\s+/).filter(x => /^(https?:\/\/|data:)/.test(x)); const x = await CE.capi("ed_s_enter", { p_id: r.id, p_body: body.value, p_links: ls, p_show: show.checked }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); CE.toast(e ? "Entry updated ✓" : "Entered ✓ +10 house points", "ok"); S.home = null; competition(p); } }, e ? "Update entry" : "Enter now")) : h("div", { class: "mut sm" }, "Entries are closed.")), null));
    } catch (e) { CE.fail(page, e); }
  }

  async function news() {
    CE.title("News"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_news"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      if (!r.rows.length) return page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("news")), h("div", { class: "b" }, "No news yet")));
      r.rows.forEach(n => page.append(h("article", { class: "card" + (n.featured ? " tint" : ""), style: { maxWidth: "820px" } }, n.cover && /^https:\/\//.test(n.cover) ? h("img", { src: n.cover, alt: "", style: { borderRadius: "12px", marginBottom: "12px", width: "100%" }, loading: "lazy" }) : null, n.featured ? h("span", { class: "badge cyan" }, "Featured") : null, h("h3", { style: { marginTop: "6px" } }, n.title), h("div", { html: CE.rich(n.body) }), h("div", { class: "xs mut" }, (n.from ? n.from + " · " : "") + D.long(n.created)))));
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- schoolwork ---------- */
  async function subjects() {
    CE.title("Subjects"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_subjects"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("p", { class: "mut", style: { margin: 0 } }, "Subjects with lessons and quizzes set for your class appear first."));
      const grid = h("div", { class: "grid g3" }); page.append(grid);
      const order = CE.subjects.slice().sort((a, b) => (r.units.some(u => u.subj === b.id) - r.units.some(u => u.subj === a.id)) || a.id - b.id);
      order.forEach(s => {
        const us = r.units.filter(u => u.subj === s.id), ls = us.flatMap(u => u.lessons), done = ls.filter(l => l.done).length, cps = us.flatMap(u => u.quizzes).filter(q => q.kind === "checkpoint"), passed = cps.filter(q => q.best != null && q.best >= q.threshold).length;
        grid.append(h("a", { class: "subj" + (us.length ? "" : " off"), href: "#/subject/" + s.id }, h("div", { class: "row between" }, h("div", { class: "ico" }, CE.icon(s.icon)), us.length ? h("span", { class: "badge cyan" }, us.length + " unit" + (us.length > 1 ? "s" : "")) : h("span", { class: "badge" }, "No units yet")),
          h("h3", { style: { margin: 0 } }, s.name), ls.length ? h("div", {}, h("div", { class: "row between sm" }, h("span", {}, done + "/" + ls.length + " lessons"), h("span", { class: "mut" }, passed + "/" + cps.length + " checkpoints")), h("div", { class: "bar", style: { marginTop: "6px" } }, h("i", { style: { width: CE.pct(done, ls.length) + "%" } }))) : h("div", { class: "xs mut" }, "Nothing set for your class yet")));
      });
    } catch (e) { CE.fail(page, e); }
  }

  async function subject(p) {
    const id = +p.id, s = CE.subj(id); CE.title(s.name); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_subjects"); if (!r.ok) return CE.fail(page, r);
      const units = r.units.filter(u => u.subj === id), pls = r.playlists.filter(x => x.subj === id), want = +(CE.q("playlist") || 0);
      page.innerHTML = "";
      page.append(h("div", { class: "row" }, h("div", { class: "ico lg" }, CE.icon(s.icon)), h("div", {}, h("h2", { style: { margin: 0 } }, s.name), h("div", { class: "sm mut" }, units.length + " unit" + (units.length !== 1 ? "s" : "") + " · " + units.flatMap(u => u.lessons).length + " lessons"))));
      if (pls.length) {
        const c = card("Lesson playlists", h("div", { class: "stack" })); page.append(c);
        pls.forEach(pl => {
          const items = pl.items.map(it => it.t === "lesson" ? { it, l: r.units.flatMap(u => u.lessons).find(x => x.id === it.id) } : { it, q: r.units.flatMap(u => u.quizzes).find(x => x.id === it.id) }).filter(x => x.l || x.q);
          const done = items.filter(x => x.l ? x.l.done : (x.q.best != null && (x.q.kind !== "checkpoint" || x.q.best >= x.q.threshold))).length;
          const box = h("div", { class: "card flat", id: "pl" + pl.id, style: want === pl.id ? { borderColor: "var(--cyan)" } : null }, h("div", { class: "hd" }, h("h4", { style: { margin: 0 }, class: "row" }, CE.icon("play"), pl.title), h("span", { class: "badge" + (done === items.length ? " ok" : " cyan") }, done + "/" + items.length)), h("div", { class: "bar", style: { marginBottom: "10px" } }, h("i", { style: { width: CE.pct(done, items.length) + "%" } })), h("div", { class: "list" }));
          let unlockedNext = true;
          items.forEach((x, i) => { const ok = x.l ? x.l.done : (x.q.best != null && (x.q.kind !== "checkpoint" || x.q.best >= x.q.threshold)); const cur = !ok && unlockedNext; if (!ok) unlockedNext = false;
            box.lastChild.append(h("a", { class: "item", href: x.l ? "#/lesson/" + x.l.id : "#/quiz/" + x.q.id, style: cur ? { borderColor: "var(--cyan)" } : null }, h("div", { class: "ico sm" }, CE.icon(ok ? "checkcircle" : x.l ? "lesson" : x.q.kind === "checkpoint" ? "flag" : "question")), h("div", { class: "grow" }, h("div", { class: "t" }, (i + 1) + ". " + (x.l ? x.l.title : x.q.title)), h("div", { class: "s" }, x.l ? x.l.minutes + " min lesson" : x.q.n + " questions" + (x.q.best != null ? " · best " + x.q.best + "%" : "") + (x.q.kind === "checkpoint" ? " · pass mark " + x.q.threshold + "%" : ""))), cur ? h("span", { class: "badge cyan" }, "Next") : null)); });
          c.lastChild.append(box);
        });
        if (want) setTimeout(() => { const el = $("#pl" + want); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
      }
      if (!units.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon(s.icon)), h("div", { class: "b" }, "No units for " + s.name + " yet")));
      units.forEach(u => {
        const cps = u.quizzes.filter(q => q.kind === "checkpoint"), passed = cps.some(q => q.best != null && q.best >= q.threshold), done = u.lessons.filter(l => l.done).length;
        const c = h("div", { class: "card" }, h("div", { class: "hd" }, h("div", {}, h("h3", {}, u.title), h("div", { class: "sm mut" }, u.summary)), passed ? h("span", { class: "badge ok" }, CE.icon("flag"), "Mastered") : cps.length ? h("span", { class: "badge" }, "Checkpoint " + (cps[0].best != null ? cps[0].best + "%" : "not taken")) : null), h("div", { class: "bar", style: { marginBottom: "12px" } }, h("i", { style: { width: CE.pct(done, u.lessons.length) + "%" } })), h("div", { class: "list" }));
        u.lessons.forEach(l => c.lastChild.append(h("a", { class: "item", href: "#/lesson/" + l.id }, h("div", { class: "ico sm" }, CE.icon(l.done ? "checkcircle" : "lesson")), h("div", { class: "grow" }, h("div", { class: "t" }, l.title), h("div", { class: "s" }, l.minutes + " min")), h("span", { class: "badge" + (l.done ? " ok" : "") }, l.done ? "Done" : "Lesson"))));
        u.quizzes.forEach(q => c.lastChild.append(h("a", { class: "item", href: "#/quiz/" + q.id }, h("div", { class: "ico sm" }, CE.icon(q.kind === "checkpoint" ? "flag" : "question")), h("div", { class: "grow" }, h("div", { class: "t" }, q.title), h("div", { class: "s" }, q.n + " questions · " + (q.tries ? q.tries + " attempt" + (q.tries > 1 ? "s" : "") + " · best " + q.best + "%" : "not tried yet") + (q.kind === "checkpoint" ? " · pass mark " + q.threshold + "%" : ""))), q.kind === "checkpoint" ? h("span", { class: "badge " + (q.best != null && q.best >= q.threshold ? "ok" : q.best != null ? "warn" : "ink") }, q.best != null && q.best >= q.threshold ? "Passed" : q.best != null ? "Try again" : "Checkpoint") : h("span", { class: "badge" + (q.best != null ? " cyan" : "") }, q.best != null ? q.best + "%" : "Quiz"))));
        page.append(c);
      });
    } catch (e) { CE.fail(page, e); }
  }

  async function lesson(p) {
    CE.title("Lesson"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_lesson", { p_id: +p.id }); if (!r.ok) return CE.fail(page, r);
      CE.title(r.title); page.innerHTML = "";
      page.append(h("div", {}, h("a", { class: "sm", href: "#/subject/" + r.unit.subj }, "← " + CE.subjName(r.unit.subj) + " · " + r.unit.title), h("h1", { style: { fontSize: "32px", marginTop: "6px" } }, r.title), h("div", { class: "row sm mut" }, h("span", { class: "row", style: { gap: "4px" } }, CE.icon("clock"), r.minutes + " min"), r.done ? h("span", { class: "badge ok" }, "Completed") : null)));
      page.append(CE.blocks(r.blocks));
      const done = h("div", { class: "card tint row between", style: { maxWidth: "780px" } }, h("div", {}, h("div", { class: "b" }, r.done ? "You've completed this lesson." : "Finished reading?"), h("div", { class: "sm mut" }, "Key points go into your review queue so you don't forget them.")),
        h("div", { class: "row" }, r.done ? null : h("button", { class: "btn cyan", onclick: async e => { e.target.disabled = true; const x = await CE.capi("ed_s_lesson_done", { p_id: r.id }); if (x.ok) { CE.toast("Lesson completed ✓", "ok"); S.home = null; done.firstChild.firstChild.textContent = "You've completed this lesson."; e.target.remove(); loadBell(); } else { CE.toast(CE.errText(x), "bad"); e.target.disabled = false; } } }, "Mark as complete"), r.next ? h("a", { class: "btn ghost", href: "#/lesson/" + r.next.id }, "Next: " + r.next.title + " →") : h("a", { class: "btn ghost", href: "#/subject/" + r.unit.subj }, "Back to unit")));
      page.append(done);
    } catch (e) { CE.fail(page, e); }
  }

  async function quiz(p) {
    CE.title("Quiz"); CE.loading(page); const assign = +(CE.q("assign") || 0) || null;
    try {
      const r = await CE.capi("ed_s_quiz", { p_id: +p.id }); if (!r.ok) return CE.fail(page, r);
      CE.title(r.title); page.innerHTML = "";
      if (r.open === false) { page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("lock")), h("div", { class: "b" }, r.opens && new Date(r.opens) > Date.now() ? "This assessment opens " + D.dt(r.opens) : "This assessment closed " + D.dt(r.closes)), h("div", { class: "sm" }, r.minutes ? "Time limit: " + r.minutes + " minutes." : ""))); return; }
      const answers = new Array(r.qs.length).fill(null); let i = 0; const started = Date.now(); let timerId = null;
      const box = h("div", { class: "card", style: { maxWidth: "760px" } }); page.append(box);
      const timer = r.minutes ? h("span", { class: "timer" }, r.minutes + ":00") : null;
      if (timer) { timerId = setInterval(() => { const left = r.minutes * 60 - Math.floor((Date.now() - started) / 1000); if (left <= 0) { clearInterval(timerId); CE.toast("Time's up: marking what you answered.", "bad"); submit(true); return; } timer.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); timer.classList.toggle("low", left <= 60); }, 500); addEventListener("hashchange", () => clearInterval(timerId), { once: true }); }
      const render = () => {
        box.innerHTML = ""; const q = r.qs[i];
        box.append(h("div", { class: "row between" }, h("div", {}, h("div", { class: "xs cy b", style: { textTransform: "uppercase", letterSpacing: ".08em" } }, (r.kind === "checkpoint" ? "Mastery checkpoint · pass mark " + r.threshold + "%" : "Quiz") + " · " + CE.subjName(r.subj)), h("h3", { style: { margin: 0 } }, r.title)), h("div", { class: "row" }, timer, h("span", { class: "badge" }, (i + 1) + " / " + r.qs.length))));
        box.append(h("div", { class: "bar", style: { margin: "12px 0 18px" } }, h("i", { style: { width: CE.pct(i, r.qs.length) + "%" } })));
        box.append(h("div", { class: "b", style: { fontSize: "18px", marginBottom: "12px" } }, q.q));
        const opts = h("div", { class: "q" }); box.append(opts);
        q.a.forEach((o, k) => opts.append(h("button", { class: "opt" + (answers[i] === k ? " on" : ""), onclick: () => { answers[i] = k; render(); } }, h("span", { class: "k" }, "ABCD"[k]), o)));
        box.append(h("div", { class: "row between", style: { marginTop: "18px" } }, h("button", { class: "btn ghost", disabled: i === 0, onclick: () => { i--; render(); } }, "← Back"), i < r.qs.length - 1 ? h("button", { class: "btn", disabled: answers[i] == null, onclick: () => { i++; render(); } }, "Next →") : h("button", { class: "btn cyan", disabled: answers.some(a => a == null), onclick: submit }, "Finish and mark")));
      };
      const submit = async (forced) => {
        if (timerId) clearInterval(timerId);
        box.innerHTML = ""; box.append(h("div", { class: "skel" }));
        const x = await CE.capi("ed_s_quiz_done", { p_id: r.id, p_answers: forced ? answers.map(v => v == null ? -1 : v) : answers, p_assign: assign, p_secs: Math.round((Date.now() - started) / 1000) }); if (!x.ok) return CE.fail(box, x);
        if (x.pts) CE.toast("+" + x.pts + " house points for mastering this unit", "ok");
        S.home = null; loadBell(); box.innerHTML = "";
        box.append(h("div", { style: { textAlign: "center", padding: "10px 0 18px" } }, h("div", { class: "big xl", style: { display: "inline-block" } }, CE.icon(x.passed ? (x.pct === 100 ? "trophy" : "spark") : "muscle")), h("h2", {}, x.score + " / " + x.out_of + " · " + x.pct + "%"), h("p", { class: "mut" }, r.kind === "checkpoint" ? (x.passed ? "Checkpoint passed. This unit counts as mastered." : "Not yet: you need " + r.threshold + "%. Look at the ones you missed, revisit the lesson and try again.") : (x.pct >= 80 ? "Great work." : "Have a look at the explanations below. Wrong answers are now in your review queue."))));
        x.results.forEach((res, k) => { const q = r.qs[k], ok = res.ans === res.c; box.append(h("div", { class: "card flat", style: { marginBottom: "8px", borderColor: ok ? "var(--ok)" : "var(--bad)" } }, h("div", { class: "b" }, (k + 1) + ". " + q.q), h("div", { class: "sm row", style: { gap: "4px" } }, CE.icon(ok ? "check" : "cross"), ok ? q.a[res.c] : "You chose " + (q.a[res.ans] || "nothing") + " · correct: " + q.a[res.c]), res.why ? h("div", { class: "sm mut" }, res.why) : null)); });
        box.append(h("div", { class: "row", style: { marginTop: "14px" } }, h("button", { class: "btn", onclick: () => { answers.fill(null); i = 0; render(); } }, "Try again"), assign ? h("a", { class: "btn ghost", href: "#/assignment/" + assign }, "Back to assignment") : h("a", { class: "btn ghost", href: "#/subject/" + r.subj }, "Back to " + CE.subjName(r.subj)), x.results.some(z => z.ans !== z.c) ? h("a", { class: "btn soft", href: "#/review" }, "Review queue") : null));
      };
      render();
    } catch (e) { CE.fail(page, e); }
  }

  async function assignments() {
    CE.title("Assignments"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_assigns"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = ""; let any = false;
      [["To do", a => !a.sub || a.sub.status === "draft"], ["Handed in", a => a.sub && a.sub.status === "submitted"], ["Returned", a => a.sub && a.sub.status === "returned"]].forEach(([t, f]) => { const rows = r.rows.filter(f); if (!rows.length) return; any = true; page.append(card(t + " (" + rows.length + ")", h("div", { class: "list" }, ...rows.map(a => h("a", { class: "item", href: "#/assignment/" + a.id }, h("div", { class: "ico" }, CE.subjIcon(a.subj)), h("div", { class: "grow" }, h("div", { class: "t" }, a.title), h("div", { class: "s" }, CE.subjName(a.subj) + " · " + KIND[a.kind] + " · " + a.points + " pts" + (a.due ? " · due " + D.dt(a.due) : ""))), statusBadge(Object.assign({ status: a.sub ? a.sub.status : "todo", score: a.sub && a.sub.score }, a))))))); });
      if (!any) page.append(CE.emptyArt("inbox", "No assignments yet", me.class ? "When your teacher sets work it will appear here." : "You're not in a class yet. Ask a teacher to add you to one."));
    } catch (e) { CE.fail(page, e); }
  }

  async function assignment(p) {
    CE.title("Assignment"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_assigns"); if (!r.ok) return CE.fail(page, r);
      const a = r.rows.find(x => x.id === +p.id); if (!a) return CE.fail(page, "not_found");
      CE.title(a.title); page.innerHTML = ""; const st = a.sub ? a.sub.status : "todo";
      page.append(h("div", {}, h("a", { class: "sm", href: "#/assignments" }, "← Assignments"), h("div", { class: "row between", style: { marginTop: "6px" } }, h("div", {}, h("h2", { style: { margin: 0 } }, a.title), h("div", { class: "sm mut" }, CE.subjName(a.subj) + " · " + KIND[a.kind] + " · " + a.points + " points" + (a.due ? " · due " + D.dt(a.due) : ""))), statusBadge(Object.assign({ status: st, score: a.sub && a.sub.score }, a)))));
      const g = h("div", { class: "grid", style: { gridTemplateColumns: matchMedia("(max-width:900px)").matches ? "1fr" : "minmax(0,1.4fr) minmax(0,1fr)" } }); page.append(g);
      const left = h("div", { class: "stack" }), right = h("div", { class: "stack" }); g.append(left, right);
      left.append(card("Instructions", h("div", { html: CE.rich(a.instr || "No instructions given.") })));
      if (a.kind === "quiz" && a.quiz_id) left.append(h("div", { class: "card tint row between" }, h("div", {}, h("div", { class: "b" }, st === "todo" ? "This is a quiz assignment." : "Best score: " + (a.sub.score != null ? a.sub.score + "%" : "–")), h("div", { class: "sm mut" }, "Your best score counts. You can retake it until the due date.")), h("a", { class: "btn cyan", href: "#/quiz/" + a.quiz_id + "?assign=" + a.id }, st === "todo" ? "Start quiz" : "Retake quiz")));
      else {
        const body = h("textarea", { class: "in", placeholder: "Type your answer, working or notes here. You can save a draft and come back.", style: { minHeight: "220px" } }, a.sub ? a.sub.body : "");
        const links = h("input", { class: "in", placeholder: "Links to files or photos, separated by spaces", value: a.sub ? (a.sub.links || []).join(" ") : "" });
        const info = h("div", { class: "sm mut" }, a.sub ? "Version " + a.sub.ver + (a.sub.sub_at ? " · handed in " + D.dt(a.sub.sub_at) : " · draft") : "Nothing saved yet.");
        const act = async final => { const ls = links.value.split(/\s+/).filter(x => /^https?:\/\//.test(x)); if (final && !(await CE.confirm("Hand in now? Your teacher will see this version. You can still hand in a newer version later.", "Hand in"))) return; const x = await CE.capi("ed_s_submit", { p_assign: a.id, p_body: body.value, p_links: ls, p_final: !!final }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); CE.toast(final ? "Handed in ✓" : "Draft saved", "ok"); S.home = null; assignment(p); };
        left.append(card("Your work", h("div", { class: "stack" }, a.sub && a.sub.links && a.sub.links.length ? CE.links(a.sub.links) : null, body, links, CE.attach(links), info, h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => act(false), disabled: st === "returned" }, "Save draft"), h("button", { class: "btn cyan", onclick: () => act(true) }, st === "todo" || st === "draft" ? "Hand in" : "Hand in new version")))));
        if (a.peer) { const pr = h("div", { class: "card" }, h("h3", {}, "Peer review"), h("div", { class: "skel" })); left.append(pr); peerBox(a, pr); }
      }
      if (a.sub && a.sub.status === "returned") right.append(h("div", { class: "card", style: { borderColor: "var(--ok)" } }, h("div", { class: "hd" }, h("h3", {}, "Feedback"), h("span", { class: "badge ok" }, (a.sub.score != null ? a.sub.score + "%" : "Marked"))), a.sub.feedback ? h("div", { class: "pre" }, a.sub.feedback) : h("div", { class: "mut sm" }, "No written feedback."), h("div", { class: "xs mut", style: { marginTop: "8px" } }, "Marked " + D.dt(a.sub.graded_at))));
      if (a.rubric) { const rb = h("table", { class: "rub" }, h("thead", {}, h("tr", {}, h("th", {}, "Criterion"), ...a.rubric.criteria[0].levels.map(l => h("th", {}, l.label + " (" + l.pts + ")")))), h("tbody", {})); a.rubric.criteria.forEach((c, ci) => rb.lastChild.append(h("tr", {}, h("th", {}, c.name), ...c.levels.map((l, li) => h("td", { class: a.sub && a.sub.rub && a.sub.rub[ci] === li ? "on" : "" }, l.desc))))); right.append(card("Marking rubric: " + a.rubric.title, h("div", { class: "tbw" }, rb))); }
      if (a.sub && a.sub.versions && a.sub.versions.length) right.append(card("Version history", h("div", { class: "list" }, ...a.sub.versions.map(v => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("clock")), h("div", { class: "grow" }, h("div", { class: "t sm" }, "Version " + v.ver + (v.ver === a.sub.ver ? " (current)" : "")), h("div", { class: "s xs" }, D.dt(v.at) + " · " + v.len + " characters")))))));
    } catch (e) { CE.fail(page, e); }
  }

  async function review() {
    CE.title("Review queue"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_review"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      if (!r.due.length) return page.append(CE.emptyArt("sprout", r.total ? "Nothing due today" : "Your review queue is empty", r.total ? "You have " + r.total + " cards. The next one is due " + (r.next ? D.short(r.next) : "soon") + "." : "Wrong quiz answers and lesson key points become flashcards here, spaced out so they stick."));
      let i = 0, flipped = false, done = 0; const q = r.due.slice(); const box = h("div", { style: { maxWidth: "640px" } }); page.append(box);
      const render = () => {
        box.innerHTML = "";
        if (i >= q.length) { box.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("spark")), h("div", { class: "b" }, "Done for today"), h("div", { class: "sm" }, done + " cards reviewed. Come back tomorrow."), h("a", { class: "btn cyan", href: "#/", style: { marginTop: "12px" } }, "Home"))); S.home = null; loadBell(); return; }
        const c = q[i];
        box.append(h("div", { class: "row between sm mut", style: { marginBottom: "10px" } }, h("span", { class: "row", style: { gap: "6px" } }, CE.subjIcon(c.subj), CE.subjName(c.subj)), h("span", {}, (i + 1) + " / " + q.length)));
        box.append(h("div", { class: "flash" }, h("div", { class: "cardf" + (flipped ? " back" : ""), onclick: () => { flipped = !flipped; render(); } }, flipped ? c.back : c.front)));
        box.append(h("p", { class: "sm mut", style: { textAlign: "center", margin: "10px 0" } }, flipped ? "How well did you know it?" : "Think of the answer, then tap the card to flip it."));
        if (flipped) box.append(h("div", { class: "grid g4" }, ...[["Forgot", 0, "ghost"], ["Hard", 1, "ghost"], ["Good", 2, ""], ["Easy", 3, "cyan"]].map(([l, g, k]) => h("button", { class: "btn " + k, onclick: async () => { const x = await CE.capi("ed_s_review_done", { p_id: c.id, p_grade: g }); if (x.ok) { done++; i++; flipped = false; CE.toast(x.due_in ? "Again in " + x.due_in + " day" + (x.due_in > 1 ? "s" : "") : "You'll see it again today"); render(); } else CE.toast(CE.errText(x), "bad"); } }, l))));
        else box.append(h("div", { class: "row", style: { justifyContent: "center" } }, h("button", { class: "btn", onclick: () => { flipped = true; render(); } }, "Show answer")));
      };
      render();
    } catch (e) { CE.fail(page, e); }
  }

  async function progress() {
    CE.title("Progress"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_progress"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      const actsDone = r.activities.reduce((n, a) => n + a.done, 0);
      page.append(h("div", { class: "grid g4" },
        h("div", { class: "card stat" }, h("span", { class: "n" }, r.subjects.reduce((n, s) => n + s.lessons_done, 0)), h("span", { class: "l" }, "Lessons completed")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, r.subjects.reduce((n, s) => n + s.checkpoints_passed, 0)), h("span", { class: "l" }, "Checkpoints passed")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, actsDone), h("span", { class: "l" }, "Activities done")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, r.places.length + "/" + r.entries), h("span", { class: "l" }, "Placed / entered"))));
      const tb = h("table", { class: "tb" }, h("thead", {}, h("tr", {}, h("th", {}, "Subject"), h("th", {}, "Lessons"), h("th", {}, "Checkpoints"), h("th", {}, "Quiz avg"), h("th", {}, "Work handed in"), h("th", {}, "Grade avg"))), h("tbody", {}));
      r.subjects.filter(s => s.lessons || s.assigns || s.quiz_avg != null).forEach(s => tb.lastChild.append(h("tr", {}, h("td", { class: "b" }, h("span", { class: "row", style: { gap: "8px", flexWrap: "nowrap" } }, CE.icon(s.icon), s.name)), h("td", {}, s.lessons ? h("div", {}, h("div", { class: "sm" }, s.lessons_done + "/" + s.lessons), h("div", { class: "bar", style: { width: "90px" } }, h("i", { style: { width: CE.pct(s.lessons_done, s.lessons) + "%" } }))) : h("span", { class: "mut" }, "–")), h("td", {}, s.checkpoints ? s.checkpoints_passed + "/" + s.checkpoints : h("span", { class: "mut" }, "–")), h("td", {}, s.quiz_avg != null ? s.quiz_avg + "%" : h("span", { class: "mut" }, "–")), h("td", {}, s.assigns ? s.assigns_done + "/" + s.assigns : h("span", { class: "mut" }, "–")), h("td", {}, s.grade_avg != null ? s.grade_avg + "%" : h("span", { class: "mut" }, "–")))));
      page.append(card("By subject", tb.lastChild.children.length ? h("div", { class: "tbw" }, tb) : h("div", { class: "empty" }, "No schoolwork set for your class yet.")));
      try { const b = await CE.capi("ed_s_badges"); if (b.ok) { const list = CE.badges(b); page.append(card("Badges · " + list.filter(x => x.on).length + "/" + list.length, h("div", { class: "grid", style: { gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: "8px" } }, ...list.map(x => h("div", { class: "badge-tile" + (x.on ? " on" : ""), title: x.desc }, CE.icon(x.icon), h("div", { class: "t" }, x.name), h("div", { class: "s" }, x.desc)))))); } } catch (e) {}
      const g = h("div", { class: "grid g2" }); page.append(g);
      g.append(card("Campus activities", h("div", { class: "list" }, ...r.activities.map(a => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon(a.icon)), h("div", { class: "grow" }, h("div", { class: "t sm" }, a.name), h("div", { class: "bar", style: { marginTop: "6px" } }, h("i", { style: { width: CE.pct(a.done, a.n) + "%" } }))), h("span", { class: "badge" + (a.n && a.done === a.n ? " ok" : "") }, a.done + "/" + a.n))))));
      g.append(card("Competitions", h("div", { class: "stack" }, r.places.length ? h("div", { class: "list" }, ...r.places.map(x => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("medal")), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.title), h("div", { class: "s xs" }, ["", "1st place", "2nd place", "3rd place"][x.place] || x.place + "th"))))) : h("div", { class: "empty" }, r.entries ? "You've entered " + r.entries + " · no places yet" : "You haven't entered a competition yet."), r.recent.length ? h("div", {}, h("h4", {}, "Recent quizzes"), h("div", { class: "list" }, ...r.recent.slice(0, 6).map(x => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon(x.kind === "checkpoint" ? "flag" : "question")), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.title), h("div", { class: "s xs" }, CE.subjName(x.subj) + " · " + D.ago(x.at))), h("span", { class: "badge " + (CE.pct(x.score, x.out_of) >= 80 ? "ok" : CE.pct(x.score, x.out_of) >= 50 ? "warn" : "bad") }, x.score + "/" + x.out_of))))) : null)));
    } catch (e) { CE.fail(page, e); }
  }

  async function calendar() {
    CE.title("Calendar"); page.innerHTML = "";
    let d = new Date(); d.setDate(1);
    const head = h("div", { class: "row between" }), grid = h("div", { class: "cal" }), list = h("div", { class: "list" });
    page.append(h("div", { class: "card" }, head, grid), card("This month", list));
    const render = async () => {
      head.innerHTML = ""; head.append(h("div", { class: "row" }, h("button", { class: "ib", onclick: () => { d.setMonth(d.getMonth() - 1); render(); } }, "‹"), h("h3", { style: { margin: 0 } }, d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })), h("button", { class: "ib", onclick: () => { d.setMonth(d.getMonth() + 1); render(); } }, "›"), h("button", { class: "btn sm ghost", onclick: () => { d = new Date(); d.setDate(1); render(); } }, "Today")), h("button", { class: "btn sm", id: "ics" }, CE.icon("phone"), "Add to my phone"));
      const from = new Date(d.getFullYear(), d.getMonth(), -7), to = new Date(d.getFullYear(), d.getMonth() + 1, 7);
      const r = await CE.capi("ed_s_calendar", { p_from: D.ymd(from), p_to: D.ymd(to) }); if (!r.ok) return CE.fail(page, r);
      const open = e => { if (e.assign_id) CE.nav("/assignment/" + e.assign_id); else if (e.comp_id) CE.nav("/competition/" + e.comp_id); else CE.modal(h("div", { class: "stack" }, h("span", { class: "badge " + (e.kind === "exam" ? "bad" : e.kind === "trip" ? "warn" : "cyan") }, e.kind), h("h3", {}, e.title), h("div", { class: "row", style: { gap: "6px" } }, CE.icon("calendar"), D.long(e.starts) + (D.time(e.starts) !== "00:00" ? ", " + D.time(e.starts) + (e.ends ? " to " + D.time(e.ends) : "") : "")), e.place ? h("div", { class: "row", style: { gap: "6px" } }, CE.icon("place"), e.place) : null, h("div", { class: "mut sm" }, e.class || "Whole school"), h("button", { class: "btn sm", onclick: () => CE.ics([e], e.title) }, CE.icon("phone"), "Add this to my calendar"))); };
      CE.calendar(grid, d.getFullYear(), d.getMonth(), r.rows, open);
      const month = r.rows.filter(e => new Date(e.starts).getMonth() === d.getMonth()); list.innerHTML = ""; if (!month.length) list.append(h("div", { class: "empty" }, "Nothing this month."));
      month.forEach(e => list.append(h("div", { class: "item click", onclick: () => open(e) }, h("div", { class: "ico sm" }, kindIcon(e.kind)), h("div", { class: "grow" }, h("div", { class: "t sm" }, (e.kind === "due" ? "Due: " : "") + e.title), h("div", { class: "s xs" }, D.dt(e.starts) + (e.place ? " · " + e.place : ""))), CE.srcTag(e.src, e.src_name))));
      $("#ics").onclick = () => CE.ics(r.rows, "CompassED " + d.toLocaleDateString("en-GB", { month: "long" }));
    };
    render();
  }

  async function announcements() {
    CE.title("Announcements"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_anns"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      CE.capi("ed_s_cd").then(cd => { const rows = cd.ok && cd.anns && cd.anns.rows ? cd.anns.rows : []; if (!rows.length) return; page.append(h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, "From your teacher on Compass Dash"), CE.srcTag("compassdash", "Compass Dash")), h("div", { class: "list" }, ...rows.slice(0, 6).map(a => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("bell")), h("div", { class: "grow" }, h("div", { class: "t sm" }, a.body), h("div", { class: "s xs" }, (a.class ? a.class : "Whole school") + (a.created ? " · " + D.ago(a.created) : "")))))))); }).catch(() => {});
      if (!r.rows.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("megaphone")), h("div", { class: "b" }, "No announcements")));
      r.rows.forEach(a => { const c = h("div", { class: "card" + (a.read ? "" : " tint") }, h("div", { class: "hd" }, h("div", { class: "row" }, a.pinned ? h("span", { class: "badge ink" }, CE.icon("pin"), "Pinned") : null, h("span", { class: "badge" }, a.class || "Whole school")), a.read ? h("span", { class: "xs mut" }, "Read") : h("button", { class: "btn sm cyan", onclick: async e => { await CE.capi("ed_s_ann_read", { p_id: a.id }); c.classList.remove("tint"); e.target.replaceWith(h("span", { class: "xs mut" }, "Read")); S.home = null; loadBell(); } }, "Mark as read")), h("h3", {}, a.title), h("div", { html: CE.rich(a.body) }), h("div", { class: "xs mut" }, (a.from ? a.from + " · " : "") + D.ago(a.created))); page.append(c); });
    } catch (e) { CE.fail(page, e); }
  }

  async function settings() {
    CE.title("Settings"); page.innerHTML = "";
    page.append(card("My account", h("div", { class: "stack" }, h("div", {}, h("b", {}, me.name), " · ", h("span", { class: "kbd" }, me.username)), h("div", { class: "sm mut" }, "Class: " + (me.class ? me.class.name : "none yet") + " · Year " + (me.year || "?") + ". A teacher can change these from the People page."), h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: CE.signOut }, "Sign out")))));
    page.append(card("Reading and display", CE.prefsCard()));
    const pl = h("div", { class: "stack" }, h("p", { class: "sm mut", style: { margin: 0 } }, "A private link that shows a parent or carer a read-only weekly summary: what is due, what has been marked, points and events. Anyone with the link can see it, so only share it with them. Making a new link stops the old one working."), h("div", { class: "row" }, h("button", { class: "btn", onclick: () => parentLink(pl, false) }, "Show my link"), h("button", { class: "btn ghost", onclick: () => parentLink(pl, true) }, "Make a new link")));
    page.append(card("Parent summary link", pl));
    const cdBox = h("div", { class: "stack" }, h("p", { class: "sm mut", style: { margin: 0 } }, "Loading…")); page.append(h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, "Compass Dash"), CE.srcTag("compassdash", "Compass Dash")), cdBox));
    const drawCd = async () => { const cd = await CE.capi("ed_s_cd").catch(() => null); cdBox.innerHTML = ""; if (!cd || !cd.ok || !cd.on) return cdBox.append(h("p", { class: "sm mut", style: { margin: 0 } }, "Compass Dash is not connected to this campus."));
      if (cd.linked) return cdBox.append(h("p", { class: "sm", style: { margin: 0 } }, "Linked as ", h("span", { class: "kbd" }, cd.cd_user), ". Your XP, mastery, assignments and teacher notes from Compass Dash show on your Home and Notices pages."), h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: async () => { const x = await CE.capi("ed_s_cd_unlink"); CE.toast(x.ok ? "Unlinked" : CE.errText(x), x.ok ? "ok" : "bad"); drawCd(); } }, "Unlink")));
      const code = h("input", { class: "in", placeholder: "Student code (e.g. 7K3Q)", autocapitalize: "characters", style: { maxWidth: "200px" } }), user = h("input", { class: "in", placeholder: "Compass Dash username", autocapitalize: "off" }), er = h("div", { class: "err" });
      cdBox.append(h("p", { class: "sm mut", style: { margin: 0 } }, "Link the student code and username you use on Compass Dash. CompassED stores them to show your XP, mastery, assignments and announcements from there; unlink any time."), h("div", { class: "row" }, code, user), er, h("button", { class: "btn sm", onclick: async () => { er.textContent = ""; const x = await CE.capi("ed_s_cd_link", { p_code: code.value.trim(), p_user: user.value.trim() }); if (!x.ok) return er.textContent = CE.errText(x); CE.toast("Linked to " + x.cd_user, "ok"); drawCd(); } }, "Link Compass Dash")); };
    drawCd();
    const old = h("input", { class: "in", type: "password", autocomplete: "current-password" }), nw = h("input", { class: "in", type: "password", autocomplete: "new-password", minlength: 8 }), er = h("div", { class: "err" });
    page.append(card("Change password", h("div", { class: "stack", style: { maxWidth: "420px" } }, h("label", { class: "f" }, "Current password", old), h("label", { class: "f" }, "New password (8+ characters)", nw), er, h("button", { class: "btn", onclick: async () => { er.textContent = ""; const r = await CE.capi("ed_pw", { p_old: old.value, p_new: nw.value }); if (!r.ok) return er.textContent = CE.errText(r); CE.toast("Password changed ✓", "ok"); old.value = nw.value = ""; } }, "Change password"))));
  }


  /* ---------- peer review box (inside an assignment) ---------- */
  async function peerBox(a, box) {
    const r = await CE.capi("ed_s_peer", { p_assign: a.id }); box.innerHTML = ""; box.append(h("h3", {}, "Peer review"));
    if (!r.ok) return box.append(h("div", { class: "mut sm" }, CE.errText(r)));
    if (!r.ready) return box.append(h("p", { class: "sm mut", style: { margin: 0 } }, "Hand in first. Then you'll get two classmates' work to review, and they'll review yours. Each review you write earns 5 house points."));
    if (!r.targets.length) box.append(h("p", { class: "sm mut", style: { margin: 0 } }, "Nobody else has handed in yet. Check back later."));
    r.targets.forEach(t => { const ta = h("textarea", { class: "in", style: { minHeight: "90px" }, placeholder: "One thing that works well, one thing to improve." }, t.review || ""); const st = h("select", { class: "in", style: { width: "auto" } }, ...[1, 2, 3, 4, 5].map(n => h("option", { value: n, selected: (t.stars || 3) === n }, "★".repeat(n))));
      box.append(h("div", { class: "card flat stack" }, h("div", { class: "row between" }, h("b", {}, t.name + "'s work"), t.done ? h("span", { class: "badge ok" }, "Reviewed") : h("span", { class: "badge cyan" }, "To review")), h("div", { class: "pre", style: { maxHeight: "200px", overflow: "auto" } }, t.body || "(no text)"), t.links && t.links.length ? CE.links(t.links) : null, h("div", { class: "row" }, h("label", { class: "f" }, "Stars", st), h("div", { class: "grow" })), ta, h("div", { class: "row" }, h("button", { class: "btn sm cyan", onclick: async () => { const x = await CE.capi("ed_s_peer_save", { p_id: t.id, p_body: ta.value, p_stars: +st.value }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); CE.toast("Review sent ✓", "ok"); peerBox(a, box); } }, t.done ? "Update review" : "Send review")))); });
    if (r.received.length) box.append(h("div", {}, h("h4", {}, "Reviews of your work"), h("div", { class: "list" }, ...r.received.map(x => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", { class: "t sm" }, x.name + " · " + "★".repeat(x.stars || 0)), h("div", { class: "s" }, x.body)))))));
  }
  async function parentLink(box, reset) {
    const r = await CE.capi("ed_s_parent_link", { p_reset: reset }); if (!r.ok) return CE.toast(CE.errText(r), "bad");
    const url = new URL(CE.root + "parent.html?t=" + r.tok, location.href).href;
    let out = box.querySelector(".plink"); if (!out) { out = h("div", { class: "plink stack" }); box.append(out); } out.innerHTML = "";
    out.append(h("input", { class: "in", value: url, readonly: true, onclick: e => e.target.select() }), h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(url); CE.toast("Link copied", "ok"); } }, "Copy link"), h("a", { class: "btn sm ghost", href: url, target: "_blank", rel: "noopener" }, "Open it")));
    if (reset) CE.toast("New link made. The old one no longer works.", "ok");
  }

  /* ---------- house points ---------- */
  async function house() {
    CE.title("House points"); CE.loading(page);
    try {
      const r = await CE.capi("ed_board"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      if (!r.my_house) { page.append(h("div", { class: "card tint" }, h("h3", {}, "Choose your house"), h("p", { class: "sm mut" }, "You choose once. After that only a teacher can change it."), h("div", { class: "grid g4" }, ...Object.entries(r.houses).map(([k, v]) => h("button", { class: "btn ghost house-" + k, style: { borderColor: "var(--hc)", color: "var(--hc)" }, onclick: async () => { const x = await CE.capi("ed_s_house", { p_house: k }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); CE.toast("Welcome to " + v + "!", "ok"); house(); } }, v))))); }
      const top = Math.max(1, ...r.house.map(x => x.pts));
      page.append(h("div", { class: "grid g4" }, h("div", { class: "card stat" }, h("span", { class: "n" }, r.my_pts), h("span", { class: "l" }, "My points")), h("div", { class: "card stat" }, h("span", { class: "n" }, r.my_week), h("span", { class: "l" }, "This week")), h("div", { class: "card stat" }, h("span", { class: "n" }, r.my_house ? r.houses[r.my_house] : "–"), h("span", { class: "l" }, "My house")), h("div", { class: "card stat" }, h("span", { class: "n" }, r.students.findIndex(x => x.pts === r.my_pts) + 1 || "–"), h("span", { class: "l" }, "My rank"))));
      page.append(card("Houses", h("div", { class: "stack" }, ...r.house.map((x, i) => h("div", { class: "house-" + x.house }, h("div", { class: "row between sm" }, h("b", {}, (i + 1) + ". " + (r.houses[x.house] || x.house) + (x.house === r.my_house ? " (mine)" : "")), h("span", {}, x.pts.toLocaleString() + " pts · " + x.week + " this week")), h("div", { class: "hbar" }, h("i", { style: { width: CE.pct(x.pts, top) + "%" } })))))));
      CE.capi("ed_s_cd").then(cd => { const c = CE.cdHousesCard(cd.ok ? cd : null, r.my_house); if (c) page.append(c); }).catch(() => {});
      const g = h("div", { class: "grid g2" }); page.append(g);
      g.append(card("Top students", h("div", { class: "list" }, ...r.students.slice(0, 15).map((x, i) => h("div", { class: "item" }, h("span", { class: "badge" + (i < 3 ? " cyan" : "") }, i + 1), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.name), h("div", { class: "s xs" }, [x.class, x.house ? r.houses[x.house] : null].filter(Boolean).join(" · "))), h("span", { class: "b" }, x.pts))))));
      g.append(card("Classes", h("div", { class: "list" }, ...r.classes.map((x, i) => h("div", { class: "item" }, h("span", { class: "badge" }, i + 1), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.name), h("div", { class: "s xs" }, x.n + " students · " + Math.round(x.pts / Math.max(1, x.n)) + " each")), h("span", { class: "b" }, x.pts))))));
      page.append(card("My recent points", r.recent.length ? h("div", { class: "list" }, ...r.recent.map(x => h("div", { class: "item" }, h("span", { class: "badge " + (x.pts >= 0 ? "ok" : "bad") }, (x.pts >= 0 ? "+" : "") + x.pts), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.reason), h("div", { class: "s xs" }, D.ago(x.at)))))) : h("div", { class: "empty" }, "Points come from activities, competitions, mastery checkpoints, peer reviews and your teachers.")));
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- clubs ---------- */
  async function clubs() {
    CE.title("Clubs"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_clubs"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      const mine = r.rows.filter(c => c.joined);
      page.append(h("p", { class: "mut", style: { margin: 0 } }, mine.length ? "You're in " + mine.map(c => c.title).join(", ") + "." : "Sign up to a club: places are first come, first served."));
      if (!r.rows.length) return page.append(h("div", { class: "empty" }, "No clubs yet."));
      page.append(h("div", { class: "grid g3" }, ...r.rows.map(c => h("div", { class: "card feat" + (c.joined ? " tint" : "") }, h("div", { class: "row between" }, h("div", { class: "ico" }, c.cat ? CE.catIcon(c.cat) : CE.icon("users")), h("span", { class: "badge" + (c.n >= c.capacity ? " bad" : "") }, c.n + "/" + c.capacity)), h("h4", {}, c.title), h("p", { class: "sm mut", style: { margin: 0 } }, c.blurb), h("div", { class: "sm" }, c.day + " · " + c.time + (c.place ? " · " + c.place : "") + (c.lead ? " · " + c.lead : "")), c.ages !== "all" ? h("span", { class: "badge" }, c.ages === "11plus" ? "11 and over" : "Under 11") : null,
        h("div", { class: "row" }, c.joined ? h("button", { class: "btn sm ghost", onclick: async () => { if (!(await CE.confirm("Leave " + c.title + "?", "Leave"))) return; const x = await CE.capi("ed_s_club_join", { p_id: c.id, p_join: false }); if (x.ok) clubs(); } }, "Leave") : h("button", { class: "btn sm cyan", disabled: c.n >= c.capacity, onclick: async () => { const x = await CE.capi("ed_s_club_join", { p_id: c.id, p_join: true }); if (!x.ok) return CE.toast(x.error === "full" ? "That club is full." : CE.errText(x), "bad"); CE.toast("You're in ✓", "ok"); clubs(); } }, c.n >= c.capacity ? "Full" : "Sign up"))))));
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- search ---------- */
  async function search() {
    CE.title("Search"); page.innerHTML = "";
    const res = h("div", { class: "stack" }); let data = null;
    const run = q => { res.innerHTML = ""; if (!data) return res.append(h("div", { class: "skel" })); if (q.length < 2) return res.append(h("div", { class: "empty" }, "Type at least two letters.")); const hit = t => String(t || "").toLowerCase().includes(q); const rows = [];
      data.ex.activities.forEach(a => { if (hit(a.title) || hit(a.blurb)) rows.push(["explore", a.title, CE.catName(a.cat) + " · activity", "#/activity/" + a.id]); });
      data.ex.competitions.forEach(c => { if (hit(c.title) || hit(c.blurb)) rows.push(["trophy", c.title, c.kind + (c.open ? " · open" : " · closed"), "#/competition/" + c.id]); });
      data.sub.units.forEach(u => { if (hit(u.title)) rows.push(["book", u.title, CE.subjName(u.subj) + " · unit", "#/subject/" + u.subj]); u.lessons.forEach(l => { if (hit(l.title)) rows.push(["lesson", l.title, CE.subjName(u.subj) + " · " + u.title, "#/lesson/" + l.id]); }); u.quizzes.forEach(x => { if (hit(x.title)) rows.push([x.kind === "checkpoint" ? "flag" : "question", x.title, CE.subjName(u.subj) + " · " + x.kind, "#/quiz/" + x.id]); }); });
      data.news.rows.forEach(n => { if (hit(n.title) || hit(n.body)) rows.push(["news", n.title, "News · " + D.short(n.created), "#/news"]); });
      data.clubs.rows.forEach(c => { if (hit(c.title) || hit(c.blurb)) rows.push(["users", c.title, "Club · " + c.day + " " + c.time, "#/clubs"]); });
      data.asg.rows.forEach(a => { if (hit(a.title) || hit(a.instr)) rows.push(["pencil", a.title, CE.subjName(a.subj) + " · " + a.kind, "#/assignment/" + a.id]); });
      if (!rows.length) return res.append(h("div", { class: "empty" }, "Nothing matches."));
      res.append(h("div", { class: "list" }, ...rows.slice(0, 40).map(([ic, t, s2, href]) => h("a", { class: "item", href }, h("div", { class: "ico sm" }, CE.icon(ic)), h("div", { class: "grow" }, h("div", { class: "t sm" }, t), h("div", { class: "s xs" }, s2)))))); };
    const box = CE.searchBox("Search activities, competitions, lessons, news, clubs and assignments", run); page.append(h("div", { class: "card stack" }, box, res)); box.querySelector("input").focus();
    const [ex, sub, news, clubs, asg] = await Promise.all([CE.capi("ed_s_explore", { p_cat: 0 }), CE.capi("ed_s_subjects"), CE.capi("ed_s_news"), CE.capi("ed_s_clubs"), CE.capi("ed_s_assigns")]);
    data = { ex: ex.ok ? ex : { activities: [], competitions: [] }, sub: sub.ok ? sub : { units: [] }, news: news.ok ? news : { rows: [] }, clubs: clubs.ok ? clubs : { rows: [] }, asg: asg.ok ? asg : { rows: [] } }; run(box.querySelector("input").value.trim().toLowerCase());
  }

  const GROUPS = [
    [["Activities", "#/explore", /^#\/(explore|activity)/], ["Competitions", "#/competitions", /^#\/competition/], ["Clubs", "#/clubs"]],
    [["Subjects", "#/subjects", /^#\/(subjects|subject|lesson|quiz)/], ["Assignments", "#/assignments", /^#\/assignment/], ["Review queue", "#/review"]],
    [["Progress & badges", "#/progress"], ["House points", "#/house"]],
    [["News", "#/news"], ["Announcements", "#/announcements"]]
  ];
  const setSub = () => { const cur = (location.hash || "#/").split("?")[0]; const g = GROUPS.find(gr => gr.some(([l, hsh, m]) => m ? m.test(cur) : cur === hsh)); CE.subnav(g || []); };
  addEventListener("hashchange", setSub); setSub();
  CE.markNav = () => { const cur = (location.hash || "#/").split("?")[0]; const g = GROUPS.find(gr => gr.some(([l, hsh, m]) => m ? m.test(cur) : cur === hsh)); const first = g ? g[0][1] : cur; CE.$$("#side a.nl").forEach(a => a.classList.toggle("on", a.getAttribute("href") === first || a.getAttribute("href") === cur)); };
  CE.router([
    { path: "/house", handler: house }, { path: "/clubs", handler: clubs }, { path: "/search", handler: search },
    { path: "/", handler: home }, { path: "/explore", handler: explore }, { path: "/explore/:cat", handler: explore }, { path: "/activity/:id", handler: activity },
    { path: "/competitions", handler: competitions }, { path: "/competition/:id", handler: competition }, { path: "/news", handler: news },
    { path: "/subjects", handler: subjects }, { path: "/subject/:id", handler: subject }, { path: "/lesson/:id", handler: lesson }, { path: "/quiz/:id", handler: quiz },
    { path: "/assignments", handler: assignments }, { path: "/assignment/:id", handler: assignment }, { path: "/review", handler: review }, { path: "/progress", handler: progress },
    { path: "/calendar", handler: calendar }, { path: "/announcements", handler: announcements }, { path: "/settings", handler: settings }
  ]);
  loadBell();
})();
