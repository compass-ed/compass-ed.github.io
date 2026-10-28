/* The campus home page as one reusable renderer. Used by index.html (public) and by both portals (#/campus),
   so a signed-in student or teacher browses the same home page without leaving their session. */
(function () {
  const h = CE.h, D = CE.date;

  /* CE.campus(root, opts) draws the full home page into root.
     opts.portal: "student" | "teacher" | null (public). opts.inPortal: true when drawn inside a portal shell. */
  CE.campus = async function (root, opts) {
    opts = opts || {}; const portal = opts.portal || null, inPortal = !!opts.inPortal, pre = inPortal ? CE.root : "";
    const link = (studentHash, teacherHash) => portal === "student" ? (inPortal ? studentHash : "student/" + studentHash) : portal === "teacher" ? (inPortal ? (teacherHash || "#/activities") : "teacher/" + (teacherHash || "#/activities")) : "signin.html";
    root.innerHTML = "";
    const sec = (id, kicker, title, lead, extra) => { const s = h("section", { class: "csec reveal", id }, h("div", { class: "sec-head" }, h("div", {}, kicker ? h("div", { class: "kicker" }, kicker) : null, h("h2", { style: { margin: 0 } }, title), lead ? h("p", { class: "mut sm", style: { margin: "6px 0 0" } }, lead) : null), extra || null)); root.append(s); return s; };
    const skel = h("div", { class: "grid g4" }, ...[1, 2, 3, 4].map(() => h("div", { class: "card stack" }, h("div", { class: "skel", style: { width: "40%" } }), h("div", { class: "skel" })))); root.append(skel);
    let r;
    try { r = await CE.api("ed_public"); if (!r.ok) throw r; } catch (e) { root.innerHTML = ""; root.append(h("div", { class: "empty" }, CE.errText(e))); return; }
    root.innerHTML = "";
    const counts = { acts: r.categories.reduce((n, c) => n + (c.n || 0), 0), comps: r.competitions.length, clubs: (r.clubs || []).length, events: r.events.length };
    if (!inPortal) root.append(h("div", { class: "stat-strip reveal" }, ...[[counts.acts, "activities to explore"], [counts.comps, "open competitions"], [counts.clubs, "ECA clubs"], [counts.events, "events coming up"]].map(([n, l]) => h("div", { class: "card stat sm" }, h("span", { class: "n" }, n), h("span", { class: "l" }, l)))));

    /* categories + age filter */
    let age = "all";
    const seg = h("div", { class: "seg", id: "ageSeg" }, ...[["all", "All ages"], ["under11", "Under 11"], ["11plus", "11 and over"]].map(([k, l]) => h("button", { class: k === "all" ? "on" : "", onclick: e => { age = k; CE.$$("button", seg).forEach(x => x.classList.toggle("on", x === e.target)); drawAge(); } }, l)));
    const catGrid = h("div", { class: "grid g4", id: "catGrid" }); sec("explore", "Explore", "Pick a category", null, seg).append(catGrid);
    const compGrid = h("div", { class: "grid g3", id: "compGrid" }); sec("competitions", "Competitions, challenges & tournaments", "Open for entries").append(compGrid);
    const drawAge = () => {
      catGrid.innerHTML = "";
      r.categories.forEach(c => { const n = age === "under11" ? (c.n_u11 ?? c.n) : age === "11plus" ? (c.n_11 ?? c.n) : c.n; catGrid.append(h("a", { class: "subj pat lift", style: { "--pat": "url(" + pre + "assets/art/pat-" + (CE.PAT[c.id] || "hub") + ".svg)" }, href: link("#/explore/" + c.id, "#/activities") }, h("div", { class: "row between" }, h("div", { class: "ico" }, CE.icon(c.icon)), h("span", { class: "badge" }, n + (n === 1 ? " activity" : " activities"))), h("h3", { style: { margin: 0 } }, c.name), h("div", { class: "sm mut" }, c.blurb))); });
      compGrid.innerHTML = "";
      const comps = r.competitions.filter(c => age === "all" || !c.ages || c.ages === "all" || c.ages === age);
      if (!comps.length) compGrid.append(CE.emptyArt("trophy", "Nothing open right now", "Check back soon."));
      comps.forEach(c => compGrid.append(h("a", { class: "card feat lift", href: link("#/competition/" + c.id, "#/competition/" + c.id), style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "row between" }, h("span", { class: "badge " + (c.kind === "tournament" ? "ink" : "cyan") }, c.kind), h("span", { class: "xs mut" }, D.left(c.closes))), h("h4", {}, c.title), h("p", { class: "sm mut" }, c.blurb), c.ages && c.ages !== "all" ? h("span", { class: "badge" }, c.ages === "11plus" ? "11 and over" : "Under 11") : null)));
      clubGrid.innerHTML = "";
      const cl = (r.clubs || []).filter(c => age === "all" || c.ages === "all" || c.ages === age);
      if (!cl.length) clubGrid.append(CE.emptyArt("sprout", "No clubs listed yet", "Staff add ECA clubs under Campus > Clubs."));
      cl.forEach(c => clubGrid.append(h("a", { class: "card feat lift", href: link("#/clubs", "#/clubs"), style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "ico" }, CE.icon("users")), h("h4", {}, c.title), h("p", { class: "sm mut", style: { margin: 0 } }, c.day + " · " + c.time + (c.place ? " · " + c.place : "")))));
    };

    /* calendar + news side by side */
    const two = h("div", { class: "grid g2 reveal", style: { alignItems: "start" } }); root.append(two);
    const el = h("div", { class: "list" }), nl = h("div", { class: "stack" });
    two.append(h("div", {}, h("div", { class: "kicker" }, "Calendar"), h("h2", { style: { margin: "0 0 6px" } }, "Coming up across the school"), h("p", { class: "mut sm" }, "Whole-school events, trips and competition deadlines." + (portal ? "" : " Sign in to see your class's dates and add them to your phone.")), el),
      h("div", {}, h("div", { class: "kicker" }, "News"), h("h2", { style: { margin: "0 0 6px" } }, "Latest from campus"), h("p", { class: "mut sm" }, "Posts and the student newsletter."), nl));
    if (!r.events.length) el.append(CE.emptyArt("inbox", "No whole-school events yet", "Staff add them under Notices > Calendar."));
    r.events.slice(0, 6).forEach(e => el.append(h(portal ? "a" : "div", { class: "item", href: portal ? link("#/calendar", "#/calendar") : null }, h("div", { class: "ico sm" }, CE.icon({ exam: "exam", trip: "bus", competition: "trophy" }[e.kind] || "calendar")), h("div", { class: "grow" }, h("div", { class: "t" }, e.title), h("div", { class: "s" }, D.dt(e.starts) + (e.place ? " · " + e.place : ""))))));
    if (!r.news.length) nl.append(CE.emptyArt("inbox", "No news yet", "Staff post news under Campus > News."));
    r.news.slice(0, 3).forEach(x => nl.append(h("a", { class: "card lift", href: link("#/news", "#/news"), style: { textDecoration: "none", color: "inherit" } }, x.featured ? h("span", { class: "badge cyan" }, "Featured") : null, h("h4", { style: { marginTop: "6px" } }, x.title), h("p", { class: "sm mut", style: { margin: 0 } }, x.body.replace(/\*\*/g, "").slice(0, 160) + (x.body.length > 160 ? "…" : "")), h("div", { class: "xs mut", style: { marginTop: "8px" } }, D.ago(x.created)))));

    /* links */
    const linkSec = sec("links", "Connected", "Other school services", "Shortcuts your school has added. Compass Dash and Compass Ed share one database, so house points and announcements line up."); linkSec.classList.add("hide");
    CE.api("ed_links").then(l => { if (!l.ok || !(l.links || []).length) return; linkSec.append(CE.linkTiles(l.links)); linkSec.classList.remove("hide"); }).catch(() => {});

    /* gallery */
    const gal = r.gallery || [], gg = h("div", { class: "gallery" });
    sec("gallery", "Gallery", "Recent winners", "Entries from closed competitions, shown with the student's permission.").append(gg);
    if (!gal.length) gg.append(CE.emptyArt("trophy", "Winners appear here once competitions close"));
    gal.slice(0, 8).forEach(g => { const img = (g.links || []).find(l => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(l) || /\/uploads\//.test(l)); gg.append(h("div", { class: "g lift" }, img ? h("img", { src: img, alt: "", loading: "lazy" }) : h("div", { class: "ph" }, CE.icon("medal")), h("div", { class: "b" }, h("div", { class: "row between" }, h("span", { class: "badge cyan" }, ["", "1st", "2nd", "3rd"][g.place] || g.place + "th"), h("span", { class: "xs mut" }, g.comp)), h("div", { class: "b sm", style: { marginTop: "6px" } }, g.name), h("div", { class: "xs mut" }, g.body)))); });

    /* clubs */
    const clubGrid = h("div", { class: "grid g4", id: "clubGrid" }); sec("clubs", "Clubs", "ECA and after school", "Extra-curricular activities, with sign-up in the student portal.").append(clubGrid);
    drawAge();
    CE.reveal(root);
    return r;
  };

  /* scroll reveal: elements with .reveal fade up when they enter the viewport (no-op when motion is reduced) */
  CE.reveal = root => {
    const els = CE.$$(".reveal", root || document); if (!els.length) return;
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) { els.forEach(e => e.classList.add("in")); return; }
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(e => io.observe(e));
    /* safety net: nothing stays hidden for long (background tabs, odd scroll containers) */
    setTimeout(() => els.forEach(e => e.classList.add("in")), 2500);
    document.addEventListener("visibilitychange", () => { if (document.hidden) els.forEach(e => e.classList.add("in")); }, { once: true });
  };
})();
