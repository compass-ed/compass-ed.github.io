/* Compass Ed staff portal (teachers and the administrator). */
(async function () {
  const $ = CE.$, h = CE.h, D = CE.date, page = $("#page");
  let me = await CE.requireRole(["teacher", "admin"]); if (!me) return;
  CE.demoBanner();
  $("#meAv").textContent = CE.initials(me.name); $("#meName").textContent = me.name;
  $("#meRole").textContent = me.role === "admin" ? "Administrator" : (me.subj != null ? CE.subjName(me.subj) + " teacher" : "Teacher");
  if (me.role === "admin") { const na = $("#navAdmin"); if (na) na.classList.remove("hide"); }
  $("#signout").onclick = CE.signOut;
  CE.shell();
  const S = { home: null, content: null };
  const KIND = { homework: "Homework", assignment: "Assignment", quiz: "Quiz" };
  const card = (title, body, extra) => h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, title), extra || null), body);
  const sel = (opts, val, attrs) => h("select", Object.assign({ class: "in" }, attrs || {}), ...opts.map(([v, l]) => h("option", { value: v, selected: String(v) === String(val) }, l)));
  const classOpts = all => (all ? [[0, all]] : []).concat((me.classes || []).map(c => [c.id, c.name + (c.year ? " (Y" + c.year + ")" : "")]));
  const subjOpts = (any) => (any ? [[-1, any]] : []).concat((me.role === "admin" || me.subj == null ? CE.subjects : CE.subjects.filter(s => s.id === me.subj)).map(s => [s.id, s.name]));
  const catOpts = () => CE.categories.map(c => [c.id, c.name]);
  const field = (label, input, help) => h("label", { class: "f" }, label, input, help ? h("span", { class: "help" }, help) : null);
  const api = CE.capi;
  const refreshMe = async () => { const r = await api("ed_me"); if (r.ok) { me = r; CE.me = r; CE.auth.set(CE.auth.get().tok, r); } };
  const TYPES = [["text", "Text"], ["heading", "Heading"], ["list", "Bullet list"], ["key", "Key point (becomes a review card)"], ["check", "Quick check (multiple choice)"], ["image", "Image (https link)"], ["video", "Video (YouTube/Vimeo embed link)"], ["link", "Link"]];

  /* ---------- notifications ---------- */
  async function loadBell() {
    try {
      const r = S.home || await api("ed_t_home"); if (!r.ok) return; S.home = r;
      const un = r.notifs.filter(n => !n.read).length, bn = $("#bellN"); bn.textContent = un; bn.classList.toggle("hide", !un);
      const g = $("#nGrade"); g.textContent = r.to_grade; g.classList.toggle("hide", !r.to_grade);
      const pop = $("#bellPop"); pop.innerHTML = "";
      pop.append(h("div", { class: "row between", style: { padding: "4px 10px 8px" } }, h("b", {}, "Notifications"), un ? h("button", { class: "btn sm ghost", onclick: async () => { await api("ed_notif_read", { p_id: null }); S.home = null; loadBell(); } }, "Mark all read") : null));
      if (!r.notifs.length) pop.append(h("div", { class: "empty" }, "Nothing yet."));
      r.notifs.slice(0, 12).forEach(n => pop.append(h("a", { class: "item" + (n.read ? "" : " un"), href: n.link || "#/", onclick: async () => { pop.classList.remove("show"); if (!n.read) { await api("ed_notif_read", { p_id: n.id }); S.home = null; loadBell(); } } }, h("div", { class: "ico sm" }, CE.icon("inbox")), h("div", { class: "grow" }, h("div", { class: "t sm" }, n.title), h("div", { class: "s xs" }, D.ago(n.created))))));
    } catch (e) {}
  }
  $("#bell").onclick = e => { e.stopPropagation(); $("#bellPop").classList.toggle("show"); };
  document.addEventListener("click", e => { if (!$("#bellWrap").contains(e.target)) $("#bellPop").classList.remove("show"); });

  /* ---------- block editor (lessons, activities, competitions) ---------- */
  function blockEditor(blocks) {
    const list = h("div", { class: "blocks" });
    const render = () => {
      list.innerHTML = "";
      blocks.forEach((b, i) => {
        const bk = h("div", { class: "bk" }, h("div", { class: "row between" }, h("span", { class: "badge" }, (i + 1) + ". " + (TYPES.find(t => t[0] === b.t) || ["", b.t])[1]), h("div", { class: "row" }, h("button", { class: "ib", title: "Move up", disabled: !i, onclick: () => { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; render(); } }, CE.icon("up")), h("button", { class: "ib", title: "Move down", disabled: i === blocks.length - 1, onclick: () => { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; render(); } }, CE.icon("down")), h("button", { class: "ib", title: "Remove", onclick: () => { blocks.splice(i, 1); render(); } }, CE.icon("cross")))));
        const bind = (k, el) => { el.oninput = () => b[k] = el.value; return el; };
        if (b.t === "text") bk.append(bind("text", h("textarea", { class: "in", placeholder: "Paragraph. **bold** works. Leave a blank line between paragraphs." }, b.text || "")));
        else if (b.t === "heading") bk.append(bind("text", h("input", { class: "in", value: b.text || "", placeholder: "Heading" })));
        else if (b.t === "list") { const ta = h("textarea", { class: "in", placeholder: "One bullet per line" }, (b.items || []).join("\n")); ta.oninput = () => b.items = ta.value.split("\n").filter(x => x.trim()); bk.append(ta); }
        else if (b.t === "key") bk.append(bind("q", h("input", { class: "in", value: b.q || "", placeholder: "Question the card asks" })), bind("text", h("textarea", { class: "in", style: { minHeight: "70px" }, placeholder: "The key point (the answer on the back of the card)" }, b.text || "")));
        else if (b.t === "image" || b.t === "video" || b.t === "link") bk.append(bind("url", h("input", { class: "in", value: b.url || "", placeholder: b.t === "video" ? "https://www.youtube.com/embed/VIDEO_ID" : "https://…" })), bind("text", h("input", { class: "in", value: b.text || "", placeholder: b.t === "link" ? "Link text" : "Caption" })));
        else if (b.t === "check") { b.a = b.a && b.a.length === 4 ? b.a : ["", "", "", ""]; b.c = b.c || 0; bk.append(bind("q", h("input", { class: "in", value: b.q || "", placeholder: "Question" })), h("div", { class: "grid g2", style: { gap: "6px" } }, ...b.a.map((o, k) => h("div", { class: "row", style: { gap: "6px", flexWrap: "nowrap" } }, h("input", { type: "radio", name: "c" + i + Math.random(), checked: b.c === k, onchange: () => b.c = k, title: "Correct answer" }), h("input", { class: "in", value: o, placeholder: "Option " + "ABCD"[k], oninput: e => b.a[k] = e.target.value }))))); }
        list.append(bk);
      });
    };
    render();
    const add = sel(TYPES, "text", { style: { width: "auto" } });
    return h("div", { class: "stack" }, list, h("div", { class: "row" }, add, h("button", { class: "btn sm ghost", onclick: () => { blocks.push({ t: add.value }); render(); } }, "+ Add block")));
  }

  /* ---------- dashboard ---------- */
  async function dashboard() {
    CE.title("Dashboard"); CE.loading(page);
    try {
      S.home = null; const r = await api("ed_t_home"); if (!r.ok) return CE.fail(page, r); S.home = r; loadBell();
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Hello, " + me.name + "."), h("div", { class: "mut" }, r.students + " students on campus · " + r.active + " active this week")), h("div", { class: "row" }, h("button", { class: "btn", onclick: () => assignEditor(null) }, "+ Set work"), h("button", { class: "btn ghost", onclick: () => compEditor(null) }, "+ Competition"), h("button", { class: "btn ghost", onclick: () => annEditor(null) }, "+ Announce"), h("button", { class: "btn ghost", onclick: () => awardModal() }, "+ Points"))));
      page.append(h("div", { class: "grid g4" },
        h("a", { class: "card stat", href: "#/assignments", style: { textDecoration: "none", color: "inherit", borderColor: r.to_grade ? "var(--cyan)" : "" } }, h("span", { class: "n" }, r.to_grade), h("span", { class: "l" }, "To mark")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, r.competitions.filter(c => new Date(c.closes) > Date.now()).length), h("span", { class: "l" }, "Open competitions")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, r.assigns.filter(a => a.due && new Date(a.due) > Date.now()).length), h("span", { class: "l" }, "Open assignments")),
        h("div", { class: "card stat" }, h("span", { class: "n" }, (me.classes || []).reduce((n, c) => n + (c.n || 0), 0)), h("span", { class: "l" }, "Students in your classes"))));
      const g = h("div", { class: "grid g2" }); page.append(g);
      g.append(card("Assignments", r.assigns.length ? h("div", { class: "list" }, ...r.assigns.slice(0, 8).map(a => h("a", { class: "item", href: "#/assignment/" + a.id }, h("div", { class: "ico sm" }, CE.icon(a.kind === "quiz" ? "question" : "pencil")), h("div", { class: "grow" }, h("div", { class: "t" }, a.title), h("div", { class: "s" }, a.class + (a.due ? " · " + D.until(a.due) : "")), h("div", { class: "bar", style: { marginTop: "6px", width: "140px" } }, h("i", { style: { width: CE.pct(a.submitted, a.n) + "%" } }))), h("span", { class: "badge" + (a.submitted - a.graded > 0 ? " cyan" : "") }, a.submitted + "/" + a.n + " in" + (a.submitted - a.graded > 0 ? " · " + (a.submitted - a.graded) + " to mark" : ""))))) : h("div", { class: "empty" }, "No assignments yet."), h("a", { class: "btn sm ghost", href: "#/assignments" }, "All")));
      g.append(card("Competitions & challenges", r.competitions.length ? h("div", { class: "list" }, ...r.competitions.slice(0, 6).map(c => h("a", { class: "item", href: "#/competition/" + c.id }, h("div", { class: "ico sm" }, CE.icon("trophy")), h("div", { class: "grow" }, h("div", { class: "t" }, c.title), h("div", { class: "s" }, c.kind + " · " + (new Date(c.closes) > Date.now() ? D.left(c.closes) : "closed " + D.short(c.closes)))), h("span", { class: "badge" + (c.entries ? " cyan" : "") }, c.entries + " entr" + (c.entries === 1 ? "y" : "ies"))))) : h("div", { class: "empty" }, "Nothing running."), h("a", { class: "btn sm ghost", href: "#/competitions" }, "All")));
      g.append(card("Your classes", (me.classes || []).length ? h("div", { class: "list" }, ...me.classes.map(c => h("a", { class: "item", href: "#/class/" + c.id }, h("div", { class: "ico sm" }, CE.icon("users")), h("div", { class: "grow" }, h("div", { class: "t" }, c.name), h("div", { class: "s" }, (c.n || 0) + " students" + (c.year ? " · Year " + c.year : ""))), c.subj != null ? h("span", { class: "badge" }, CE.subjName(c.subj)) : null))) : h("div", { class: "empty" }, "No classes yet. Create one under People & classes."), h("a", { class: "btn sm ghost", href: "#/classes" }, "Classes")));
      g.append(card("Coming up", r.events.length ? h("div", { class: "list" }, ...r.events.slice(0, 6).map(e => h("a", { class: "item", href: "#/calendar" }, h("div", { class: "ico sm" }, CE.icon({ exam: "exam", trip: "bus", competition: "trophy" }[e.kind] || "calendar")), h("div", { class: "grow" }, h("div", { class: "t sm" }, e.title), h("div", { class: "s xs" }, D.dt(e.starts)))))) : h("div", { class: "empty" }, "Nothing in the next two weeks."), h("a", { class: "btn sm ghost", href: "#/calendar" }, "Calendar")));
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- campus: activities ---------- */
  async function loadContent() { const r = await api("ed_t_content"); if (r.ok) S.content = r; return r; }
  async function activities() {
    CE.title("Activities"); CE.loading(page);
    try {
      const r = await loadContent(); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Activities"), h("div", { class: "sm mut" }, "Things students can explore in their own time, sorted into campus categories.")), h("button", { class: "btn", onclick: () => activityEditor(null) }, "+ New activity")));
      CE.categories.forEach(c => { const rows = r.activities.filter(a => a.cat === c.id); if (!rows.length) return;
        page.append(card(c.name + " (" + rows.length + ")", h("div", { class: "list" }, ...rows.map(a => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon(c.icon)), h("div", { class: "grow" }, h("div", { class: "t sm" }, a.title + (a.pub ? "" : " (hidden)")), h("div", { class: "s xs" }, a.minutes + " min · " + a.done + " done · " + (a.ages === "all" ? "all ages" : a.ages === "11plus" ? "11+" : "under 11") + " · updated " + D.ago(a.updated))), h("button", { class: "btn sm ghost", onclick: () => activityEditor(a) }, "Edit")))), h("button", { class: "btn sm ghost", onclick: () => activityEditor(null, c.id) }, "+ Add to " + c.name))); });
      if (!r.activities.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("explore")), h("div", { class: "b" }, "No activities yet")));
    } catch (e) { CE.fail(page, e); }
  }
  function activityEditor(a, cat) {
    a = a || { cat: cat || CE.categories[0].id, title: "", blurb: "", blocks: [{ t: "text", text: "" }], minutes: 30, ages: "all", pub: true };
    const blocks = JSON.parse(JSON.stringify(a.blocks));
    const title = h("input", { class: "in", value: a.title, placeholder: "Activity title" }), blurb = h("input", { class: "in", value: a.blurb, placeholder: "One line that sells it" }), c = sel(catOpts(), a.cat), mins = h("input", { class: "in", type: "number", value: a.minutes, min: 1 }), ages = sel([["all", "All ages"], ["under11", "Under 11"], ["11plus", "11 and over"]], a.ages), pub = h("input", { type: "checkbox", checked: a.pub });
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, a.id ? "Edit activity" : "New activity"), field("Title", title), field("Blurb", blurb), h("div", { class: "grid g3" }, field("Category", c), field("Minutes", mins), field("Ages", ages)), h("label", { class: "chk" }, pub, "Visible to students"), h("h4", {}, "Content"), blockEditor(blocks), h("div", { class: "err", id: "aerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const r = await api("ed_t_activity_save", { p_id: a.id || 0, p_cat: +c.value, p_title: title.value, p_blurb: blurb.value, p_blocks: blocks, p_minutes: +mins.value, p_ages: ages.value, p_pub: pub.checked }); if (!r.ok) return $("#aerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Activity saved", "ok"); activities(); } }, "Save"), a.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this activity?", "Delete")) { await api("ed_t_activity_del", { p_id: a.id }); CE.closeModal(); activities(); } } }, "Delete") : null)), { wide: true });
  }

  /* ---------- campus: competitions ---------- */
  async function competitions() {
    CE.title("Competitions"); CE.loading(page);
    try {
      const r = await loadContent(); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Competitions, challenges & tournaments"), h("div", { class: "sm mut" }, "Students enter from their portal; you judge the entries and award places.")), h("button", { class: "btn", onclick: () => compEditor(null) }, "+ New")));
      const open = r.competitions.filter(c => new Date(c.closes) > Date.now()), closed = r.competitions.filter(c => new Date(c.closes) <= Date.now());
      [["Open", open], ["Closed", closed]].forEach(([t, rows]) => { if (!rows.length) return; page.append(card(t + " (" + rows.length + ")", h("div", { class: "list" }, ...rows.map(c => h("a", { class: "item", href: "#/competition/" + c.id }, h("div", { class: "ico sm" }, c.cat ? CE.catIcon(c.cat) : CE.icon("trophy")), h("div", { class: "grow" }, h("div", { class: "t" }, c.title), h("div", { class: "s" }, c.kind + (c.cat ? " · " + CE.catName(c.cat) : "") + " · " + (new Date(c.closes) > Date.now() ? "closes " + D.dt(c.closes) : "closed " + D.short(c.closes)))), h("span", { class: "badge" + (c.entries ? " cyan" : "") }, c.entries + " entr" + (c.entries === 1 ? "y" : "ies"))))))); });
      if (!r.competitions.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("trophy")), h("div", { class: "b" }, "No competitions yet")));
    } catch (e) { CE.fail(page, e); }
  }
  function compEditor(c) {
    const d = new Date(); d.setDate(d.getDate() + 14);
    c = c || { cat: 0, kind: "competition", title: "", blurb: "", blocks: [{ t: "text", text: "" }], opens: new Date().toISOString(), closes: d.toISOString(), ages: "all" };
    const blocks = JSON.parse(JSON.stringify(c.blocks));
    const title = h("input", { class: "in", value: c.title, placeholder: "Title" }), blurb = h("input", { class: "in", value: c.blurb, placeholder: "One line" }), cat = sel([[0, "No category"]].concat(catOpts()), c.cat || 0), kind = sel([["competition", "Competition"], ["challenge", "Challenge"], ["tournament", "Tournament"]], c.kind), opens = h("input", { class: "in", type: "datetime-local", value: D.local(c.opens) }), closes = h("input", { class: "in", type: "datetime-local", value: D.local(c.closes) }), ages = sel([["all", "All ages"], ["under11", "Under 11"], ["11plus", "11 and over"]], c.ages);
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, c.id ? "Edit" : "New competition"), field("Title", title), field("Blurb", blurb), h("div", { class: "grid g3" }, field("Type", kind), field("Category", cat), field("Ages", ages)), h("div", { class: "grid g2" }, field("Opens", opens), field("Closes", closes)), h("h4", {}, "Details and how to enter"), blockEditor(blocks), h("div", { class: "err", id: "cerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { if (!closes.value) return $("#cerr", box).textContent = "Set a closing date."; const r = await api("ed_t_comp_save", { p_id: c.id || 0, p_cat: +cat.value, p_kind: kind.value, p_title: title.value, p_blurb: blurb.value, p_blocks: blocks, p_opens: opens.value ? new Date(opens.value).toISOString() : null, p_closes: new Date(closes.value).toISOString(), p_ages: ages.value }); if (!r.ok) return $("#cerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast(c.id ? "Saved" : "Published and students notified", "ok"); CE.nav("/competition/" + r.id); if (location.hash === "#/competition/" + r.id) compPage({ id: r.id }); } }, c.id ? "Save" : "Publish"), c.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this and every entry?", "Delete")) { await api("ed_t_comp_del", { p_id: c.id }); CE.closeModal(); CE.nav("/competitions"); } } }, "Delete") : null)), { wide: true });
  }
  async function compPage(p) {
    CE.title("Competition"); CE.loading(page);
    try {
      const [r, c] = await Promise.all([api("ed_t_entries", { p_id: +p.id }), loadContent()]); if (!r.ok) return CE.fail(page, r); if (!r.comp) return CE.fail(page, "not_found");
      const full = c.ok ? c.competitions.find(x => x.id === +p.id) : null; CE.title(r.comp.title); page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("a", { class: "sm", href: "#/competitions" }, "← Competitions"), h("h2", { style: { margin: "4px 0 0" } }, r.comp.title), h("div", { class: "sm mut" }, r.comp.kind + " · " + (new Date(r.comp.closes) > Date.now() ? "closes " + D.dt(r.comp.closes) : "closed " + D.short(r.comp.closes)) + " · " + r.rows.length + " entries")), full ? h("button", { class: "btn ghost", onclick: () => compEditor(full) }, "Edit") : null));
      if (full && full.blocks.length) page.append(card("Brief", CE.blocks(full.blocks)));
      if (!r.rows.length) page.append(h("div", { class: "empty" }, "No entries yet."));
      r.rows.forEach(e => page.append(h("div", { class: "card" + (e.place ? " tint" : "") }, h("div", { class: "hd" }, h("div", {}, h("h4", { style: { margin: 0 } }, e.name), h("div", { class: "xs mut" }, (e.class || "") + (e.year ? " · Year " + e.year : "") + " · entered " + D.dt(e.at))), h("div", { class: "row" }, e.place ? h("span", { class: "badge ok" }, CE.icon("medal"), ["", "1st", "2nd", "3rd"][e.place] || e.place + "th") : null, h("button", { class: "btn sm", onclick: () => placeModal(e, p) }, e.place ? "Change" : "Award a place"))), h("div", { class: "pre" }, e.body), e.links && e.links.length ? CE.links(e.links) : null, e.note ? h("div", { class: "sm mut", style: { marginTop: "8px" } }, "Judge's note: " + e.note) : null)));
    } catch (e) { CE.fail(page, e); }
  }
  function placeModal(e, p) {
    const pl = sel([[0, "No place"], [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "Highly commended"]], e.place || 0), note = h("textarea", { class: "in", style: { minHeight: "80px" }, placeholder: "A line for the student (they get a notification)" }, e.note || "");
    CE.modal(h("div", { class: "stack" }, h("h3", {}, e.name), field("Place", pl), field("Note", note), h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const r = await api("ed_t_entry_place", { p_id: e.id, p_place: +pl.value, p_note: note.value }); if (!r.ok) return CE.toast(CE.errText(r), "bad"); CE.closeModal(); CE.toast("Saved", "ok"); compPage(p); } }, "Save"))));
  }

  /* ---------- campus: news ---------- */
  async function news() {
    CE.title("News"); CE.loading(page);
    try {
      const r = await loadContent(); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "News & newsletter"), h("div", { class: "sm mut" }, "Posts appear on the public home page and in every student's News. Featured posts go in the banner.")), h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => newsletterBuilder() }, "Build a newsletter issue"), h("button", { class: "btn", onclick: () => newsEditor(null) }, "+ New post"))));
      const issues = [...new Set(r.news.map(n => n.issue).filter(Boolean))]; if (issues.length) page.append(h("div", { class: "pill-row" }, h("span", { class: "sm mut" }, "Issues: "), ...issues.map(i => h("span", { class: "pill" }, i))));
      if (!r.news.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("news")), h("div", { class: "b" }, "Nothing posted yet")));
      r.news.forEach(n => page.append(h("div", { class: "card" + (n.featured ? " tint" : ""), style: { maxWidth: "820px" } }, h("div", { class: "hd" }, h("div", { class: "row" }, n.featured ? h("span", { class: "badge cyan" }, "Featured") : null, n.issue ? h("span", { class: "badge" }, n.issue) : null, h("span", { class: "xs mut" }, D.long(n.created))), h("button", { class: "btn sm ghost", onclick: () => newsEditor(n) }, "Edit")), h("h3", {}, n.title), h("div", { html: CE.rich(n.body) }))));
    } catch (e) { CE.fail(page, e); }
  }
  function newsEditor(n) {
    n = n || { title: "", body: "", cover: "", featured: false, issue: "" };
    const title = h("input", { class: "in", value: n.title, placeholder: "Headline" }), body = h("textarea", { class: "in", style: { minHeight: "200px" }, placeholder: "The post. **bold**, links and bullet lines (- ) work." }, n.body), cover = h("input", { class: "in", value: n.cover, placeholder: "Cover image link (https, optional)" }), feat = h("input", { type: "checkbox", checked: n.featured }), issue = h("input", { class: "in", value: n.issue || "", placeholder: "e.g. Autumn 1 2026" });
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, n.id ? "Edit post" : "New post"), field("Headline", title), field("Post", body), field("Cover image", cover), field("Newsletter issue (optional)", issue, "e.g. Autumn 1 2026. Posts with the same label are grouped as one issue."), h("label", { class: "chk" }, feat, "Feature on the home page"), h("div", { class: "err", id: "nerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const r = await api("ed_t_news_save", { p_id: n.id || 0, p_title: title.value, p_body: body.value, p_cover: cover.value, p_featured: feat.checked, p_issue: issue.value }); if (!r.ok) return $("#nerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Posted", "ok"); news(); } }, n.id ? "Save" : "Post"), n.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this post?", "Delete")) { await api("ed_t_news_del", { p_id: n.id }); CE.closeModal(); news(); } } }, "Delete") : null)), { wide: true });
  }

  /* ---------- classes ---------- */
  async function classes() {
    CE.title("Classes"); page.innerHTML = "";
    page.append(h("div", { class: "page-lead" }, h("div", {}, h("h2", {}, "Classes"), h("div", { class: "sm mut" }, "Your classes: students, register and seating, the overview heatmap, topics and progress.")), h("a", { class: "btn ghost", href: "#/people/classes" }, "Manage classes")));
    if (!(me.classes || []).length) return page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("users")), h("div", { class: "b" }, "No classes yet"), h("div", { class: "sm" }, "Create classes and add students under People & classes."), h("a", { class: "btn", href: "#/people", style: { marginTop: "10px" } }, "People & classes")));
    page.append(h("div", { class: "grid g3" }, ...me.classes.map(c => h("a", { class: "subj", href: "#/class/" + c.id }, h("div", { class: "row between" }, h("div", { class: "ico" }, CE.icon("users")), c.subj != null ? h("span", { class: "badge" }, CE.subjName(c.subj)) : null), h("h3", { style: { margin: 0 } }, c.name), h("div", { class: "sm mut" }, (c.n || 0) + " students" + (c.year ? " · Year " + c.year : ""))))));
  }
  async function classPage(p, tab) {
    const id = +p.id; CE.title("Class"); CE.loading(page);
    try {
      const r = await api("ed_t_class", { p_class: id }); if (!r.ok) return CE.fail(page, r);
      CE.title(r.class.name); page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("a", { class: "sm", href: "#/classes" }, "← Classes"), h("h2", { style: { margin: "4px 0 0" } }, r.class.name), h("div", { class: "sm mut" }, r.students.length + " students" + (r.class.year ? " · Year " + r.class.year : "") + (r.class.subj != null ? " · " + CE.subjName(r.class.subj) : ""))), h("div", { class: "row" }, h("button", { class: "btn", onclick: () => assignEditor(null, id) }, "+ Set work"), h("button", { class: "btn ghost", onclick: () => annEditor(null, id) }, "+ Announce"), h("button", { class: "btn ghost", onclick: () => awardModal(r.students, id) }, "+ Points"))));
      page.append(h("div", { class: "tabs" }, ...[["students", "Students"], ["register", "Register & seating"], ["heatmap", "Class overview heatmap"], ["topics", "Topics"], ["progress", "Progress monitoring"]].map(([k, l]) => h("button", { class: k === (tab || "students") ? "on" : "", onclick: () => CE.nav("/class/" + id + "/" + k) }, l))));
      const box = h("div", { class: "stack" }); page.append(box);
      if ((tab || "students") === "students") {
        const tb = h("table", { class: "tb" }, h("thead", {}, h("tr", {}, h("th", {}, "Student"), h("th", {}, "House"), h("th", {}, "Points"), h("th", {}, "Last seen"), h("th", {}, "Lessons"), h("th", {}, "Activities"), h("th", {}, "Quiz avg"), h("th", {}, "Handed in"), h("th", {}, "Grade avg"), h("th", {}, ""))), h("tbody", {}));
        r.students.forEach(s => tb.lastChild.append(h("tr", {}, h("td", {}, h("div", { class: "b" }, s.name), h("div", { class: "xs mut" }, s.username)), h("td", {}, h("select", { class: "in", style: { padding: "4px 8px", width: "auto" }, onchange: async e => { const x = await api("ed_t_house", { p_uid: s.id, p_house: e.target.value }); CE.toast(x.ok ? "House saved" : CE.errText(x), x.ok ? "ok" : "bad"); } }, ...[["", "–"], ["N", "North"], ["E", "East"], ["S", "South"], ["W", "West"]].map(([v, l]) => h("option", { value: v, selected: (s.house || "") === v }, l)))), h("td", { class: "b" }, s.pts), h("td", { class: "sm" }, D.ago(s.last_seen)), h("td", {}, s.lessons_done), h("td", {}, s.activities_done), h("td", {}, s.quiz_avg != null ? s.quiz_avg + "%" : "–"), h("td", {}, s.submitted), h("td", {}, s.grade_avg != null ? h("span", { class: "badge " + (s.grade_avg >= 70 ? "ok" : s.grade_avg >= 50 ? "warn" : "bad") }, s.grade_avg + "%") : "–"), h("td", {}, h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("button", { class: "btn sm ghost", onclick: () => awardModal([s], id) }, "Points"), h("button", { class: "btn sm ghost", onclick: () => annEditor(null, id, { uids: [s.id], name: s.name }) }, "Message"))))));
        box.append(h("div", { class: "card" }, r.students.length ? h("div", { class: "tbw" }, tb) : h("div", { class: "empty" }, "No students in this class yet. Add them under People & classes.")));
      } else if (tab === "heatmap") await heatmap(id, box);
      else if (tab === "register") registerTab(id, r, box);
      else if (tab === "topics") await topicsTab(id, box);
      else await progressTab(id, r, box);
    } catch (e) { CE.fail(page, e); }
  }
  async function heatmap(id, box) {
    box.innerHTML = ""; box.append(h("div", { class: "skel" }));
    const r = await api("ed_t_heatmap", { p_class: id }); if (!r.ok) return CE.fail(box, r);
    box.innerHTML = "";
    if (!r.units.length) return box.append(h("div", { class: "empty" }, "No units for this class yet. Add some under Lessons & quizzes."));
    let mode = "lessons";
    const lvl = v => v == null ? 0 : v >= 90 ? 4 : v >= 70 ? 3 : v >= 40 ? 2 : 1;
    const val = (s, u) => { const c = s.cells[u.id] || {}; return mode === "lessons" ? CE.pct(c.done || 0, u.lessons) : mode === "cp" ? c.cp : c.quiz; };
    const render = () => {
      box.innerHTML = "";
      box.append(h("div", { class: "row between" }, h("div", { class: "seg" }, ...[["lessons", "Lessons done"], ["cp", "Checkpoint %"], ["quiz", "Quiz avg %"]].map(([k, l]) => h("button", { class: k === mode ? "on" : "", onclick: () => { mode = k; render(); } }, l))), h("div", { class: "xs mut" }, "Darker = better · outlined = checkpoint passed")));
      const tb = h("table", { class: "heat" }, h("thead", {}, h("tr", {}, h("th", {}), ...r.units.map(u => h("th", { title: u.title }, u.title.length > 22 ? u.title.slice(0, 21) + "…" : u.title)), h("th", {}, "Avg"))), h("tbody", {}));
      r.students.forEach(s => { const vals = []; const cells = r.units.map(u => { const c = s.cells[u.id] || {}; const v = val(s, u); const label = mode === "lessons" ? (c.done || 0) + "/" + u.lessons : v == null ? "·" : v + ""; if (v != null) vals.push(v); return h("td", { class: "h" + lvl(v) + (c.cp != null && c.cp >= 80 ? " cp" : ""), title: s.name + " · " + u.title + ": " + label }, label); }); const a = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null; tb.lastChild.append(h("tr", {}, h("th", {}, s.name), ...cells, h("td", { class: "h" + lvl(a) }, a == null ? "·" : a + "%"))); });
      const colAvg = r.units.map(u => { const vs = r.students.map(s => val(s, u)).filter(v => v != null); return vs.length ? Math.round(vs.reduce((x, y) => x + y, 0) / vs.length) : null; });
      tb.lastChild.append(h("tr", {}, h("th", {}, "Class"), ...colAvg.map(a => h("td", { class: "h" + lvl(a) }, a == null ? "·" : a + "%")), h("td", {})));
      box.append(h("div", { class: "card" }, h("div", { class: "tbw" }, tb)));
      const weakest = colAvg.map((a, i) => ({ a, u: r.units[i] })).filter(x => x.a != null).sort((x, y) => x.a - y.a)[0];
      const strugglers = r.students.filter(s => { const vs = r.units.map(u => val(s, u)).filter(v => v != null); return vs.length && vs.reduce((x, y) => x + y, 0) / vs.length < 40; });
      box.append(h("div", { class: "grid g2" }, h("div", { class: "card tint" }, h("h4", {}, "Weakest unit"), weakest ? h("div", {}, h("b", {}, weakest.u.title), " · class average " + weakest.a + "%", h("div", { class: "row", style: { marginTop: "8px" } }, h("button", { class: "btn sm", onclick: () => playlistEditor(null, { class_id: id, subj: weakest.u.subj, title: "Revisit: " + weakest.u.title }) }, "Make a catch-up playlist"))) : h("div", { class: "mut sm" }, "Not enough data yet.")), h("div", { class: "card tint" }, h("h4", {}, "Students below 40%"), strugglers.length ? h("div", {}, strugglers.map(s => s.name).join(", "), h("div", { class: "row", style: { marginTop: "8px" } }, h("button", { class: "btn sm", onclick: () => annEditor(null, id, { uids: strugglers.map(s => s.id), name: strugglers.length + " students" }) }, "Message them"))) : h("div", { class: "mut sm" }, "Nobody, on this view."))));
    };
    render();
  }
  async function progressTab(id, r, box) {
    const subs = await api("ed_t_assigns"); const as = subs.ok ? subs.rows.filter(a => a.class_id === id) : [];
    box.innerHTML = "";
    box.append(h("div", { class: "grid g3" }, h("div", { class: "card stat" }, h("span", { class: "n" }, r.students.filter(s => new Date(s.last_seen) > Date.now() - 7 * 864e5).length + "/" + r.students.length), h("span", { class: "l" }, "Active this week")), h("div", { class: "card stat" }, h("span", { class: "n" }, (() => { const v = r.students.map(s => s.grade_avg).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) + "%" : "–"; })()), h("span", { class: "l" }, "Class grade average")), h("div", { class: "card stat" }, h("span", { class: "n" }, r.students.reduce((n, s) => n + s.activities_done, 0)), h("span", { class: "l" }, "Activities done"))));
    box.append(card("Assignment completion", as.length ? h("div", { class: "list" }, ...as.map(a => h("a", { class: "item", href: "#/assignment/" + a.id }, h("div", { class: "ico sm" }, CE.icon(a.kind === "quiz" ? "question" : "pencil")), h("div", { class: "grow" }, h("div", { class: "t sm" }, a.title), h("div", { class: "bar", style: { marginTop: "6px" } }, h("i", { style: { width: CE.pct(a.submitted, a.n) + "%" } }))), h("span", { class: "badge" }, a.submitted + "/" + a.n + " in · " + a.graded + " marked")))) : h("div", { class: "empty" }, "No assignments for this class yet.")));
    const least = r.students.slice().sort((a, b) => new Date(a.last_seen || 0) - new Date(b.last_seen || 0)).slice(0, 5);
    box.append(card("Needs a nudge", h("div", { class: "list" }, ...least.map(s => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("user")), h("div", { class: "grow" }, h("div", { class: "t sm" }, s.name), h("div", { class: "s xs" }, "Last seen " + D.ago(s.last_seen) + " · " + s.submitted + " handed in")), h("button", { class: "btn sm ghost", onclick: () => annEditor(null, id, { uids: [s.id], name: s.name }) }, "Message"))))));
  }

  /* ---------- content: units, lessons, quizzes ---------- */
  async function content(p) {
    CE.title("Lessons & quizzes"); CE.loading(page);
    try {
      const r = await loadContent(); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      const subj = p && p.subj != null ? +p.subj : (me.subj != null ? me.subj : (r.units[0] ? r.units[0].subj : 0));
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Lessons & quizzes"), h("div", { class: "sm mut" }, "Units hold lessons and quizzes. A checkpoint quiz marks a unit as mastered when the pass mark is reached.")), h("div", { class: "row" }, sel(subjOpts(), subj, { onchange: e => CE.nav("/content/" + e.target.value), style: { width: "auto" } }), h("button", { class: "btn", onclick: () => unitEditor(null, subj) }, "+ New unit"), h("button", { class: "btn ghost", onclick: () => quizEditor(null, subj) }, "+ New quiz"))));
      const units = r.units.filter(u => u.subj === subj), loose = r.quizzes.filter(q => q.subj === subj && !units.some(u => u.id === q.unit_id));
      if (!units.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("puzzle")), h("div", { class: "b" }, "No units for " + CE.subjName(subj) + " yet"), h("div", { class: "sm" }, "Create a unit, then add lessons and a checkpoint quiz to it.")));
      units.forEach(u => {
        const qs = r.quizzes.filter(q => q.unit_id === u.id);
        const c = h("div", { class: "card" }, h("div", { class: "hd" }, h("div", {}, h("h3", {}, u.title), h("div", { class: "sm mut" }, (u.summary || "") + (u.class_id ? " · " + (((me.classes || []).find(x => x.id === u.class_id) || {}).name || "one class") : " · all classes") + (u.year ? " · Year " + u.year : ""))), h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: () => lessonEditor(null, u) }, "+ Lesson"), h("button", { class: "btn sm ghost", onclick: () => quizEditor(null, u.subj, u.id) }, "+ Quiz"), h("button", { class: "btn sm ghost", onclick: () => unitEditor(u) }, "Edit"))), h("div", { class: "list" }));
        u.lessons.forEach(l => c.lastChild.append(h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("lesson")), h("div", { class: "grow" }, h("div", { class: "t sm" }, l.title + (l.pub ? "" : " (hidden)")), h("div", { class: "s xs" }, l.minutes + " min · " + l.blocks.length + " blocks · updated " + D.ago(l.updated))), h("button", { class: "btn sm ghost", onclick: () => lessonEditor(l, u) }, "Edit"))));
        qs.forEach(q => c.lastChild.append(h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon(q.kind === "checkpoint" ? "flag" : "question")), h("div", { class: "grow" }, h("div", { class: "t sm" }, q.title), h("div", { class: "s xs" }, (q.kind === "checkpoint" ? "Checkpoint · pass " + q.threshold + "% · " : "Quiz · ") + q.qs.length + " questions · " + q.tries + " attempts" + (q.minutes ? " · " + q.minutes + " min timed" : ""))), q.tries ? h("button", { class: "btn sm ghost", onclick: () => quizStats(q.id) }, "Results") : null, h("button", { class: "btn sm ghost", onclick: () => quizEditor(q, q.subj, q.unit_id) }, "Edit"))));
        if (!u.lessons.length && !qs.length) c.lastChild.append(h("div", { class: "empty" }, "Empty unit. Add a lesson or quiz."));
        page.append(c);
      });
      if (loose.length) page.append(card("Quizzes not in a unit", h("div", { class: "list" }, ...loose.map(q => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("question")), h("div", { class: "grow" }, h("div", { class: "t sm" }, q.title), h("div", { class: "s xs" }, q.qs.length + " questions")), h("button", { class: "btn sm ghost", onclick: () => quizEditor(q, q.subj, q.unit_id) }, "Edit"))))));
    } catch (e) { CE.fail(page, e); }
  }
  function unitEditor(u, subj) {
    u = u || { subj, class_id: null, year: null, title: "", summary: "", ord: (S.content ? S.content.units.filter(x => x.subj === subj).length : 0) + 1 };
    const title = h("input", { class: "in", value: u.title, placeholder: "e.g. Algebra & Equations" }), summary = h("textarea", { class: "in", style: { minHeight: "70px" }, placeholder: "One line on what the unit covers" }, u.summary || "");
    const cl = sel(classOpts("Every class"), u.class_id || 0), yr = sel([[0, "Any year"], [7, "Year 7"], [8, "Year 8"], [9, "Year 9"], [10, "Year 10"], [11, "Year 11"], [12, "Year 12"], [13, "Year 13"]], u.year || 0), ord = h("input", { class: "in", type: "number", value: u.ord, min: 0 });
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, u.id ? "Edit unit" : "New unit"), field("Title", title), field("Summary", summary), h("div", { class: "grid g2" }, field("Class", cl), field("Year group", yr)), field("Order", ord), h("div", { class: "err", id: "uerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const r = await api("ed_t_unit_save", { p_id: u.id || 0, p_subj: u.subj, p_class: +cl.value, p_year: +yr.value, p_title: title.value, p_summary: summary.value, p_ord: +ord.value }); if (!r.ok) return $("#uerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Unit saved", "ok"); content({ subj: u.subj }); } }, "Save"), u.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this unit and every lesson in it? Quizzes are kept.", "Delete unit")) { await api("ed_t_unit_del", { p_id: u.id }); CE.closeModal(); content({ subj: u.subj }); } } }, "Delete") : null)));
  }
  function lessonEditor(l, u) {
    l = l || { unit_id: u.id, title: "", minutes: 20, blocks: [{ t: "text", text: "" }], ord: u.lessons.length + 1, pub: true };
    const blocks = JSON.parse(JSON.stringify(l.blocks));
    const title = h("input", { class: "in", value: l.title, placeholder: "Lesson title" }), mins = h("input", { class: "in", type: "number", value: l.minutes, min: 1 }), ord = h("input", { class: "in", type: "number", value: l.ord }), pub = h("input", { type: "checkbox", checked: l.pub });
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, l.id ? "Edit lesson" : "New lesson in " + u.title), h("div", { class: "grid", style: { gridTemplateColumns: "2fr 1fr 1fr" } }, field("Title", title), field("Minutes", mins), field("Order", ord)), h("label", { class: "chk" }, pub, "Visible to students"), h("h4", {}, "Blocks"), blockEditor(blocks), h("div", { class: "err", id: "lerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const r = await api("ed_t_lesson_save", { p_id: l.id || 0, p_unit: u.id, p_title: title.value, p_minutes: +mins.value, p_blocks: blocks, p_ord: +ord.value, p_pub: pub.checked }); if (!r.ok) return $("#lerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Lesson saved", "ok"); content({ subj: u.subj }); } }, "Save lesson"), l.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this lesson? Students' completion records for it are removed too.", "Delete lesson")) { await api("ed_t_lesson_del", { p_id: l.id }); CE.closeModal(); content({ subj: u.subj }); } } }, "Delete") : null)), { wide: true });
  }
  function quizEditor(q, subj, unitId) {
    q = q || { subj, unit_id: unitId || null, title: "", kind: "quiz", threshold: 80, qs: [{ q: "", a: ["", "", "", ""], c: 0, why: "", topic: "" }] };
    const qs = JSON.parse(JSON.stringify(q.qs));
    const title = h("input", { class: "in", value: q.title, placeholder: "Quiz title" }), kind = sel([["quiz", "Practice quiz"], ["checkpoint", "Mastery checkpoint"]], q.kind), thr = h("input", { class: "in", type: "number", value: q.threshold, min: 1, max: 100 });
    const unit = sel([[0, "No unit"]].concat((S.content ? S.content.units.filter(u => u.subj === subj) : []).map(u => [u.id, u.title])), q.unit_id || 0);
    const opens = h("input", { class: "in", type: "datetime-local", value: q.opens ? D.local(q.opens) : "" }), closes = h("input", { class: "in", type: "datetime-local", value: q.closes ? D.local(q.closes) : "" }), mins = h("input", { class: "in", type: "number", min: 0, value: q.minutes || "", placeholder: "none" });
    const list = h("div", { class: "blocks" });
    const render = () => { list.innerHTML = ""; qs.forEach((x, i) => { x.a = x.a && x.a.length === 4 ? x.a : ["", "", "", ""]; list.append(h("div", { class: "bk" }, h("div", { class: "row between" }, h("span", { class: "badge" }, "Question " + (i + 1)), h("button", { class: "ib", onclick: () => { qs.splice(i, 1); render(); } }, CE.icon("cross"))), h("input", { class: "in", value: x.q, placeholder: "Question", oninput: e => x.q = e.target.value }), h("div", { class: "grid g2", style: { gap: "6px" } }, ...x.a.map((o, k) => h("div", { class: "row", style: { gap: "6px", flexWrap: "nowrap" } }, h("input", { type: "radio", name: "q" + i, checked: x.c === k, onchange: () => x.c = k, title: "Correct" }), h("input", { class: "in", value: o, placeholder: "Option " + "ABCD"[k], oninput: e => x.a[k] = e.target.value })))), h("div", { class: "grid g2", style: { gap: "6px" } }, h("input", { class: "in", value: x.why || "", placeholder: "Explanation shown after marking", oninput: e => x.why = e.target.value }), h("input", { class: "in", value: x.topic || "", placeholder: "Topic tag (optional)", oninput: e => x.topic = e.target.value })))); }); };
    render();
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, q.id ? "Edit quiz" : "New quiz"), field("Title", title), h("div", { class: "grid g3" }, field("Type", kind), field("Pass mark % (checkpoints)", thr), field("Unit", unit)), h("details", {}, h("summary", { class: "b sm", style: { cursor: "pointer" } }, "Timed assessment (optional)"), h("div", { class: "grid g3", style: { marginTop: "8px" } }, field("Opens", opens), field("Closes", closes), field("Time limit (minutes)", mins, "Counts down from when the student starts; auto-marks at zero."))), h("p", { class: "help", style: { margin: 0 } }, "Select the radio button next to the correct option. Wrong answers become review cards for the student."), list, h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: () => { qs.push({ q: "", a: ["", "", "", ""], c: 0, why: "", topic: "" }); render(); } }, "+ Add question"), h("button", { class: "btn sm ghost", onclick: () => bankPicker(subj, picked => { picked.forEach(b => qs.push({ q: b.q, a: b.a.slice(), c: b.c, why: b.why, topic: b.topic })); render(); }) }, "+ From question bank")), h("div", { class: "err", id: "qerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { if (qs.find(x => !x.q.trim() || x.a.some(o => !o.trim()))) return $("#qerr", box).textContent = "Every question needs text and four options."; const r = await api("ed_t_quiz_save", { p_id: q.id || 0, p_subj: subj, p_unit: +unit.value, p_title: title.value, p_kind: kind.value, p_threshold: +thr.value, p_qs: qs, p_opens: opens.value ? new Date(opens.value).toISOString() : null, p_closes: closes.value ? new Date(closes.value).toISOString() : null, p_minutes: +mins.value || 0 }); if (!r.ok) return $("#qerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Quiz saved", "ok"); content({ subj }); } }, "Save quiz"), q.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this quiz and all attempts at it?", "Delete quiz")) { await api("ed_t_quiz_del", { p_id: q.id }); CE.closeModal(); content({ subj }); } } }, "Delete") : null)), { wide: true });
  }

  /* ---------- playlists ---------- */
  async function playlists() {
    CE.title("Playlists"); CE.loading(page);
    try {
      const r = await loadContent(); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Lesson playlists"), h("div", { class: "sm mut" }, "An ordered path of lessons and quizzes for one class. Students see the next step on their home page.")), h("button", { class: "btn", onclick: () => playlistEditor(null) }, "+ New playlist")));
      if (!r.playlists.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("play")), h("div", { class: "b" }, "No playlists yet")));
      page.append(h("div", { class: "grid g2" }, ...r.playlists.map(p => h("div", { class: "card" }, h("div", { class: "hd" }, h("div", {}, h("h3", {}, p.title), h("div", { class: "sm mut" }, (((me.classes || []).find(c => c.id === p.class_id) || {}).name || "class") + " · " + CE.subjName(p.subj))), h("button", { class: "btn sm ghost", onclick: () => playlistEditor(p) }, "Edit")), h("ol", { class: "sm", style: { margin: 0, paddingLeft: "20px" } }, ...p.items.map(it => { const l = it.t === "lesson" ? r.units.flatMap(u => u.lessons).find(x => x.id === it.id) : r.quizzes.find(x => x.id === it.id); return h("li", {}, l ? l.title : "(deleted)"); }))))));
    } catch (e) { CE.fail(page, e); }
  }
  function playlistEditor(p, preset) {
    const c = S.content; p = p || Object.assign({ class_id: (me.classes || [])[0] ? me.classes[0].id : 0, subj: me.subj != null ? me.subj : 0, title: "", items: [] }, preset || {});
    const items = JSON.parse(JSON.stringify(p.items));
    const title = h("input", { class: "in", value: p.title, placeholder: "e.g. Week 7: Solving equations" }), cl = sel(classOpts(), p.class_id), sj = sel(subjOpts(), p.subj);
    const list = h("div", { class: "list" }), pick = h("div", { class: "list" });
    const nameOf = it => { const x = it.t === "lesson" ? c.units.flatMap(u => u.lessons).find(y => y.id === it.id) : c.quizzes.find(y => y.id === it.id); return x ? x.title : "(deleted)"; };
    const render = () => {
      list.innerHTML = ""; if (!items.length) list.append(h("div", { class: "empty" }, "Add lessons and quizzes from the right."));
      items.forEach((it, i) => list.append(h("div", { class: "item" }, h("span", { class: "badge" }, i + 1), h("div", { class: "grow t sm row", style: { gap: "6px" } }, CE.icon(it.t === "lesson" ? "lesson" : "question"), nameOf(it)), h("button", { class: "ib", disabled: !i, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; render(); } }, CE.icon("up")), h("button", { class: "ib", disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; render(); } }, CE.icon("down")), h("button", { class: "ib", onclick: () => { items.splice(i, 1); render(); } }, CE.icon("cross")))));
      pick.innerHTML = ""; const subj = +sj.value;
      c.units.filter(u => u.subj === subj).forEach(u => { pick.append(h("div", { class: "b sm", style: { marginTop: "6px" } }, u.title)); u.lessons.forEach(l => pick.append(h("button", { class: "item click", style: { textAlign: "left" }, onclick: () => { items.push({ t: "lesson", id: l.id }); render(); } }, CE.icon("lesson"), l.title))); c.quizzes.filter(q => q.unit_id === u.id).forEach(q => pick.append(h("button", { class: "item click", style: { textAlign: "left" }, onclick: () => { items.push({ t: "quiz", id: q.id }); render(); } }, CE.icon(q.kind === "checkpoint" ? "flag" : "question"), q.title))); });
      c.quizzes.filter(q => q.subj === subj && !c.units.some(u => u.id === q.unit_id)).forEach(q => pick.append(h("button", { class: "item click", style: { textAlign: "left" }, onclick: () => { items.push({ t: "quiz", id: q.id }); render(); } }, CE.icon("question"), q.title)));
      if (!pick.children.length) pick.append(h("div", { class: "empty" }, "No content for this subject yet."));
    };
    sj.onchange = render; render();
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, p.id ? "Edit playlist" : "New playlist"), field("Title", title), h("div", { class: "grid g2" }, field("Class", cl), field("Subject", sj)), h("div", { class: "grid g2" }, h("div", {}, h("h4", {}, "Playlist order"), list), h("div", {}, h("h4", {}, "Add content"), h("div", { style: { maxHeight: "320px", overflow: "auto" } }, pick))), h("div", { class: "err", id: "perr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const r = await api("ed_t_playlist_save", { p_id: p.id || 0, p_class: +cl.value, p_subj: +sj.value, p_title: title.value, p_items: items }); if (!r.ok) return $("#perr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Playlist saved" + (p.id ? "" : " and the class notified"), "ok"); playlists(); } }, "Save playlist"), p.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this playlist?", "Delete")) { await api("ed_t_playlist_del", { p_id: p.id }); CE.closeModal(); playlists(); } } }, "Delete") : null)), { wide: true });
  }

  /* ---------- rubrics ---------- */
  async function rubrics() {
    CE.title("Rubrics"); CE.loading(page);
    try {
      const r = await loadContent(); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Rubric builder"), h("div", { class: "sm mut" }, "A marking grid of criteria and levels. Attach one to an assignment and mark by clicking the level each piece reaches.")), h("button", { class: "btn", onclick: () => rubricEditor(null) }, "+ New rubric")));
      if (!r.rubrics.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("ruler")), h("div", { class: "b" }, "No rubrics yet")));
      r.rubrics.forEach(b => { const tb = h("table", { class: "rub" }, h("thead", {}, h("tr", {}, h("th", {}, "Criterion"), ...b.criteria[0].levels.map(l => h("th", {}, l.label + " (" + l.pts + ")")))), h("tbody", {}, ...b.criteria.map(c => h("tr", {}, h("th", {}, c.name), ...c.levels.map(l => h("td", {}, l.desc)))))); page.append(h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, b.title), h("button", { class: "btn sm ghost", onclick: () => rubricEditor(b) }, "Edit")), h("div", { class: "tbw" }, tb))); });
    } catch (e) { CE.fail(page, e); }
  }
  function rubricEditor(b) {
    b = b || { title: "", criteria: [{ name: "Understanding", levels: [{ label: "Emerging", pts: 1, desc: "" }, { label: "Secure", pts: 2, desc: "" }, { label: "Excellent", pts: 3, desc: "" }] }] };
    const cr = JSON.parse(JSON.stringify(b.criteria)); const title = h("input", { class: "in", value: b.title, placeholder: "e.g. Written explanation" });
    const grid = h("div", { class: "tbw" });
    const render = () => { const n = cr[0].levels.length;
      const tb = h("table", { class: "rub" }, h("thead", {}, h("tr", {}, h("th", {}, "Criterion"), ...cr[0].levels.map((l, li) => h("th", {}, h("input", { class: "in", value: l.label, placeholder: "Level", oninput: e => cr.forEach(c => c.levels[li].label = e.target.value) }), h("input", { class: "in", type: "number", value: l.pts, style: { marginTop: "4px" }, oninput: e => cr.forEach(c => c.levels[li].pts = +e.target.value) }))), h("th", {}, h("button", { class: "btn sm ghost", onclick: () => { cr.forEach(c => c.levels.push({ label: "Level " + (n + 1), pts: n + 1, desc: "" })); render(); } }, "+ Level"), n > 2 ? h("button", { class: "btn sm ghost", onclick: () => { cr.forEach(c => c.levels.pop()); render(); } }, "− Level") : null))),
        h("tbody", {}, ...cr.map((c, ci) => h("tr", {}, h("th", {}, h("input", { class: "in", value: c.name, placeholder: "Criterion", oninput: e => c.name = e.target.value })), ...c.levels.map(l => h("td", {}, h("textarea", { class: "in", style: { minHeight: "60px" }, placeholder: "What this level looks like", oninput: e => l.desc = e.target.value }, l.desc))), h("td", {}, h("button", { class: "ib", disabled: cr.length < 2, onclick: () => { cr.splice(ci, 1); render(); } }, CE.icon("cross")))))));
      grid.innerHTML = ""; grid.append(tb); };
    render();
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, b.id ? "Edit rubric" : "New rubric"), field("Title", title), grid, h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: () => { cr.push({ name: "", levels: cr[0].levels.map(l => ({ label: l.label, pts: l.pts, desc: "" })) }); render(); } }, "+ Criterion")), h("div", { class: "err", id: "rerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { if (cr.some(c => !c.name.trim())) return $("#rerr", box).textContent = "Every criterion needs a name."; const r = await api("ed_t_rubric_save", { p_id: b.id || 0, p_title: title.value, p_criteria: cr }); if (!r.ok) return $("#rerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Rubric saved", "ok"); rubrics(); } }, "Save rubric"), b.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this rubric? Assignments using it keep their marks but lose the grid.", "Delete")) { await api("ed_t_rubric_del", { p_id: b.id }); CE.closeModal(); rubrics(); } } }, "Delete") : null)), { wide: true });
  }

  /* ---------- assignments ---------- */
  async function assignments() {
    CE.title("Assignments"); CE.loading(page);
    try {
      const r = await api("ed_t_assigns"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Assignments"), h("div", { class: "sm mut" }, "Homework, longer assignments and auto-marked quizzes.")), h("button", { class: "btn", onclick: () => assignEditor(null) }, "+ Set work")));
      if (!r.rows.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("pencil")), h("div", { class: "b" }, "Nothing set yet")));
      const open = r.rows.filter(a => !a.due || new Date(a.due) > Date.now()), past = r.rows.filter(a => a.due && new Date(a.due) <= Date.now());
      [["Open", open], ["Past due", past]].forEach(([t, rows]) => { if (!rows.length) return; page.append(card(t + " (" + rows.length + ")", h("div", { class: "list" }, ...rows.map(a => h("a", { class: "item", href: "#/assignment/" + a.id }, h("div", { class: "ico" }, CE.icon(a.kind === "quiz" ? "question" : "pencil")), h("div", { class: "grow" }, h("div", { class: "t" }, a.title), h("div", { class: "s" }, a.class + " · " + KIND[a.kind] + " · " + a.points + " pts" + (a.due ? " · due " + D.dt(a.due) : ""))), h("div", { style: { textAlign: "right" } }, h("span", { class: "badge" + (a.submitted - a.graded > 0 ? " cyan" : a.submitted === a.n && a.n ? " ok" : "") }, a.submitted + "/" + a.n + " handed in"), h("div", { class: "xs mut", style: { marginTop: "4px" } }, a.graded + " marked"))))))); });
    } catch (e) { CE.fail(page, e); }
  }
  function assignEditor(a, classId) {
    (async () => {
      if (!S.content) await loadContent();
      if (!(me.classes || []).length) return CE.toast("Create a class first (People & classes).", "bad");
      const cls0 = (me.classes || []).find(c => c.id === classId) || me.classes[0];
      a = a || { class_id: cls0.id, subj: cls0.subj != null ? cls0.subj : (me.subj != null ? me.subj : 0), kind: "homework", title: "", instr: "", due: null, points: 10, quiz_id: null, rubric_id: null };
      const title = h("input", { class: "in", value: a.title, placeholder: "e.g. Equations worksheet (Q1–10)" }), instr = h("textarea", { class: "in", placeholder: "What to do, how to hand in, how it will be marked." }, a.instr || "");
      const cl = sel(classOpts(), a.class_id), sj = sel(subjOpts(), a.subj), kind = sel([["homework", "Homework"], ["assignment", "Assignment (longer, rubric-marked)"], ["quiz", "Quiz (auto-marked)"]], a.kind), due = h("input", { class: "in", type: "datetime-local", value: a.due ? D.local(a.due) : "" }), pts = h("input", { class: "in", type: "number", value: a.points, min: 0 });
      const quiz = sel([[0, "Choose a quiz"]].concat(S.content.quizzes.map(q => [q.id, q.title + " (" + q.qs.length + " q)"])), a.quiz_id || 0), rub = sel([[0, "No rubric"]].concat(S.content.rubrics.map(b => [b.id, b.title])), a.rubric_id || 0);
      const qf = field("Quiz", quiz), rf = field("Rubric", rub), peer = h("input", { type: "checkbox", checked: !!a.peer }), pf = h("label", { class: "chk" }, peer, "Peer review: after handing in, each student reviews two classmates' work");
      const upd = () => { qf.classList.toggle("hide", kind.value !== "quiz"); rf.classList.toggle("hide", kind.value === "quiz"); pf.classList.toggle("hide", kind.value === "quiz"); }; kind.onchange = upd; upd();
      const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, a.id ? "Edit assignment" : "Set work"), field("Title", title), h("div", { class: "grid g3" }, field("Class", cl), field("Subject", sj), field("Type", kind)), qf, field("Instructions", instr), h("div", { class: "grid g3" }, field("Due", due, "Leave empty for no deadline"), field("Points", pts), rf), pf, h("div", { class: "err", id: "aerr" }),
        h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { if (kind.value === "quiz" && !+quiz.value) return $("#aerr", box).textContent = "Choose the quiz."; const r = await api("ed_t_assign_save", { p_id: a.id || 0, p_class: +cl.value, p_subj: +sj.value, p_kind: kind.value, p_title: title.value, p_instr: instr.value, p_due: due.value ? new Date(due.value).toISOString() : null, p_points: +pts.value, p_quiz: kind.value === "quiz" ? +quiz.value : 0, p_rubric: kind.value !== "quiz" ? +rub.value : 0, p_peer: kind.value !== "quiz" && peer.checked }); if (!r.ok) return $("#aerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast(a.id ? "Saved" : "Work set and the class notified", "ok"); S.home = null; loadBell(); CE.nav("/assignment/" + r.id); if (location.hash === "#/assignment/" + r.id) assignmentPage({ id: r.id }); } }, a.id ? "Save" : "Set work"), a.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this assignment and every submission to it?", "Delete")) { await api("ed_t_assign_del", { p_id: a.id }); CE.closeModal(); CE.nav("/assignments"); } } }, "Delete") : null)), { wide: true });
    })();
  }
  async function assignmentPage(p) {
    CE.title("Assignment"); CE.loading(page);
    try {
      const r = await api("ed_t_subs", { p_assign: +p.id }); if (!r.ok) return CE.fail(page, r);
      const a = r.assign; CE.title(a.title); page.innerHTML = "";
      const cls = (me.classes || []).find(c => c.id === a.class_id) || {};
      page.append(h("div", { class: "row between" }, h("div", {}, h("a", { class: "sm", href: "#/assignments" }, "← Assignments"), h("h2", { style: { margin: "4px 0 0" } }, a.title), h("div", { class: "sm mut" }, (cls.name || "") + " · " + KIND[a.kind] + " · " + a.points + " pts" + (a.due ? " · due " + D.dt(a.due) : "") + (a.rubric ? " · rubric: " + a.rubric.title : ""))), h("button", { class: "btn ghost", onclick: () => api("ed_t_assigns").then(x => assignEditor(x.rows.find(y => y.id === a.id))) }, "Edit")));
      const sub = r.rows.filter(x => x.sub && x.sub.status !== "draft"), graded = r.rows.filter(x => x.sub && x.sub.status === "returned"), scores = graded.map(x => x.sub.score).filter(x => x != null);
      page.append(h("div", { class: "grid g4" }, h("div", { class: "card stat" }, h("span", { class: "n" }, sub.length + "/" + r.rows.length), h("span", { class: "l" }, "Handed in")), h("div", { class: "card stat" }, h("span", { class: "n" }, sub.length - graded.length), h("span", { class: "l" }, "To mark")), h("div", { class: "card stat" }, h("span", { class: "n" }, scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) + "%" : "–"), h("span", { class: "l" }, "Average")), h("div", { class: "card stat" }, h("span", { class: "n" }, r.rows.filter(x => !x.sub || x.sub.status === "draft").length), h("span", { class: "l" }, "Not handed in"))));
      if (a.instr) page.append(card("Instructions", h("div", { html: CE.rich(a.instr) })));
      const tb = h("table", { class: "tb" }, h("thead", {}, h("tr", {}, h("th", {}, "Student"), h("th", {}, "Status"), h("th", {}, "Handed in"), h("th", {}, "Versions"), h("th", {}, "Score"), h("th", {}, ""))), h("tbody", {}));
      r.rows.forEach(x => { const s = x.sub; tb.lastChild.append(h("tr", {}, h("td", { class: "b" }, x.name), h("td", {}, !s || s.status === "draft" ? h("span", { class: "badge" + (a.due && new Date(a.due) < Date.now() ? " bad" : "") }, s ? "Draft" : "Not started") : s.status === "submitted" ? h("span", { class: "badge cyan" }, "To mark") : h("span", { class: "badge ok" }, "Returned")), h("td", { class: "sm" }, s && s.sub_at ? D.dt(s.sub_at) : "–"), h("td", {}, s ? s.ver : "–"), h("td", {}, s && s.score != null ? s.score + "%" : "–"), h("td", {}, s ? h("button", { class: "btn sm" + (s.status === "submitted" ? " cyan" : " ghost"), onclick: () => gradeModal(a, x, () => assignmentPage(p)) }, s.status === "submitted" ? "Mark" : "Open") : h("button", { class: "btn sm ghost", onclick: () => annEditor(null, a.class_id, { uids: [x.id], name: x.name, title: "Reminder: " + a.title }) }, "Remind")))); });
      page.append(h("div", { class: "card" }, r.rows.length ? h("div", { class: "tbw" }, tb) : h("div", { class: "empty" }, "No students in this class.")));
    } catch (e) { CE.fail(page, e); }
  }
  function gradeModal(a, x, done) {
    const s = x.sub; let ver = s.versions[0] ? s.versions[0].ver : s.ver; const rub = s.rub ? s.rub.slice() : (a.rubric ? a.rubric.criteria.map(() => null) : null);
    const score = h("input", { class: "in", type: "number", min: 0, max: 100, value: s.score != null ? s.score : "" }), fb = h("textarea", { class: "in", placeholder: "Feedback for the student" }, s.feedback || "");
    const body = h("div", { class: "card flat pre", style: { maxHeight: "300px", overflow: "auto" } }), vers = h("div", { class: "ver" }), rubBox = h("div", {});
    const render = () => {
      const v = s.versions.find(y => y.ver === ver) || { body: s.body, links: s.links };
      body.innerHTML = ""; body.append(v.body || h("span", { class: "mut" }, "(empty)")); if (v.links && v.links.length) body.append(CE.links(v.links));
      vers.innerHTML = ""; s.versions.forEach(y => vers.append(h("button", { class: y.ver === ver ? "on" : "", onclick: () => { ver = y.ver; render(); } }, "v" + y.ver + " · " + D.dt(y.at))));
      if (a.rubric) { const tb = h("table", { class: "rub" }, h("thead", {}, h("tr", {}, h("th", {}, "Criterion"), ...a.rubric.criteria[0].levels.map(l => h("th", {}, l.label + " (" + l.pts + ")")))), h("tbody", {}, ...a.rubric.criteria.map((c, ci) => h("tr", {}, h("th", {}, c.name), ...c.levels.map((l, li) => h("td", { class: "pick" + (rub[ci] === li ? " on" : ""), onclick: () => { rub[ci] = li; const max = a.rubric.criteria.reduce((n, cc) => n + Math.max(...cc.levels.map(z => z.pts)), 0), got = a.rubric.criteria.reduce((n, cc, i) => n + (rub[i] != null ? cc.levels[rub[i]].pts : 0), 0); if (rub.every(z => z != null)) score.value = Math.round(100 * got / max); render(); } }, l.desc)))))); rubBox.innerHTML = ""; rubBox.append(h("div", { class: "tbw" }, tb), h("div", { class: "xs mut" }, "Click a cell for each criterion; the score fills in from the points.")); }
    };
    render();
    const peerBoxEl = h("div", {}); if (a.peer) api("ed_t_peers", { p_assign: a.id }).then(pr => { if (!pr.ok) return; const mine = pr.rows.filter(y => y.target_uid === x.id); if (mine.length) peerBoxEl.append(h("div", { class: "card flat stack" }, h("b", { class: "sm" }, "Peer reviews received"), ...mine.map(y => h("div", { class: "sm" }, h("b", {}, y.reviewer), " · " + "★".repeat(y.stars || 0) + " · " + y.body)))); });
    const box = CE.modal(h("div", { class: "stack" }, h("div", { class: "row between" }, h("h3", { style: { margin: 0 } }, x.name + " · " + a.title), h("span", { class: "badge " + (s.status === "returned" ? "ok" : "cyan") }, s.status)), h("div", { class: "sm mut" }, (s.sub_at ? "Handed in " + D.dt(s.sub_at) : "Not handed in yet") + " · " + s.versions.length + " version" + (s.versions.length !== 1 ? "s" : "")), vers, body, peerBoxEl, rubBox, h("div", { class: "grid", style: { gridTemplateColumns: "120px 1fr" } }, field("Score %", score), field("Feedback", fb)), h("div", { class: "err", id: "gerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { if (score.value === "") return $("#gerr", box).textContent = "Give a score."; const r = await api("ed_t_grade", { p_sub: s.id, p_score: +score.value, p_rub: rub, p_feedback: fb.value }); if (!r.ok) return $("#gerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Returned to " + x.name, "ok"); S.home = null; loadBell(); done(); } }, s.status === "returned" ? "Update mark" : "Return with mark"), h("button", { class: "btn ghost", onclick: CE.closeModal }, "Close"))), { wide: true });
  }

  /* ---------- announcements ---------- */
  async function announcements() {
    CE.title("Announcements"); CE.loading(page);
    try {
      const r = await api("ed_t_anns"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Announcements"), h("div", { class: "sm mut" }, "Send to a class, a year group, named students or the whole school, and see who has read it.")), h("button", { class: "btn", onclick: () => annEditor(null) }, "+ New announcement")));
      if (!r.rows.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("megaphone")), h("div", { class: "b" }, "Nothing posted yet")));
      r.rows.forEach(a => { const tg = a.class_id ? a.class : a.targets.year ? "Year " + a.targets.year : a.targets.uids ? a.targets.uids.length + " named student" + (a.targets.uids.length > 1 ? "s" : "") : "Whole school"; const live = new Date(a.ends) > Date.now();
        page.append(h("div", { class: "card" + (live ? "" : " flat") }, h("div", { class: "hd" }, h("div", { class: "row" }, a.pinned ? h("span", { class: "badge ink" }, CE.icon("pin"), "Pinned") : null, h("span", { class: "badge cyan" }, tg), live ? null : h("span", { class: "badge" }, "Expired")), h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: () => receipts(a) }, CE.icon("eye"), a.reads + "/" + a.reach + " read"), h("button", { class: "btn sm ghost", onclick: () => annEditor(a) }, "Edit"))), h("h3", {}, a.title), h("div", { html: CE.rich(a.body) }), h("div", { class: "bar ink", style: { width: "180px", marginTop: "6px" } }, h("i", { style: { width: CE.pct(a.reads, a.reach) + "%" } })), h("div", { class: "xs mut", style: { marginTop: "6px" } }, "Posted " + D.ago(a.created) + " · shows until " + D.short(a.ends)))); });
    } catch (e) { CE.fail(page, e); }
  }
  function receipts(a) { CE.modal(h("div", { class: "stack" }, h("h3", {}, "Read receipts"), h("div", { class: "sm mut" }, a.title + " · " + a.reads + " of " + a.reach + " have read it"), a.readers.length ? h("div", { class: "list" }, ...a.readers.map(x => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon("checkcircle")), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.name), h("div", { class: "s xs" }, D.dt(x.at)))))) : h("div", { class: "empty" }, "Nobody has opened it yet."))); }
  function annEditor(a, classId, preset) {
    preset = preset || {};
    a = a || { class_id: classId || 0, targets: preset.uids ? { uids: preset.uids } : {}, title: preset.title || "", body: "", pinned: false };
    const mode = a.class_id ? "class" : a.targets.year ? "year" : a.targets.uids ? "uids" : "school";
    const title = h("input", { class: "in", value: a.title, placeholder: "Title" }), body = h("textarea", { class: "in", placeholder: "Message. **bold** and links work." }, a.body), pin = h("input", { type: "checkbox", checked: a.pinned }), days = h("input", { class: "in", type: "number", value: 14, min: 1, max: 90 });
    const to = sel([["class", "A class"], ["year", "A year group"], ["uids", "Named students"], ["school", "Whole school"]], preset.uids ? "uids" : mode), cl = sel(classOpts(), a.class_id || ((me.classes || [])[0] || {}).id), yr = sel([7, 8, 9, 10, 11, 12, 13].map(y => [y, "Year " + y]), a.targets.year || 7);
    const who = h("div", { class: "sm mut" }, preset.name ? "To: " + preset.name : a.targets.uids ? "To: " + a.targets.uids.length + " students" : "Pick students from a class page (Message).");
    const fc = field("Class", cl), fy = field("Year", yr);
    const upd = () => { fc.classList.toggle("hide", to.value !== "class"); fy.classList.toggle("hide", to.value !== "year"); who.classList.toggle("hide", to.value !== "uids"); }; to.onchange = upd; upd();
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, a.id ? "Edit announcement" : "New announcement"), field("Send to", to), fc, fy, who, field("Title", title), field("Message", body), h("div", { class: "grid g2" }, field("Show for (days)", days), h("label", { class: "chk", style: { alignSelf: "end" } }, pin, "Pin to the top")), h("div", { class: "err", id: "nerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const t = to.value; const targets = t === "year" ? { year: +yr.value } : t === "uids" ? { uids: (a.targets.uids || preset.uids || []) } : {}; if (t === "uids" && !targets.uids.length) return $("#nerr", box).textContent = "No students chosen."; const r = await api("ed_t_ann_save", { p_id: a.id || 0, p_class: t === "class" ? +cl.value : 0, p_targets: targets, p_title: title.value, p_body: body.value, p_pinned: pin.checked, p_days: +days.value }); if (!r.ok) return $("#nerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast(a.id ? "Saved" : "Posted and students notified", "ok"); if (location.hash.startsWith("#/announcements")) announcements(); } }, a.id ? "Save" : "Post"), a.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this announcement?", "Delete")) { await api("ed_t_ann_del", { p_id: a.id }); CE.closeModal(); announcements(); } } }, "Delete") : null)));
  }

  /* ---------- calendar ---------- */
  async function calendar() {
    CE.title("Calendar"); page.innerHTML = "";
    let d = new Date(); d.setDate(1);
    const head = h("div", { class: "row between" }), grid = h("div", { class: "cal" }), list = h("div", { class: "list" });
    page.append(h("div", { class: "card" }, head, grid), card("This month", list));
    const render = async () => {
      head.innerHTML = ""; head.append(h("div", { class: "row" }, h("button", { class: "ib", onclick: () => { d.setMonth(d.getMonth() - 1); render(); } }, "‹"), h("h3", { style: { margin: 0 } }, d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })), h("button", { class: "ib", onclick: () => { d.setMonth(d.getMonth() + 1); render(); } }, "›")), h("div", { class: "row" }, h("button", { class: "btn sm ghost", id: "ics" }, CE.icon("phone"), "Export .ics"), h("button", { class: "btn sm", onclick: () => eventEditor(null, render) }, "+ Add event")));
      const from = new Date(d.getFullYear(), d.getMonth(), -7), to = new Date(d.getFullYear(), d.getMonth() + 1, 7);
      const r = await api("ed_t_events", { p_from: D.ymd(from), p_to: D.ymd(to) }); if (!r.ok) return CE.fail(page, r);
      const open = e => e.assign_id ? CE.nav("/assignment/" + e.assign_id) : e.comp_id ? CE.nav("/competition/" + e.comp_id) : e.src ? CE.modal(h("div", { class: "stack" }, srcTag(e.src, e.src_name), h("h3", {}, e.title), h("div", { class: "sm" }, D.long(e.starts) + (D.time(e.starts) !== "00:00" ? ", " + D.time(e.starts) + (e.ends ? " to " + D.time(e.ends) : "") : "") + (e.place ? " · " + e.place : "")), h("p", { class: "sm mut", style: { margin: 0 } }, "This event is mirrored from the " + (e.src_name || "calendar feed") + ". Change it there; it updates here on the next sync."), me.role === "admin" ? h("a", { class: "btn sm ghost", href: "#/admin/feeds", onclick: CE.closeModal }, "Calendar feeds") : null)) : eventEditor(e, render);
      CE.calendar(grid, d.getFullYear(), d.getMonth(), r.rows, open);
      const month = r.rows.filter(e => new Date(e.starts).getMonth() === d.getMonth()); list.innerHTML = ""; if (!month.length) list.append(h("div", { class: "empty" }, "Nothing this month."));
      month.forEach(e => list.append(h("div", { class: "item click", onclick: () => open(e) }, h("div", { class: "ico sm" }, CE.icon({ exam: "exam", trip: "bus", due: "alarm", competition: "trophy" }[e.kind] || "calendar")), h("div", { class: "grow" }, h("div", { class: "t sm" }, (e.kind === "due" ? "Due: " : "") + e.title), h("div", { class: "s xs" }, D.dt(e.starts) + " · " + (e.class || "Whole school") + (e.place ? " · " + e.place : ""))), srcTag(e.src, e.src_name))));
      const icsBtn = $("#ics"); if (icsBtn) icsBtn.onclick = () => CE.ics(r.rows, "Compass Ed " + d.toLocaleDateString("en-GB", { month: "long" }));
    };
    render();
  }
  function eventEditor(e, done) {
    e = e || { class_id: 0, kind: "event", title: "", starts: null, ends: null, place: "" };
    const title = h("input", { class: "in", value: e.title, placeholder: "e.g. End-of-unit test" }), kind = sel([["event", "Event"], ["exam", "Exam / test"], ["deadline", "Deadline"], ["trip", "Trip"], ["competition", "Competition fixture"]], e.kind), cl = sel(classOpts("Whole school"), e.class_id || 0), st = h("input", { class: "in", type: "datetime-local", value: e.starts ? D.local(e.starts) : "" }), en = h("input", { class: "in", type: "datetime-local", value: e.ends ? D.local(e.ends) : "" }), pl = h("input", { class: "in", value: e.place, placeholder: "Room or place" });
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, e.event_id ? "Edit event" : "New event"), field("Title", title), h("div", { class: "grid g2" }, field("Type", kind), field("For", cl)), h("div", { class: "grid g2" }, field("Starts", st), field("Ends", en)), field("Place", pl), h("div", { class: "err", id: "eerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { if (!st.value) return $("#eerr", box).textContent = "Set a start time."; const r = await api("ed_t_event_save", { p_id: e.event_id || 0, p_class: +cl.value, p_kind: kind.value, p_title: title.value, p_starts: new Date(st.value).toISOString(), p_ends: en.value ? new Date(en.value).toISOString() : null, p_place: pl.value }); if (!r.ok) return $("#eerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Saved", "ok"); done(); } }, "Save"), e.event_id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this event?", "Delete")) { await api("ed_t_event_del", { p_id: e.event_id }); CE.closeModal(); done(); } } }, "Delete") : null)));
  }

  /* ---------- people & classes ---------- */
  async function people(p) {
    CE.title("People & classes"); CE.loading(page);
    try {
      const r = await api("ed_a_users"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = ""; const tab = (p && p.tab) || "students";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "People & classes"), h("div", { class: "sm mut" }, r.admin ? "Manage every account, class and the join codes." : "Students in your classes. Ask the administrator for anything else.")), h("div", { class: "row" }, h("button", { class: "btn", onclick: () => userEditor(null, r, "student") }, "+ Student"), r.admin ? h("button", { class: "btn ghost", onclick: () => userEditor(null, r, "teacher") }, "+ Staff") : null, h("button", { class: "btn ghost", onclick: () => classEditor(null, r) }, "+ Class"))));
      page.append(h("div", { class: "tabs" }, ...[["students", "Students"], ["staff", "Staff"], ["classes", "Classes"], ["codes", "Join codes"]].filter(([k]) => r.admin || k === "students" || k === "classes").map(([k, l]) => h("button", { class: k === tab ? "on" : "", onclick: () => CE.nav("/people/" + k) }, l))));
      const cname = id => (r.classes.find(c => c.id === id) || {}).name || "–";
      if (tab === "students" || tab === "staff") {
        const rows = r.users.filter(u => tab === "students" ? u.role === "student" : u.role !== "student");
        const q = h("input", { class: "in", placeholder: "Search by name or username", style: { maxWidth: "320px" } });
        const tb = h("table", { class: "tb" }, h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Username"), h("th", {}, tab === "students" ? "Year" : "Role"), h("th", {}, tab === "students" ? "Class" : "Subject"), h("th", {}, "Last seen"), h("th", {}, ""))), h("tbody", {}));
        const draw = () => { const f = q.value.trim().toLowerCase(); tb.lastChild.innerHTML = ""; rows.filter(u => !f || u.name.toLowerCase().includes(f) || u.username.toLowerCase().includes(f)).forEach(u => tb.lastChild.append(h("tr", { style: u.disabled ? { opacity: .5 } : null }, h("td", { class: "b" }, u.name + (u.disabled ? " (disabled)" : "")), h("td", {}, h("span", { class: "kbd" }, u.username)), h("td", {}, tab === "students" ? (u.year || "–") : u.role), h("td", {}, tab === "students" ? cname(u.class_id) : (u.subj != null ? CE.subjName(u.subj) : "All")), h("td", { class: "sm" }, D.ago(u.last_seen)), h("td", {}, h("button", { class: "btn sm ghost", onclick: () => userEditor(u, r) }, "Edit"))))); if (!tb.lastChild.children.length) tb.lastChild.append(h("tr", {}, h("td", { colspan: 6, class: "mut" }, "Nobody found."))); };
        q.oninput = draw; draw();
        page.append(h("div", { class: "card stack" }, q, h("div", { class: "tbw" }, tb), h("div", { class: "xs mut" }, rows.length + (tab === "students" ? " students" : " staff accounts"))));
      } else if (tab === "classes") {
        page.append(h("div", { class: "grid g3" }, ...r.classes.map(c => h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, c.name), h("button", { class: "btn sm ghost", onclick: () => classEditor(c, r) }, "Edit")), h("div", { class: "sm mut" }, c.n + " students" + (c.year ? " · Year " + c.year : "") + (c.subj != null ? " · " + CE.subjName(c.subj) : " · any subject")), h("div", { class: "xs mut", style: { marginTop: "6px" } }, "Class number for sign-up: " + c.id)))));
        if (!r.classes.length) page.append(h("div", { class: "empty" }, "No classes yet."));
      } else {
        const name = h("input", { class: "in", value: r.school.name }), join = h("input", { class: "in big", value: r.school.join_code }), inv = h("input", { class: "in big", value: r.school.invite_code }), er = h("div", { class: "err" });
        page.append(card("School and join codes", h("div", { class: "stack", style: { maxWidth: "520px" } }, field("School name", name), field("Student join code", join, "Students type this when they create an account. Change it any time; existing accounts keep working."), field("Teacher invite code", inv, "Give this only to staff."), er, h("button", { class: "btn cyan", onclick: async () => { er.textContent = ""; const x = await api("ed_a_school_save", { p_name: name.value, p_join: join.value, p_invite: inv.value }); if (!x.ok) return er.textContent = CE.errText(x); CE.toast("Saved", "ok"); } }, "Save"))));
      }
    } catch (e) { CE.fail(page, e); }
  }
  function userEditor(u, r, role) {
    u = u || { role: role || "student", username: "", name: "", year: null, class_id: null, subj: null, disabled: false };
    const isNew = !u.id, name = h("input", { class: "in", value: u.name, placeholder: "Full name" }), user = h("input", { class: "in", value: u.username, placeholder: "username", autocapitalize: "off" }), pw = h("input", { class: "in", type: "text", placeholder: isNew ? "Password (8+ characters)" : "Leave blank to keep the current password", autocomplete: "off" });
    const rl = sel([["student", "Student"], ["teacher", "Teacher"], ["admin", "Administrator"]], u.role, { disabled: !r.admin }), yr = sel([[0, "–"]].concat([7, 8, 9, 10, 11, 12, 13].map(y => [y, "Year " + y])), u.year || 0), cl = sel([[0, "No class"]].concat(r.classes.map(c => [c.id, c.name])), u.class_id || 0), sj = sel([[-1, "All subjects"]].concat(CE.subjects.map(s => [s.id, s.name])), u.subj == null ? -1 : u.subj), dis = h("input", { type: "checkbox", checked: u.disabled });
    const sf = h("div", { class: "grid g2" }, field("Year", yr), field("Class", cl)), tf = field("Main subject", sj, "Teachers with a subject see only classes of that subject (and classes with no subject).");
    const upd = () => { sf.classList.toggle("hide", rl.value !== "student"); tf.classList.toggle("hide", rl.value === "student"); }; rl.onchange = upd; upd();
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, isNew ? "New " + (u.role === "student" ? "student" : "staff account") : "Edit " + u.name), field("Role", rl), field("Name", name), field("Username", user), field(isNew ? "Password" : "Reset password", pw), sf, tf, isNew ? null : h("label", { class: "chk" }, dis, "Disabled (cannot sign in)"), isNew ? null : credBox(u, r), h("div", { class: "err", id: "uerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const x = await api("ed_a_user_save", { p_id: u.id || 0, p_role: rl.value, p_username: user.value.trim(), p_name: name.value, p_pw: pw.value ? pw.value : null, p_year: +yr.value, p_class: +cl.value, p_subj: +sj.value, p_disabled: dis.checked }); if (!x.ok) return $("#uerr", box).textContent = CE.errText(x); CE.closeModal(); CE.toast(isNew ? "Account created. Give them the username and password." : "Saved", "ok"); await refreshMe(); people({ tab: rl.value === "student" ? "students" : "staff" }); } }, isNew ? "Create account" : "Save"), !isNew && r.admin ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete " + u.name + " and everything they have done?", "Delete account")) { const x = await api("ed_a_user_del", { p_id: u.id }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); CE.closeModal(); people({ tab: u.role === "student" ? "students" : "staff" }); } } }, "Delete") : null)));
  }
  /* credentials box inside the account editor: login codes, reset, sign out everywhere */
  function credBox(u, r) {
    const box = h("div", { class: "card flat stack", style: { gap: "8px" } }, h("div", { class: "row between" }, h("b", { class: "sm" }, "Login codes & sessions"), h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => genModal({ admin: r.admin }, u) }, "New login code"), h("button", { class: "btn sm ghost", onclick: async () => { if (await CE.confirm("Sign " + u.name + " out of every device? They can sign in again with their password or code.", "Sign out everywhere")) { const x = await api("ed_a_user_kick", { p_id: u.id }); CE.toast(x.ok ? "Signed out of " + x.n + " session" + (x.n === 1 ? "" : "s") : CE.errText(x), x.ok ? "ok" : "bad"); } } }, "Sign out everywhere"))), h("div", { class: "xs mut" }, "Loading…"));
    api("ed_a_user_codes", { p_id: u.id }).then(x => { const info = box.lastChild; info.innerHTML = ""; if (!x.ok) return info.textContent = CE.errText(x);
      const live = x.rows.filter(c => !c.revoked_at);
      info.append(h("span", {}, (x.sessions || 0) + " active session" + (x.sessions === 1 ? "" : "s") + " · " + (live.length ? "code " + live.map(c => c.code).join(", ") + (live[0].purpose === "reset" && !live[0].used_at ? " (waiting to be used; sets a new password)" : "") : "no login code") + (x.rows.length > live.length ? " · " + (x.rows.length - live.length) + " revoked" : "")));
      if (live.length) info.append(" ", h("a", { href: "#/admin/codes", onclick: CE.closeModal }, "manage")); });
    return box;
  }
  function classEditor(c, r) {
    c = c || { name: "", year: null, subj: null };
    const name = h("input", { class: "in", value: c.name, placeholder: "e.g. 7A or 8B Science" }), yr = sel([[0, "Mixed / any"]].concat([7, 8, 9, 10, 11, 12, 13].map(y => [y, "Year " + y])), c.year || 0), sj = sel([[-1, "Any subject (form group)"]].concat(CE.subjects.map(s => [s.id, s.name])), c.subj == null ? -1 : c.subj);
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, c.id ? "Edit class" : "New class"), field("Name", name), h("div", { class: "grid g2" }, field("Year", yr), field("Subject", sj, "A subject class is only visible to teachers of that subject.")), h("div", { class: "err", id: "cerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const x = await api("ed_a_class_save", { p_id: c.id || 0, p_name: name.value, p_year: +yr.value, p_subj: +sj.value }); if (!x.ok) return $("#cerr", box).textContent = CE.errText(x); CE.closeModal(); CE.toast("Saved", "ok"); await refreshMe(); people({ tab: "classes" }); } }, "Save"), c.id && r.admin ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this class? Students in it are kept but left without a class; its assignments and playlists are removed.", "Delete class")) { await api("ed_a_class_del", { p_id: c.id }); CE.closeModal(); await refreshMe(); people({ tab: "classes" }); } } }, "Delete") : null)));
  }

  async function settings() {
    CE.title("Settings"); page.innerHTML = "";
    page.append(card("My account", h("div", { class: "stack" }, h("div", {}, h("b", {}, me.name), " · ", h("span", { class: "kbd" }, me.username)), h("div", { class: "sm mut" }, (me.role === "admin" ? "Administrator" : "Teacher" + (me.subj != null ? " · " + CE.subjName(me.subj) : "")) + " · the portal locks after 20 minutes without use."), h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: CE.signOut }, "Sign out")))));
    page.append(card("Reading and display", CE.prefsCard()));
    const old = h("input", { class: "in", type: "password", autocomplete: "current-password" }), nw = h("input", { class: "in", type: "password", autocomplete: "new-password", minlength: 8 }), er = h("div", { class: "err" });
    page.append(card("Change password", h("div", { class: "stack", style: { maxWidth: "420px" } }, h("label", { class: "f" }, "Current password", old), h("label", { class: "f" }, "New password (8+ characters)", nw), er, h("button", { class: "btn", onclick: async () => { er.textContent = ""; const r = await api("ed_pw", { p_old: old.value, p_new: nw.value }); if (!r.ok) return er.textContent = CE.errText(r); CE.toast("Password changed ✓", "ok"); old.value = nw.value = ""; } }, "Change password"))));
  }


  /* ---------- house points ---------- */
  function awardModal(students, classId) {
    (async () => {
      let list = students;
      if (!list) { const cid = classId || ((me.classes || [])[0] || {}).id; if (!cid) return CE.toast("Create a class first.", "bad"); const r = await api("ed_t_class", { p_class: cid }); if (!r.ok) return CE.toast(CE.errText(r), "bad"); list = r.students; classId = cid; }
      const picked = new Set(list.length === 1 ? [list[0].id] : []);
      const pts = h("input", { class: "in", type: "number", value: 5, min: -50, max: 100 }), reason = h("input", { class: "in", placeholder: "e.g. Excellent effort in class", maxlength: 120 });
      const grid = h("div", { class: "pill-row" }, ...list.map(s => h("button", { class: "pill" + (picked.has(s.id) ? " on" : ""), onclick: e => { picked.has(s.id) ? picked.delete(s.id) : picked.add(s.id); e.target.classList.toggle("on"); } }, s.name)));
      const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, "Award house points"), h("div", { class: "row between" }, h("span", { class: "sm mut" }, "Pick students"), h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: () => { list.forEach(s => picked.add(s.id)); CE.$$(".pill", grid).forEach(p => p.classList.add("on")); } }, "All"), h("button", { class: "btn sm ghost", onclick: () => { picked.clear(); CE.$$(".pill", grid).forEach(p => p.classList.remove("on")); } }, "None"))), grid, h("div", { class: "grid g2" }, field("Points (negative to deduct)", pts), field("Reason", reason)), h("div", { class: "pill-row" }, ...[[5, "Effort"], [10, "Great work"], [20, "Outstanding"], [-5, "Late work"]].map(([p, l]) => h("button", { class: "pill", onclick: () => { pts.value = p; reason.value = l; } }, (p > 0 ? "+" : "") + p + " " + l))), h("div", { class: "err", id: "perr" }),
        h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { if (!picked.size) return $("#perr", box).textContent = "Pick at least one student."; const r = await api("ed_t_award", { p_uids: [...picked], p_pts: +pts.value, p_reason: reason.value }); if (!r.ok) return $("#perr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast((+pts.value >= 0 ? "+" : "") + pts.value + " points to " + r.n + " student" + (r.n === 1 ? "" : "s"), "ok"); if (location.hash.startsWith("#/class/")) classPage({ id: classId }); } }, "Award"))));
    })();
  }
  async function points() {
    CE.title("House points"); CE.loading(page);
    try {
      const [r, cd] = await Promise.all([api("ed_board"), api("ed_t_cd").catch(() => null)]); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = ""; const top = Math.max(1, ...r.house.map(x => x.pts));
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "House points"), h("div", { class: "sm mut" }, "Awarded by staff, and automatically for activities, entries, places, mastery and peer reviews.")), h("button", { class: "btn", onclick: () => awardModal() }, "+ Award points")));
      page.append(card("Houses", h("div", { class: "stack" }, ...r.house.map((x, i) => h("div", { class: "house-" + x.house }, h("div", { class: "row between sm" }, h("b", {}, (i + 1) + ". " + (r.houses[x.house] || x.house)), h("span", {}, x.pts.toLocaleString() + " pts · " + x.week + " this week")), h("div", { class: "hbar" }, h("i", { style: { width: CE.pct(x.pts, top) + "%" } })))))));
      const g = h("div", { class: "grid g2" }); page.append(g);
      g.append(card("Top students", h("div", { class: "list" }, ...r.students.slice(0, 20).map((x, i) => h("div", { class: "item" }, h("span", { class: "badge" + (i < 3 ? " cyan" : "") }, i + 1), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.name), h("div", { class: "s xs" }, [x.class, x.house ? r.houses[x.house] : null].filter(Boolean).join(" · ") + " · " + x.week + " this week")), h("span", { class: "b" }, x.pts))))));
      const cdc = cdHousesCard(cd && cd.ok ? cd : null); if (cdc) g.append(cdc);
      g.append(card("Classes", h("div", { class: "list" }, ...r.classes.map((x, i) => h("div", { class: "item" }, h("span", { class: "badge" }, i + 1), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.name), h("div", { class: "s xs" }, x.n + " students · " + Math.round(x.pts / Math.max(1, x.n)) + " each")), h("span", { class: "b" }, x.pts))))));
    } catch (e) { CE.fail(page, e); }
  }

  /* ---------- register & seating ---------- */
  function registerTab(id, r, box) {
    box.innerHTML = "";
    let order = (r.class.seating || []).filter(u => r.students.some(s => s.id === u)); r.students.forEach(s => { if (!order.includes(s.id)) order.push(s.id); });
    let sel1 = null;
    const status = s => s.overdue >= 2 ? "r" : s.overdue === 1 || (s.grade_avg != null && s.grade_avg < 50) ? "a" : (s.last_seen && new Date(s.last_seen) > Date.now() - 7 * 864e5) ? "g" : "";
    const grid = h("div", { class: "seat" });
    const draw = () => { grid.innerHTML = ""; order.forEach(uid => { const s = r.students.find(x => x.id === uid); grid.append(h("div", { class: "s " + status(s) + (sel1 === uid ? " sel" : ""), onclick: () => { if (sel1 == null) { sel1 = uid; } else { const i = order.indexOf(sel1), j = order.indexOf(uid); [order[i], order[j]] = [order[j], order[i]]; sel1 = null; api("ed_t_seating", { p_class: id, p_order: order }); } draw(); } }, h("div", { class: "nm" }, s.name), h("div", { class: "st" }, (s.overdue ? s.overdue + " overdue" : "up to date") + " · " + s.pts + " pts"), h("div", { class: "st" }, s.house ? "House " + s.house : ""))); }); };
    draw();
    box.append(h("div", { class: "card stack" }, h("div", { class: "row between" }, h("div", { class: "sm mut" }, "Front of the room is the top. Click one student then another to swap seats; the plan is saved for everyone who teaches this class."), h("div", { class: "row xs" }, h("span", { class: "badge bad" }, "2+ overdue"), h("span", { class: "badge warn" }, "1 overdue / low grades"), h("span", { class: "badge ok" }, "active this week"))), grid));
  }

  /* ---------- topics view ---------- */
  async function topicsTab(id, box) {
    box.innerHTML = ""; box.append(h("div", { class: "skel" }));
    const r = await api("ed_t_topics", { p_class: id }); if (!r.ok) return CE.fail(box, r);
    box.innerHTML = "";
    const topics = [...new Set(r.rows.map(x => x.topic))].sort(), names = [...new Map(r.rows.map(x => [x.uid, x.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    if (!topics.length) return box.append(h("div", { class: "empty" }, "No quiz answers yet. Tag quiz questions with a topic to see accuracy per topic here."));
    const lvl = v => v == null ? 0 : v >= 90 ? 4 : v >= 70 ? 3 : v >= 40 ? 2 : 1;
    const tb = h("table", { class: "heat" }, h("thead", {}, h("tr", {}, h("th", {}), ...topics.map(t => h("th", { title: t }, t.length > 22 ? t.slice(0, 21) + "…" : t)))), h("tbody", {}));
    names.forEach(([uid, name]) => tb.lastChild.append(h("tr", {}, h("th", {}, name), ...topics.map(t => { const x = r.rows.find(y => y.uid === uid && y.topic === t); const v = x ? Math.round(100 * x.right / x.n) : null; return h("td", { class: "h" + lvl(v), title: x ? name + " · " + t + ": " + x.right + "/" + x.n : "" }, v == null ? "·" : v + "%"); }))));
    const colAvg = topics.map(t => { const xs = r.rows.filter(y => y.topic === t); const n = xs.reduce((a, b) => a + b.n, 0); return n ? Math.round(100 * xs.reduce((a, b) => a + b.right, 0) / n) : null; });
    tb.lastChild.append(h("tr", {}, h("th", {}, "Class"), ...colAvg.map(a => h("td", { class: "h" + lvl(a) }, a == null ? "·" : a + "%"))));
    box.append(h("div", { class: "card" }, h("div", { class: "sm mut", style: { marginBottom: "10px" } }, "Accuracy per topic tag across every quiz answer. Weakest topics are the lightest columns."), h("div", { class: "tbw" }, tb)));
  }

  /* ---------- quiz results ---------- */
  async function quizStats(id) {
    const r = await api("ed_t_quiz_stats", { p_id: id }); if (!r.ok) return CE.toast(CE.errText(r), "bad");
    CE.modal(h("div", { class: "stack" }, h("h3", {}, r.title), h("div", { class: "grid g4" }, h("div", { class: "card flat stat" }, h("span", { class: "n" }, r.attempts), h("span", { class: "l" }, "Attempts")), h("div", { class: "card flat stat" }, h("span", { class: "n" }, r.students), h("span", { class: "l" }, "Students")), h("div", { class: "card flat stat" }, h("span", { class: "n" }, r.avg != null ? r.avg + "%" : "–"), h("span", { class: "l" }, "Average")), h("div", { class: "card flat stat" }, h("span", { class: "n" }, r.avg_secs ? Math.round(r.avg_secs / 60) + "m" : "–"), h("span", { class: "l" }, "Avg time"))),
      h("h4", {}, "By question"), h("div", { class: "list" }, ...r.questions.map(q => { const p = CE.pct(q.right, q.total); return h("div", { class: "item", style: { flexWrap: "wrap" } }, h("div", { class: "grow" }, h("div", { class: "t sm" }, (q.i + 1) + ". " + q.q + (q.topic ? " · " + q.topic : "")), h("div", { class: "s xs" }, "Picked: " + q.picks.map((n, k) => "ABCD"[k] + (k === q.c ? "✓" : "") + " " + n).join(" · ")), h("div", { class: "bar " + (p >= 70 ? "ok" : p >= 40 ? "warn" : ""), style: { marginTop: "6px" } }, h("i", { style: { width: p + "%" } }))), h("span", { class: "badge " + (p >= 70 ? "ok" : p >= 40 ? "warn" : "bad") }, p + "%")); })),
      h("h4", {}, "Attempts"), h("div", { class: "tbw" }, h("table", { class: "tb" }, h("tbody", {}, ...r.rows.slice(0, 50).map(x => h("tr", {}, h("td", { class: "b" }, x.name), h("td", {}, x.score + "/" + x.out_of), h("td", {}, x.secs ? Math.round(x.secs / 60) + " min" : "–"), h("td", { class: "sm mut" }, D.dt(x.at)))))))), { wide: true });
  }

  /* ---------- question bank ---------- */
  async function bank() {
    CE.title("Question bank"); CE.loading(page);
    try {
      const r = await api("ed_t_bank"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = ""; let subj = me.subj != null ? me.subj : (r.rows[0] ? r.rows[0].subj : 0);
      const head = h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Question bank"), h("div", { class: "sm mut" }, "Reusable questions tagged by topic. Pull them into any quiz with \"From question bank\".")), h("div", { class: "row" }, sel(subjOpts(), subj, { style: { width: "auto" }, onchange: e => { subj = +e.target.value; draw(); } }), h("button", { class: "btn ghost", onclick: () => importModal(subj) }, "Import CSV"), h("button", { class: "btn", onclick: () => addModal(subj) }, "+ Add question")));
      page.append(head); const body = h("div", { class: "stack" }); page.append(body);
      const draw = () => { body.innerHTML = ""; const rows = r.rows.filter(b => b.subj === subj); const topics = [...new Set(rows.map(b => b.topic || "untagged"))].sort(); if (!rows.length) return body.append(h("div", { class: "empty" }, "No questions for " + CE.subjName(subj) + " yet. Add one or import a CSV."));
        topics.forEach(t => body.append(card(t + " (" + rows.filter(b => (b.topic || "untagged") === t).length + ")", h("div", { class: "list" }, ...rows.filter(b => (b.topic || "untagged") === t).map(b => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", { class: "t sm" }, b.q), h("div", { class: "s xs" }, b.a.map((o, k) => (k === b.c ? "✓ " : "") + o).join(" · "))), h("button", { class: "ib", title: "Delete", onclick: async () => { if (await CE.confirm("Delete this question from the bank?", "Delete")) { await api("ed_t_bank_del", { p_id: b.id }); bank(); } } }, CE.icon("cross")))))))); };
      draw();
    } catch (e) { CE.fail(page, e); }
  }
  function addModal(subj) {
    const q = h("input", { class: "in", placeholder: "Question" }), topic = h("input", { class: "in", placeholder: "Topic tag" }), why = h("input", { class: "in", placeholder: "Explanation (optional)" }), a = [0, 1, 2, 3].map(k => h("input", { class: "in", placeholder: "Option " + "ABCD"[k] })); let c = 0;
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, "Add a question"), field("Question", q), h("div", { class: "grid g2" }, field("Topic", topic), field("Explanation", why)), h("div", { class: "grid g2", style: { gap: "6px" } }, ...a.map((el, k) => h("div", { class: "row", style: { gap: "6px", flexWrap: "nowrap" } }, h("input", { type: "radio", name: "bk", checked: k === 0, onchange: () => c = k }), el))), h("div", { class: "err", id: "berr" }),
      h("button", { class: "btn cyan", onclick: async () => { if (!q.value.trim() || a.some(x => !x.value.trim())) return $("#berr", box).textContent = "Question and four options are needed."; const r = await api("ed_t_bank_add", { p_subj: subj, p_rows: [{ topic: topic.value, q: q.value, a: a.map(x => x.value), c, why: why.value }] }); if (!r.ok) return $("#berr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast("Added", "ok"); bank(); } }, "Add")));
  }
  function importModal(subj) {
    const ta = h("textarea", { class: "in", style: { minHeight: "200px", fontFamily: "var(--mono)", fontSize: "12px" }, placeholder: "topic,question,option A,option B,option C,option D,correct (A-D),explanation\nlike terms,Simplify 2a + 3a,5a,6a,5a²,a⁵,A,Add the coefficients." }), file = h("input", { type: "file", accept: ".csv,text/csv", class: "hide" });
    file.onchange = () => { const fr = new FileReader(); fr.onload = () => ta.value = fr.result; fr.readAsText(file.files[0]); };
    const parse = txt => txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const cells = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch; } cells.push(cur); return cells.map(x => x.trim()); }).filter(c => c.length >= 7 && !/^topic$/i.test(c[0])).map(c => ({ topic: c[0], q: c[1], a: c.slice(2, 6), c: Math.max(0, "ABCD".indexOf((c[6] || "A").toUpperCase()[0])), why: c[7] || "" }));
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, "Import questions into " + CE.subjName(subj)), h("p", { class: "sm mut", style: { margin: 0 } }, "One question per line: topic, question, four options, the correct letter (A to D), then an optional explanation. Quote a cell that contains a comma. Paste below or choose a .csv file."), h("button", { class: "btn sm ghost", onclick: () => file.click() }, "Choose .csv file"), file, ta, h("div", { class: "err", id: "ierr" }),
      h("button", { class: "btn cyan", onclick: async () => { const rows = parse(ta.value); if (!rows.length) return $("#ierr", box).textContent = "No valid lines found."; const r = await api("ed_t_bank_add", { p_subj: subj, p_rows: rows }); if (!r.ok) return $("#ierr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast(r.n + " questions imported", "ok"); bank(); } }, "Import")), { wide: true });
  }
  function bankPicker(subj, done) {
    (async () => {
      const r = await api("ed_t_bank"); if (!r.ok) return CE.toast(CE.errText(r), "bad");
      const rows = r.rows.filter(b => b.subj === subj); const picked = new Set();
      if (!rows.length) return CE.toast("The bank has no questions for this subject yet.", "bad");
      const list = h("div", { class: "list" }, ...rows.map(b => h("label", { class: "item", style: { cursor: "pointer" } }, h("input", { type: "checkbox", onchange: e => e.target.checked ? picked.add(b.id) : picked.delete(b.id) }), h("div", { class: "grow" }, h("div", { class: "t sm" }, b.q), h("div", { class: "s xs" }, (b.topic || "untagged") + " · " + b.a[b.c])))));
      const prev = CE.$("#modal .box"); const saved = prev ? prev : null;
      const pop = h("div", { class: "card", style: { position: "fixed", right: "16px", bottom: "16px", width: "min(520px,92vw)", maxHeight: "70vh", overflow: "auto", zIndex: 200 } }, h("div", { class: "hd" }, h("h4", { style: { margin: 0 } }, "From the question bank"), h("button", { class: "ib", onclick: () => pop.remove() }, CE.icon("cross"))), list, h("div", { class: "row", style: { marginTop: "10px" } }, h("button", { class: "btn cyan sm", onclick: () => { done(rows.filter(b => picked.has(b.id))); pop.remove(); } }, "Add selected")));
      document.body.append(pop);
    })();
  }

  /* ---------- clubs ---------- */
  async function clubs() {
    CE.title("Clubs"); CE.loading(page);
    try {
      const r = await api("ed_t_clubs"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Clubs"), h("div", { class: "sm mut" }, "Lunchtime and after-school clubs with a capacity and a sign-up list.")), h("button", { class: "btn", onclick: () => clubEditor(null) }, "+ New club")));
      if (!r.rows.length) page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("users")), h("div", { class: "b" }, "No clubs yet")));
      r.rows.forEach(c => page.append(h("div", { class: "card" }, h("div", { class: "hd" }, h("div", {}, h("h3", {}, c.title), h("div", { class: "sm mut" }, c.day + " · " + c.time + (c.place ? " · " + c.place : "") + (c.cat ? " · " + CE.catName(c.cat) : "") + " · " + (c.ages === "all" ? "all ages" : c.ages === "11plus" ? "11+" : "under 11"))), h("div", { class: "row" }, h("span", { class: "badge" + (c.members.length >= c.capacity ? " bad" : " cyan") }, c.members.length + "/" + c.capacity), h("button", { class: "btn sm ghost", onclick: () => clubEditor(c) }, "Edit"))), c.blurb ? h("p", { class: "sm mut" }, c.blurb) : null, c.members.length ? h("div", { class: "pill-row" }, ...c.members.map(m => h("span", { class: "pill", title: "Signed up " + D.dt(m.at) }, m.name + (m.class ? " (" + m.class + ")" : ""), h("button", { class: "ib", style: { width: "22px", height: "22px", marginLeft: "4px" }, title: "Remove", onclick: async () => { if (await CE.confirm("Remove " + m.name + " from " + c.title + "?", "Remove")) { await api("ed_t_club_remove", { p_id: c.id, p_uid: m.uid }); clubs(); } } }, CE.icon("cross"))))) : h("div", { class: "sm mut" }, "Nobody signed up yet."))));
    } catch (e) { CE.fail(page, e); }
  }
  function clubEditor(c) {
    c = c || { cat: 0, title: "", blurb: "", day: "Monday", time: "12:30", place: "", capacity: 20, ages: "all" };
    const title = h("input", { class: "in", value: c.title, placeholder: "Club name" }), blurb = h("input", { class: "in", value: c.blurb, placeholder: "One line" }), cat = sel([[0, "No category"]].concat(catOpts()), c.cat || 0), day = sel(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => [d, d]), c.day), time = h("input", { class: "in", value: c.time, placeholder: "12:30" }), place = h("input", { class: "in", value: c.place, placeholder: "Room" }), cap = h("input", { class: "in", type: "number", value: c.capacity, min: 1 }), ages = sel([["all", "All ages"], ["under11", "Under 11"], ["11plus", "11 and over"]], c.ages);
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, c.id ? "Edit club" : "New club"), field("Name", title), field("Blurb", blurb), h("div", { class: "grid g3" }, field("Day", day), field("Time", time), field("Place", place)), h("div", { class: "grid g3" }, field("Capacity", cap), field("Ages", ages), field("Category", cat)), h("div", { class: "err", id: "cerr" }),
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { const r = await api("ed_t_club_save", { p_id: c.id || 0, p_cat: +cat.value, p_title: title.value, p_blurb: blurb.value, p_day: day.value, p_time: time.value, p_place: place.value, p_capacity: +cap.value, p_ages: ages.value }); if (!r.ok) return $("#cerr", box).textContent = CE.errText(r); CE.closeModal(); CE.toast(c.id ? "Saved" : "Club created and students notified", "ok"); clubs(); } }, "Save"), c.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Delete this club and its sign-ups?", "Delete")) { await api("ed_t_club_del", { p_id: c.id }); CE.closeModal(); clubs(); } } }, "Delete") : null)));
  }

  /* ---------- newsletter builder ---------- */
  async function newsletterBuilder() {
    const [w, c] = await Promise.all([api("ed_t_winners", { p_days: 60 }), loadContent()]);
    const d = new Date(), term = (d.getMonth() >= 8 ? "Autumn" : d.getMonth() >= 4 ? "Summer" : "Spring") + " " + d.getFullYear();
    let body = "";
    if (w.ok && w.rows.length) { body += "**Competition results**\n\n"; w.rows.forEach(x => { body += x.title + ":\n"; x.places.forEach(p => body += "- " + ["", "1st", "2nd", "3rd"][p.place] + " " + p.name + (p.body ? " · " + p.body : "") + "\n"); body += "\n"; }); }
    const open = (c.competitions || []).filter(x => new Date(x.closes) > Date.now()); if (open.length) { body += "**Open now**\n\n" + open.map(x => "- " + x.title + " (closes " + D.short(x.closes) + ")").join("\n") + "\n\n"; }
    const recent = (c.news || []).filter(n => !n.issue && new Date(n.created) > Date.now() - 60 * 864e5).slice(0, 5); if (recent.length) { body += "**Also this term**\n\n" + recent.map(n => "- " + n.title).join("\n") + "\n\n"; }
    const fresh = (c.activities || []).slice(0, 5); if (fresh.length) { body += "**New activities to try**\n\n" + fresh.map(a => "- " + a.title + " (" + CE.catName(a.cat) + ")").join("\n") + "\n"; }
    newsEditor({ title: "Student newsletter: " + term, body: body.trim() || "Write the newsletter here.", cover: "", featured: true, issue: term });
  }

  /* ---------- search ---------- */
  async function search() {
    CE.title("Search"); page.innerHTML = "";
    page.append(h("div", { class: "page-lead" }, h("div", {}, h("h2", {}, "Search"), h("div", { class: "sm mut" }, "Lessons, quizzes, activities, competitions, news, assignments, people and the question bank."))));
    const res = h("div", { class: "stack" }); let data = null;
    const run = q => { res.innerHTML = ""; if (!data) return res.append(h("div", { class: "skel" })); if (q.length < 2) return res.append(h("div", { class: "empty" }, "Type at least two letters.")); const hit = t => String(t || "").toLowerCase().includes(q); const rows = [];
      data.c.units.forEach(u => { if (hit(u.title)) rows.push(["book", u.title, CE.subjName(u.subj) + " · unit", "#/content/" + u.subj]); u.lessons.forEach(l => { if (hit(l.title)) rows.push(["lesson", l.title, u.title, "#/content/" + u.subj]); }); });
      data.c.quizzes.forEach(x => { if (hit(x.title)) rows.push([x.kind === "checkpoint" ? "flag" : "question", x.title, CE.subjName(x.subj) + " · " + x.kind, "#/content/" + x.subj]); });
      data.c.activities.forEach(a => { if (hit(a.title) || hit(a.blurb)) rows.push(["explore", a.title, CE.catName(a.cat) + " · activity", "#/activities"]); });
      data.c.competitions.forEach(x => { if (hit(x.title)) rows.push(["trophy", x.title, x.kind, "#/competition/" + x.id]); });
      data.c.news.forEach(n => { if (hit(n.title) || hit(n.body)) rows.push(["news", n.title, "News", "#/news"]); });
      data.a.rows.forEach(x => { if (hit(x.title)) rows.push(["pencil", x.title, x.class + " · " + x.kind, "#/assignment/" + x.id]); });
      data.p.users.forEach(u => { if (hit(u.name) || hit(u.username)) rows.push([u.role === "student" ? "user" : "people", u.name, u.role + (u.class_id ? " · " + ((data.p.classes.find(k => k.id === u.class_id) || {}).name || "") : ""), "#/people/" + (u.role === "student" ? "students" : "staff")]); });
      data.b.rows.forEach(b => { if (hit(b.q) || hit(b.topic)) rows.push(["grid", b.q, "Question bank · " + (b.topic || "untagged"), "#/bank"]); });
      if (!rows.length) return res.append(h("div", { class: "empty" }, "Nothing matches."));
      res.append(h("div", { class: "list" }, ...rows.slice(0, 50).map(([ic, t, s2, href]) => h("a", { class: "item", href }, h("div", { class: "ico sm" }, CE.icon(ic)), h("div", { class: "grow" }, h("div", { class: "t sm" }, t), h("div", { class: "s xs" }, s2)))))); };
    const box = CE.searchBox("Search lessons, quizzes, activities, competitions, news, assignments, people and the question bank", run); page.append(h("div", { class: "card stack" }, box, res)); box.querySelector("input").focus();
    const [c, a, p2, b] = await Promise.all([loadContent(), api("ed_t_assigns"), api("ed_a_users"), api("ed_t_bank")]);
    data = { c: c.ok ? c : { units: [], quizzes: [], activities: [], competitions: [], news: [] }, a: a.ok ? a : { rows: [] }, p: p2.ok ? p2 : { users: [], classes: [] }, b: b.ok ? b : { rows: [] } }; run(box.querySelector("input").value.trim().toLowerCase());
  }

  /* ---------- v2.3: admin dashboard, login codes, feeds, links, Compass Dash ---------- */
  const codeFmt = c => String(c || "").replace(/\D/g, "").replace(/^(\d{4})(\d{4})$/, "$1-$2");
  const statusBadge = s => h("span", { class: "badge st-" + s }, { unused: "Unused", active: "Active", revoked: "Revoked", expired: "Expired" }[s] || s);
  const srcTag = CE.srcTag;
  const siteUrl = () => new URL(CE.root + "signin.html?code=", location.href).href;

  async function admin(p) {
    const tab = (p && p.tab) || "overview"; if (me.role !== "admin") return CE.nav("/people");
    CE.title("Admin"); CE.loading(page);
    try {
      if (tab === "codes") return codesTab();
      if (tab === "feeds") return feedsTab();
      if (tab === "links") return linksTab();
      if (tab === "feedback") return feedbackTab();
      const r = await api("ed_a_dash"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Admin overview"), h("div", { class: "sm mut" }, r.school.name + " · accounts, codes, feeds and links in one place.")), h("div", { class: "row" }, h("a", { class: "btn", href: "#/admin/codes" }, "Login codes"), h("a", { class: "btn ghost", href: "#/people" }, "Accounts"))));
      page.append(h("div", { class: "adm-grid" },
        tile(r.students, "Students", "#/people/students"), tile(r.staff, "Staff", "#/people/staff"), tile(r.active_today, "Active today"), tile(r.active_week, "Active this week"),
        tile(r.codes.unused, "Unused codes", "#/admin/codes"), tile(r.codes.active, "Active codes", "#/admin/codes"), tile(r.disabled, "Disabled accounts", "#/people/students"), tile(r.no_consent, "Not yet agreed to terms", null, r.no_consent ? "warn" : "")));
      const g = h("div", { class: "grid g2" }); page.append(g);
      g.append(card("Recent accounts", r.recent.length ? h("div", { class: "list" }, ...r.recent.map(x => h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon(x.role === "student" ? "user" : "people")), h("div", { class: "grow" }, h("div", { class: "t sm" }, x.name, " ", h("span", { class: "kbd" }, x.username)), h("div", { class: "s xs" }, x.role + " · joined " + D.ago(x.created) + (x.consent ? "" : " · terms not yet accepted"))), h("a", { class: "btn sm ghost", href: "#/people/" + (x.role === "student" ? "students" : "staff") }, "Open")))) : h("div", { class: "empty" }, "No accounts yet.")));
      g.append(card("Security", h("div", { class: "stack sm" },
        h("div", { class: "row between" }, h("span", {}, "Sessions in use (30 days)"), h("b", {}, r.sessions)),
        h("div", { class: "row between" }, h("span", {}, "Connections locked out right now"), h("b", {}, r.locked_ips)),
        h("div", { class: "row between" }, h("span", {}, "Student join code"), h("span", { class: "kbd" }, r.school.join_code)),
        h("div", { class: "row between" }, h("span", {}, "Teacher invite code"), h("span", { class: "kbd" }, r.school.invite_code)),
        h("div", { class: "xs mut" }, "Passwords are stored as bcrypt hashes and are never shown. Five wrong sign-ins lock a connection for a minute. The administrator password is changed under Settings and is not kept anywhere in the website's code."),
        h("div", { class: "row" }, h("a", { class: "btn sm ghost", href: "#/people/codes" }, "Change join codes"), h("a", { class: "btn sm ghost", href: "#/settings" }, "Change my password")))));
      g.append(card("Integrations", h("div", { class: "stack sm" },
        h("div", { class: "row between" }, h("span", {}, "Compass Dash (same database)"), h("span", { class: "badge " + (r.compassdash ? "ok" : "") }, r.compassdash ? "Connected" : "Not installed")),
        h("div", { class: "row between" }, h("span", {}, "Calendar feeds (http extension)"), h("span", { class: "badge " + (r.http ? "ok" : "warn") }, r.http ? "Ready" : "Enable in Supabase")),
        ...r.feeds.map(f => h("div", { class: "row between" }, h("span", {}, srcTag(f.source, f.name), " ", f.name), h("span", { class: "xs mut" }, f.last_error ? "Error: " + f.last_error : f.last_sync ? f.n + " events · synced " + D.ago(f.last_sync) : "Never synced"))),
        h("div", { class: "row" }, h("a", { class: "btn sm ghost", href: "#/admin/feeds" }, "Calendar feeds"), h("a", { class: "btn sm ghost", href: "#/admin/links" }, "Links on home pages")))));
      g.append(card("Houses", h("div", { class: "stack sm" }, ...Object.entries(r.school.houses || CE.HOUSE_NAMES).map(([k, v]) => h("div", { class: "row between house-" + k }, h("span", { class: "hpill" }, v), h("span", { class: "xs mut" }, { N: "red", E: "green", S: "blue", W: "yellow" }[k]))), h("div", { class: "xs mut" }, "Students choose a house once; staff change it from a class page. Points and the leaderboard are under House points."))));
      api("ed_a_feedback").then(f => { if (!f.ok) return; const t = tile(f.unseen, "New feedback", "#/admin/feedback", f.unseen ? "warn" : ""); page.querySelector(".adm-grid").append(t); }).catch(() => {});
      g.append(card("Printable forms", h("div", { class: "stack sm" }, h("a", { class: "btn sm ghost", href: CE.root + "consent.html", target: "_blank" }, "Parent or carer consent form"), h("a", { class: "btn sm ghost", href: "#/admin/codes" }, "Login code sheets"), h("div", { class: "xs mut" }, "Also: ", h("a", { href: CE.root + "privacy.html", target: "_blank" }, "Privacy Policy"), " · ", h("a", { href: CE.root + "terms.html", target: "_blank" }, "Terms of Service"), " · ", h("a", { href: CE.root + "cookies.html", target: "_blank" }, "Cookie Policy")))));
    } catch (e) { CE.fail(page, e); }
  }
  const tile = (n, l, href, cls) => h(href ? "a" : "div", { class: "card stat sm" + (cls ? " " + cls : ""), href: href || null, style: { textDecoration: "none", color: "inherit" } }, h("span", { class: "n" }, n), h("span", { class: "l" }, l));

  /* ----- login codes ----- */
  async function codesTab() {
    const r = await api("ed_a_codes"); if (!r.ok) return CE.fail(page, r);
    page.innerHTML = "";
    const picked = new Set();
    page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Login codes"), h("div", { class: "sm mut" }, "Each code is unique and belongs to one person. Blank codes create an account the first time they are used; a code made for an existing account signs that person in and asks for a new password.")), h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: () => genModal(r) }, "+ Make codes"), h("button", { class: "btn ghost", onclick: () => printCodes(r.rows.filter(c => picked.size ? picked.has(c.code) : c.status === "unused")) }, CE.icon("phone"), picked.size ? "Print selected" : "Print unused"))));
    let filter = "all"; const q = h("input", { class: "in", placeholder: "Search codes, names, classes", style: { maxWidth: "300px" } });
    const seg = h("div", { class: "seg" }, ...[["all", "All"], ["unused", "Unused"], ["active", "Active"], ["revoked", "Revoked"], ["expired", "Expired"]].map(([k, l]) => h("button", { class: k === "all" ? "on" : "", onclick: e => { filter = k; CE.$$("button", seg).forEach(b => b.classList.toggle("on", b === e.target)); draw(); } }, l)));
    const tb = h("table", { class: "tb" }, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Code"), h("th", {}, "Status"), h("th", {}, "For"), h("th", {}, "Class / year"), h("th", {}, "Made"), h("th", {}, "Used"), h("th", {}, ""))), h("tbody", {}));
    const printBtn = page.querySelector(".row.between .row .btn.ghost");
    const draw = () => {
      const f = q.value.trim().toLowerCase(); tb.lastChild.innerHTML = "";
      r.rows.filter(c => (filter === "all" || c.status === filter) && (!f || c.code.includes(f) || (c.user && (c.user.name.toLowerCase().includes(f) || c.user.username.toLowerCase().includes(f))) || (c.label || "").toLowerCase().includes(f) || (c.class || "").toLowerCase().includes(f))).forEach(c => {
        const cb = h("input", { type: "checkbox", checked: picked.has(c.code), onchange: () => { if (cb.checked) picked.add(c.code); else picked.delete(c.code); printBtn.lastChild.textContent = picked.size ? "Print selected (" + picked.size + ")" : "Print unused"; } });
        tb.lastChild.append(h("tr", { style: c.status === "revoked" || c.status === "expired" ? { opacity: .55 } : null },
          h("td", {}, cb), h("td", {}, h("span", { class: "code sm" }, c.code)), h("td", {}, statusBadge(c.status), c.purpose === "reset" && !c.used_at && c.status === "active" ? h("div", { class: "xs mut" }, "reset · not used yet") : null),
          h("td", {}, c.user ? h("span", {}, h("b", {}, c.user.name), " ", h("span", { class: "kbd" }, c.user.username), c.user.disabled ? h("span", { class: "badge" }, "disabled") : null) : h("span", { class: "mut" }, "New " + c.role + (c.label ? " · " + c.label : ""))),
          h("td", { class: "sm" }, [c.class, c.year ? "Year " + c.year : null].filter(Boolean).join(" · ") || "–"), h("td", { class: "sm" }, D.ago(c.created) + (c.by ? " by " + c.by : "")), h("td", { class: "sm" }, c.used_at ? "first " + D.short(c.used_at) + (c.last_used ? ", last " + D.ago(c.last_used) : "") : c.status === "unused" ? "expires " + D.short(c.expires) : "–"),
          h("td", {}, h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("button", { class: "btn sm ghost", onclick: () => printCodes([c]) }, "Print"), c.status === "revoked" ? h("button", { class: "btn sm ghost", onclick: async () => { const x = await api("ed_a_code_revoke", { p_code: c.code, p_undo: true }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); CE.toast("Code restored", "ok"); codesTab(); } }, "Restore") : c.status === "expired" ? null : h("button", { class: "btn sm bad", onclick: async () => { if (await CE.confirm("Revoke " + c.code + "? " + (c.user ? c.user.name + " can still sign in with their password." : "It will no longer create an account."), "Revoke")) { const x = await api("ed_a_code_revoke", { p_code: c.code, p_undo: false }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); CE.toast("Code revoked", "ok"); codesTab(); } } }, "Revoke")))));
      });
      if (!tb.lastChild.children.length) tb.lastChild.append(h("tr", {}, h("td", { colspan: 8, class: "mut" }, "No codes here yet. Click \"Make codes\".")));
    };
    q.oninput = draw; draw();
    page.append(h("div", { class: "card stack" }, h("div", { class: "row between" }, q, seg), h("div", { class: "tbw" }, tb), h("div", { class: "row between" }, h("div", { class: "xs mut" }, r.rows.length + " codes · " + r.rows.filter(c => c.status === "unused").length + " unused · " + r.rows.filter(c => c.status === "active").length + " active"), r.admin ? h("button", { class: "btn sm ghost", onclick: async () => { if (await CE.confirm("Delete every revoked code and every unused code that has expired? Active and unused codes are kept.", "Tidy up")) { const x = await api("ed_a_code_purge"); CE.toast(x.ok ? "Removed " + x.n + " old codes" : CE.errText(x), x.ok ? "ok" : "bad"); codesTab(); } } }, "Tidy up old codes") : null)));
  }
  function genModal(r, user) {
    const n = h("input", { class: "in", type: "number", min: 1, max: 200, value: 10 }), role = sel([["student", "Students"], ["teacher", "Staff"]], "student", { disabled: !r.admin }), cl = sel([[0, "No class yet"]].concat((me.classes || []).map(c => [c.id, c.name])), 0), yr = sel([[0, "–"]].concat([7, 8, 9, 10, 11, 12, 13].map(y => [y, "Year " + y])), 0), label = h("input", { class: "in", maxlength: 60, placeholder: user ? "e.g. Forgot password" : "e.g. 7A · September intake" }), er = h("div", { class: "err" });
    const sf = h("div", { class: "grid g2" }, field("Class", cl), field("Year", yr)); role.onchange = () => sf.classList.toggle("hide", role.value !== "student");
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, user ? "Login code for " + user.name : "Make login codes"),
      user ? h("p", { class: "sm mut", style: { margin: 0 } }, "A new code for this account. Any older codes they had are revoked. When they use it they are signed in and asked to set a new password, so this is also how to reset someone's credentials.") : h("p", { class: "sm mut", style: { margin: 0 } }, "Blank codes to hand out. Each one creates one account the first time it is used, with the class and year you set here. Unused codes expire after 180 days."),
      user ? null : h("div", { class: "grid g2" }, field("How many", n), field("For", role)), user ? null : sf, field("Label (printed on the sheet)", label), er,
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { er.textContent = ""; const x = await api("ed_a_code_gen", { p_n: +n.value || 1, p_role: role.value, p_class: +cl.value, p_year: +yr.value, p_label: label.value, p_uid: user ? user.id : 0 }); if (!x.ok) return er.textContent = CE.errText(x); CE.closeModal(); CE.toast(x.codes.length + " code" + (x.codes.length > 1 ? "s" : "") + " made", "ok");
        const made = await api("ed_a_codes"); const rows = made.ok ? made.rows.filter(c => x.codes.includes(c.code)) : x.codes.map(c => ({ code: c, role: role.value, label: label.value }));
        if (user) showCode(rows[0], user); else { if (location.hash.startsWith("#/admin/codes")) codesTab(); else CE.nav("/admin/codes"); if (await CE.confirm("Print the " + rows.length + " new code" + (rows.length > 1 ? "s" : "") + " now?", "Print")) printCodes(rows); } } }, user ? "Make code" : "Make codes"))));
  }
  function showCode(c, user) {
    const url = siteUrl() + c.code.replace("-", "");
    CE.modal(h("div", { class: "stack", style: { textAlign: "center" } }, h("h3", {}, "Code for " + user.name), h("div", { class: "code", style: { fontSize: "34px" } }, c.code), h("p", { class: "sm mut" }, "Give this to them in person. It signs them in at ", h("b", {}, location.host + "/signin.html"), " under \"Use a code\", then asks for a new password."),
      h("div", { class: "row", style: { justifyContent: "center" } }, h("button", { class: "btn", onclick: () => printCodes([Object.assign({}, c, { user: { name: user.name, username: user.username } })]) }, "Print card"), h("button", { class: "btn ghost", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(c.code); CE.toast("Copied", "ok"); } }, "Copy"), h("a", { class: "btn ghost", href: url, target: "_blank", rel: "noopener" }, "Open link"))));
  }
  /* print: cut-out cards, two per row, with the sign-in address on each */
  function printCodes(rows) {
    if (!rows.length) return CE.toast("Nothing to print. Select some codes first.", "bad");
    CE.$$(".print-only", page).forEach(x => x.remove());
    const addr = location.host + "/signin.html";
    const sheet = h("div", { class: "print-only hide" }, h("div", { class: "print-head" }, h("b", {}, (CE.me && CE.me.school) || "Compass Ed"), " · login codes · printed " + D.long(new Date().toISOString()) + " · " + rows.length + " code" + (rows.length > 1 ? "s" : "") + ". Cut along the dashed lines. Keep this sheet somewhere safe."),
      h("div", { class: "codesheet" }, ...rows.map(c => h("div", { class: "cc" }, h("div", { class: "t" }, c.user ? c.user.name : "Your Compass Ed login"), h("img", { src: CE.root + "assets/logo.svg", alt: "" }), h("div", { class: "s" }, c.user ? "Username " + c.user.username + " · this code also resets your password" : [c.role === "teacher" ? "Staff account" : "Student account", c.class, c.year ? "Year " + c.year : null, c.label].filter(Boolean).join(" · ")), h("div", { class: "code" }, c.code), h("div", { class: "how" }, "1. Go to ", h("b", {}, addr), " and choose \"Use a code\". 2. Type the code. 3. " + (c.user ? "Set your new password." : "Pick a username and password.") + " Do not share this code.")))));
    page.append(sheet); sheet.classList.remove("hide");
    const after = () => { sheet.remove(); removeEventListener("afterprint", after); }; addEventListener("afterprint", after);
    setTimeout(() => print(), 50);
  }

  /* ----- feedback (admin only reads it) ----- */
  async function feedbackTab() {
    const r = await api("ed_a_feedback"); if (!r.ok) return CE.fail(page, r);
    page.innerHTML = ""; let filter = "new";
    page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Feedback"), h("div", { class: "sm mut" }, r.total + " message" + (r.total === 1 ? "" : "s") + (r.avg ? " · average rating " + r.avg + " of 5" : "") + " · " + r.unseen + " new. Only the administrator can see this page.")), r.unseen ? h("button", { class: "btn ghost", onclick: async () => { const x = await api("ed_a_feedback_seen", { p_id: 0, p_seen: true }); if (!x.ok) return CE.toast(CE.errText(x), "bad"); feedbackTab(); } }, "Mark all as seen") : null));
    const seg = h("div", { class: "seg" }, ...[["new", "New"], ["all", "All"]].concat(CE.FB_CATS.map(c => [c, c])).map(([k, l]) => h("button", { class: k === filter ? "on" : "", onclick: e => { filter = k; CE.$$("button", seg).forEach(b => b.classList.toggle("on", b === e.target)); draw(); } }, l)));
    const list = h("div", { class: "stack" }); page.append(h("div", { class: "row" }, seg), list);
    const draw = () => {
      list.innerHTML = "";
      const rows = r.rows.filter(x => filter === "all" || (filter === "new" ? !x.seen : x.category === filter));
      if (!rows.length) list.append(CE.emptyArt("inbox", filter === "new" ? "Nothing new" : "No feedback here yet", "Students and staff send it from the Feedback button in their portal."));
      rows.forEach(x => list.append(h("div", { class: "card fb-card" + (x.seen ? "" : " new") },
        h("div", { class: "hd" }, h("div", { class: "row" }, h("span", { class: "fb-stars", "aria-label": x.rating + " of 5" }, "★".repeat(x.rating) + "☆".repeat(5 - x.rating)), h("span", { class: "badge cyan" }, x.category), x.seen ? null : h("span", { class: "badge ink" }, "New")), h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: async () => { const y = await api("ed_a_feedback_seen", { p_id: x.id, p_seen: !x.seen }); if (!y.ok) return CE.toast(CE.errText(y), "bad"); x.seen = !x.seen; r.unseen += x.seen ? -1 : 1; draw(); } }, x.seen ? "Mark as new" : "Mark as seen"), h("button", { class: "btn sm bad", onclick: async () => { if (await CE.confirm("Delete this message?", "Delete")) { const y = await api("ed_a_feedback_del", { p_id: x.id }); if (!y.ok) return CE.toast(CE.errText(y), "bad"); r.rows = r.rows.filter(z => z !== x); r.total--; if (!x.seen) r.unseen--; draw(); } } }, "Delete"))),
        h("div", { class: "fb-body" }, x.body),
        h("div", { class: "xs mut", style: { marginTop: "10px" } }, (x.name || "Unknown") + (x.username ? " (" + x.username + ")" : "") + " · " + x.role + " · " + D.ago(x.created) + (x.page ? " · from " + x.page : "")))));
    };
    draw();
  }

  /* ----- calendar feeds ----- */
  async function feedsTab() {
    const r = await api("ed_a_feeds"); if (!r.ok) return CE.fail(page, r);
    page.innerHTML = "";
    page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Calendar feeds"), h("div", { class: "sm mut" }, "Subscribe to any iCalendar (.ics) address. Its events are mirrored into the campus calendar, tagged with where they came from, and refreshed each time you sync.")), h("button", { class: "btn cyan", onclick: () => feedEditor(null) }, "+ Add feed")));
    if (!r.http) page.append(h("div", { class: "card tint" }, h("b", {}, "One thing to switch on first. "), "Feeds are fetched by the database, which needs the ", h("span", { class: "kbd" }, "http"), " extension. In Supabase open Database > Extensions, search for http and enable it. Then come back and click Sync."));
    page.append(h("div", { class: "card stack" }, h("h3", {}, "Global Campus and other calendars"), h("p", { class: "sm mut", style: { margin: 0 } }, "Global Campus (Nord Anglia) has no public API, so Compass Ed uses the one method every calendar service supports: an iCalendar feed. In Global Campus (or the school's Google/Outlook calendar), find the calendar's \"export\", \"subscribe\" or \"iCal\" link, paste it here and pick the source. Events stay in sync whenever a sync runs; to run it automatically, schedule ", h("span", { class: "kbd" }, "select public.ed_feeds_sync_all();"), " hourly with pg_cron in Supabase.")));
    const list = h("div", { class: "stack" }); page.append(list);
    if (!r.rows.length) list.append(CE.emptyArt("inbox", "No feeds yet", "Add the Global Campus calendar or any .ics link."));
    r.rows.forEach(f => list.append(h("div", { class: "card" }, h("div", { class: "hd" }, h("div", { class: "row" }, srcTag(f.source, f.name), h("h3", { style: { margin: 0 } }, f.name), f.class ? h("span", { class: "badge" }, f.class) : h("span", { class: "badge" }, "Whole school")), h("div", { class: "row" }, h("button", { class: "btn sm cyan", onclick: async e => { e.target.disabled = true; const x = await api("ed_a_feed_sync", { p_id: f.id }); CE.toast(x.ok ? x.n + " events in sync" : CE.errText(x) + (x.detail ? " (" + x.detail + ")" : ""), x.ok ? "ok" : "bad"); feedsTab(); } }, "Sync now"), h("button", { class: "btn sm ghost", onclick: () => feedEditor(f) }, "Edit"))),
      h("div", { class: "sm mut", style: { wordBreak: "break-all" } }, f.url), h("div", { class: "xs mut", style: { marginTop: "6px" } }, (f.last_sync ? f.n + " events · last synced " + D.ago(f.last_sync) : "Never synced yet") + (f.last_error ? " · last error: " + f.last_error : "") + " · times without a zone read as " + f.tz))));
  }
  function feedEditor(f) {
    f = f || { name: "", url: "", source: "globalcampus", class_id: 0, tz: "Europe/London" };
    const name = h("input", { class: "in", value: f.name, placeholder: "e.g. Global Campus events" }), url = h("input", { class: "in", value: f.url, placeholder: "https://…/calendar.ics (or webcal://…)" }), src = sel([["globalcampus", "Global Campus"], ["compassdash", "Compass Dash"], ["other", "Other calendar"]], f.source), cl = sel(classOpts("Whole school"), f.class_id || 0), tz = h("input", { class: "in", value: f.tz, placeholder: "Europe/London" }), er = h("div", { class: "err" });
    const box = CE.modal(h("div", { class: "stack" }, h("h3", {}, f.id ? "Edit feed" : "Add a calendar feed"), field("Name", name), field("Feed address", url, "Must be an iCalendar link: it usually ends in .ics. Secret addresses from Google or Outlook work too."), h("div", { class: "grid g2" }, field("Source", src), field("Show to", cl)), field("Time zone for times without one", tz), er,
      h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { er.textContent = ""; const x = await api("ed_a_feed_save", { p_id: f.id || 0, p_name: name.value, p_url: url.value.trim(), p_source: src.value, p_class: +cl.value, p_tz: tz.value.trim() }); if (!x.ok) return er.textContent = CE.errText(x); CE.closeModal(); CE.toast("Saved. Click Sync now to fetch it.", "ok"); feedsTab(); } }, "Save"), f.id ? h("button", { class: "btn bad right", onclick: async () => { if (await CE.confirm("Remove this feed and every event it added?", "Remove feed")) { await api("ed_a_feed_del", { p_id: f.id }); CE.closeModal(); feedsTab(); } } }, "Remove") : null)));
  }

  /* ----- links shown on home pages ----- */
  async function linksTab() {
    const r = await api("ed_a_dash"); if (!r.ok) return CE.fail(page, r);
    page.innerHTML = ""; let links = (r.school.links || []).map(l => Object.assign({}, l));
    page.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: { margin: 0 } }, "Links & integrations"), h("div", { class: "sm mut" }, "Shortcuts shown on the public home page and in both portals: Global Campus, Compass Dash, the library, anything with a web address.")), h("button", { class: "btn", onclick: () => { links.push({ name: "", url: "https://", blurb: "" }); draw(); } }, "+ Add link")));
    page.append(h("div", { class: "card stack" }, h("h3", {}, "Compass Dash"), h("div", { class: "row between" }, h("span", { class: "sm" }, "Compass Dash shares this database, so the connection is automatic: students link their Compass Dash code and username from their Settings, and their XP, mastery, assignments and announcements appear in Compass Ed. Everyone sees the Compass Dash house cup under House points."), h("span", { class: "badge " + (r.compassdash ? "ok" : "") }, r.compassdash ? "Connected" : "Not installed"))));
    const list = h("div", { class: "stack" }), er = h("div", { class: "err" }); page.append(h("div", { class: "card stack" }, list, er, h("div", { class: "row" }, h("button", { class: "btn cyan", onclick: async () => { er.textContent = ""; const x = await api("ed_a_links_save", { p_links: links.filter(l => l.name.trim() || l.url !== "https://") }); if (!x.ok) return er.textContent = CE.errText(x); CE.toast("Saved", "ok"); linksTab(); } }, "Save links"))));
    const draw = () => { list.innerHTML = ""; if (!links.length) list.append(h("div", { class: "empty" }, "No links yet. Add Global Campus or Compass Dash."));
      links.forEach((l, i) => list.append(h("div", { class: "grid", style: { gridTemplateColumns: "1fr 1.4fr 1.6fr auto", gap: "8px", alignItems: "center" } }, h("input", { class: "in", value: l.name, placeholder: "Name", maxlength: 40, oninput: e => l.name = e.target.value }), h("input", { class: "in", value: l.url, placeholder: "https://…", oninput: e => l.url = e.target.value }), h("input", { class: "in", value: l.blurb, placeholder: "One line about it", maxlength: 120, oninput: e => l.blurb = e.target.value }), h("button", { class: "ib", title: "Remove", onclick: () => { links.splice(i, 1); draw(); } }, CE.icon("cross"))))); };
    draw();
    page.append(h("div", { class: "card stack" }, h("h3", {}, "Suggested"), h("div", { class: "row" }, ...[["Global Campus", "https://globalcampus.nae.school/", "Nord Anglia's online campus: global challenges and programmes."], ["Compass Dash", "https://compassdash.github.io/Compassdash/", "KS3 revision games with XP and the house cup."], ["Compass GCSE", "https://compassdash.github.io/Compass-GCSE/", "GCSE revision, the sister site of Compass Dash."]].filter(([n]) => !links.some(l => l.name === n)).map(([n, u, b]) => h("button", { class: "btn sm ghost", onclick: () => { links.push({ name: n, url: u, blurb: b }); draw(); } }, "+ " + n)))));
  }

  /* ----- Compass Dash for staff (houses, challenges, cup, leaderboard) ----- */
  const cdHousesCard = cd => CE.cdHousesCard(cd);


  /* ---------- the campus home page, inside the portal ---------- */
  async function campusPage() {
    CE.title("Campus"); page.innerHTML = "";
    const vid = h("video", { class: "loop-bg", src: CE.root + "assets/art/hero-loop.mp4", poster: CE.root + "assets/art/signin-bg.jpg", loop: true, playsinline: true, "aria-hidden": "true" }); vid.muted = true; vid.autoplay = true; if (matchMedia("(prefers-reduced-motion: reduce)").matches) vid.remove(); else setTimeout(() => vid.play().catch(() => {}), 50);
    page.append(h("div", { class: "campus-head" }, vid, h("div", {}, h("h2", {}, "The campus"), h("p", { class: "sm" }, "The public home page, right here. You stay signed in.")), h("a", { class: "btn ghost sm", style: { color: "#fff", borderColor: "#fff" }, href: CE.root + "index.html" }, "Open the public site")));
    const root = h("div", { id: "campus" }); page.append(root);
    await CE.campus(root, { portal: "teacher", inPortal: true });
  }
  /* ---------- campus hub (v2.6): student voice, campus insights, display mode ---------- */
  async function voiceAdmin() {
    CE.title("Student Voice"); CE.loading(page);
    try {
      const r = await CE.capi("ed_s_voice"); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      page.append(h("div", { class: "page-lead" }, h("div", {}, h("h2", {}, "Student Voice"), h("div", { class: "sm mut" }, "Ideas from students, most backed first. Reply, mark what is planned or done, or close one."))));
      if (!r.rows.length) return page.append(h("div", { class: "empty" }, "No ideas yet."));
      page.append(h("div", { class: "stack" }, ...r.rows.map(v => {
        const sel = h("select", { class: "in", style: { width: "auto" } }, ...["open", "planned", "done", "closed"].map(s => h("option", { value: s, selected: s === v.status }, s[0].toUpperCase() + s.slice(1))));
        const rep = h("textarea", { class: "in", rows: "2", maxlength: "400", placeholder: "Reply to the students (optional)" }, v.reply);
        return h("div", { class: "card voice" }, h("div", { class: "row between" }, h("span", { class: "badge cyan" }, "▲ " + v.votes), h("span", { class: "xs mut" }, v.name + " · " + D.ago(v.created))), h("h4", { style: { margin: "8px 0 4px" } }, v.title), v.body ? h("p", { class: "sm mut", style: { margin: 0 } }, v.body) : null,
          h("div", { class: "row", style: { marginTop: "10px", alignItems: "flex-start", flexWrap: "wrap" } }, sel, h("div", { class: "grow" }, rep)),
          h("div", { class: "row" }, h("button", { class: "btn sm cyan", onclick: async () => { const x = await CE.capi("ed_t_voice_set", { p_id: v.id, p_status: sel.value, p_reply: rep.value }); CE.toast(x.ok ? "Saved." : CE.errText(x)); } }, "Save"), h("button", { class: "btn sm ghost", onclick: async () => { if (!(await CE.confirm("Delete this idea?", "Delete"))) return; const x = await CE.capi("ed_t_voice_del", { p_id: v.id }); if (x.ok) voiceAdmin(); } }, "Delete"))); })));
    } catch (e) { CE.fail(page, e); }
  }
  async function insights() {
    CE.title("Campus Insights"); CE.loading(page);
    try {
      const [r, b] = await Promise.all([CE.capi("ed_t_insights"), CE.capi("ed_board").catch(() => ({ ok: false }))]); if (!r.ok) return CE.fail(page, r);
      page.innerHTML = "";
      const stat = (n, l) => h("div", { class: "card stat" }, h("span", { class: "n" }, n), h("span", { class: "l" }, l));
      const bars = (rows, label, val, cls) => { const top = Math.max(1, ...rows.map(val)); return rows.length ? h("div", { class: "stack" }, ...rows.map(x => h("div", {}, h("div", { class: "row between sm" }, h("span", {}, label(x)), h("span", { class: "mut" }, val(x))), h("div", { class: "bar" + (cls ? " " + cls(x) : "") }, h("i", { style: { width: Math.round(100 * val(x) / top) + "%" } }))))) : h("div", { class: "empty" }, "Nothing yet."); };
      page.append(h("div", { class: "page-lead" }, h("div", {}, h("h2", {}, "Campus Insights"), h("div", { class: "sm mut" }, "Who is taking part, and in what. The numbers come from the campus itself; nothing extra is tracked."))));
      page.append(h("div", { class: "grid g4" }, stat(r.students, "students"), stat(r.active_week, "active this week"), stat(r.active_month, "active this month"), stat(r.done_week, "activities done this week"), stat(r.lessons_week, "lessons completed this week"), stat(r.quizzes_week, "quiz attempts this week"), stat(r.subs_week, "hand-ins this week"), stat(r.voice_open, "open student ideas")));
      const g = h("div", { class: "grid g2" }); page.append(g);
      g.append(card("Activities completed, last 8 weeks", bars(r.weeks, w => "w/c " + D.short(w.week), w => w.n)));
      g.append(card("Completions by category", bars(r.cats, c => c.name, c => c.n)));
      g.append(card("Competition entries", r.comps.length ? h("div", { class: "list" }, ...r.comps.map(c => h("div", { class: "item" }, h("span", { class: "badge" }, c.kind), h("div", { class: "grow" }, h("div", { class: "t sm" }, c.title), h("div", { class: "s xs" }, (new Date(c.closes) > Date.now() ? "closes " : "closed ") + D.short(c.closes))), h("b", {}, c.entries)))) : h("div", { class: "empty" }, "No competitions yet.")));
      g.append(card("House points", bars(r.houses, x => (b.ok && b.houses[x.house]) || x.house, x => x.pts, x => "house-" + x.house)));
      g.append(card("Clubs", bars(r.clubs, c => c.title + " · " + c.members + "/" + c.capacity, c => c.members)));
    } catch (e) { CE.fail(page, e); }
  }
  async function display() {
    CE.title("Display mode"); page.innerHTML = ""; document.body.classList.add("display");
    const stage = h("div", { class: "stage" }, h("video", { class: "loop-bg", src: CE.root + "assets/art/hero-loop.mp4", poster: CE.root + "assets/art/signin-bg.jpg", muted: "", autoplay: "", loop: "", playsinline: "" }));
    const clock = h("div", { class: "clock" }), body = h("div", { class: "stage-body" }), dots = h("div", { class: "dots" });
    stage.append(h("div", { class: "stage-head" }, h("div", { class: "row" }, h("img", { src: CE.root + "assets/logo-white.svg", alt: "" }), h("b", {}, me.school || "Compass Ed")), clock), body, dots,
      h("div", { class: "stage-tools" }, h("button", { class: "btn sm ghost", onclick: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}) }, "Full screen"), h("a", { class: "btn sm ghost", href: "#/" }, "Exit")));
    page.append(stage);
    const time = () => { clock.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }; time();
    let panels = [], i = 0;
    const show = () => { if (!panels.length) return; i %= panels.length; body.classList.remove("in"); body.innerHTML = ""; body.append(h("h2", {}, panels[i][0]), panels[i][1]); requestAnimationFrame(() => body.classList.add("in")); CE.$$("i", dots).forEach((d, k) => d.classList.toggle("on", k === i)); };
    const build = async () => {
      const [p, b] = await Promise.all([CE.api("ed_public"), CE.capi("ed_board").catch(() => ({ ok: false }))]); if (!p.ok) return;
      const list = (rows, f) => rows.length ? h("div", { class: "stage-list" }, ...rows.map(f)) : h("div", { class: "stage-empty" }, "Nothing here yet");
      panels = [["Coming up", list((p.events || []).slice(0, 6), e => h("div", { class: "it" }, h("b", {}, D.dt(e.starts)), h("span", {}, e.title + (e.place ? " · " + e.place : ""))))],
        ["Open competitions", list((p.competitions || []).slice(0, 6), c => h("div", { class: "it" }, h("b", {}, D.left(c.closes)), h("span", {}, c.title)))],
        ["News", list((p.news || []).slice(0, 3), n => h("div", { class: "it" }, h("b", {}, n.title), h("span", {}, n.body.replace(/\*\*/g, ""))))],
        b.ok ? ["House points", h("div", { class: "stage-houses" }, ...b.house.map(x => h("div", { class: "hs house-" + x.house }, h("span", { class: "n" }, x.pts.toLocaleString()), h("span", {}, b.houses[x.house] || x.house))))] : null,
        ["Clubs this week", list((p.clubs || []).slice(0, 6), c => h("div", { class: "it" }, h("b", {}, c.day + " " + c.time), h("span", {}, c.title)))]].filter(Boolean);
      dots.innerHTML = ""; panels.forEach(() => dots.append(h("i", {}))); show();
    };
    const t1 = setInterval(time, 1000), t2 = setInterval(() => { i++; show(); }, 12000), t3 = setInterval(build, 300000);
    addEventListener("hashchange", () => { document.body.classList.remove("display"); [t1, t2, t3].forEach(clearInterval); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }, { once: true });
    await build();
  }

  const GROUPS = [
    [["Campus Hub", "#/campus"], ["Student Voice", "#/voice"], ["Insights", "#/insights"], ["Display mode", "#/display"]],
    [["Activities", "#/activities"], ["Competitions", "#/competitions", /^#\/competition/], ["Clubs", "#/clubs"], ["News", "#/news"]],
    [["Lessons & quizzes", "#/content", /^#\/content/], ["Playlists", "#/playlists"], ["Rubrics", "#/rubrics"], ["Question bank", "#/bank"]],
    [["Announcements", "#/announcements"], ["Calendar", "#/calendar"]],
    [["People & classes", "#/people", /^#\/people/], ["House points", "#/points"]],
    [["Overview", "#/admin"], ["Login codes", "#/admin/codes"], ["Feedback", "#/admin/feedback"], ["Calendar feeds", "#/admin/feeds"], ["Links & integrations", "#/admin/links"]],
    [["Classes", "#/classes", /^#\/class/]], [["Assignments", "#/assignments", /^#\/assignment/]]
  ];
  const setSub = () => { const cur = (location.hash || "#/").split("?")[0]; const g = GROUPS.find(gr => gr.some(([l, hsh, m]) => m ? m.test(cur) : cur === hsh)); CE.subnav(g && g.length > 1 ? g : []); };
  addEventListener("hashchange", setSub); setSub();
  CE.markNav = () => { const cur = (location.hash || "#/").split("?")[0]; const g = GROUPS.find(gr => gr.some(([l, hsh, m]) => m ? m.test(cur) : cur === hsh)); const first = g ? g[0][1] : cur; CE.$$("#side a.nl").forEach(a => a.classList.toggle("on", a.getAttribute("href") === first || a.getAttribute("href") === cur)); };
  CE.router([
    { path: "/points", handler: points }, { path: "/clubs", handler: clubs }, { path: "/bank", handler: bank }, { path: "/search", handler: search },
    { path: "/voice", handler: voiceAdmin }, { path: "/insights", handler: insights }, { path: "/display", handler: display },
    { path: "/", handler: dashboard }, { path: "/campus", handler: campusPage }, { path: "/activities", handler: activities }, { path: "/competitions", handler: competitions }, { path: "/competition/:id", handler: compPage }, { path: "/news", handler: news },
    { path: "/classes", handler: classes }, { path: "/class/:id", handler: p => classPage(p) }, { path: "/class/:id/:tab", handler: p => classPage(p, p.tab) },
    { path: "/content", handler: content }, { path: "/content/:subj", handler: content }, { path: "/playlists", handler: playlists }, { path: "/rubrics", handler: rubrics },
    { path: "/assignments", handler: assignments }, { path: "/assignment/:id", handler: assignmentPage },
    { path: "/announcements", handler: announcements }, { path: "/calendar", handler: calendar }, { path: "/people", handler: people }, { path: "/people/:tab", handler: people }, { path: "/settings", handler: settings }, { path: "/admin", handler: admin }, { path: "/admin/:tab", handler: admin }
  ]);
  loadBell();
})();
