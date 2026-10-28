/* Public pages: menu, year, signed-in shortcut, and the live campus data on the home page. */
(function () {
  const b = document.querySelector("[data-burger]"), n = document.getElementById("pubnav");
  if (b && n) b.addEventListener("click", () => n.classList.toggle("open"));
  const y = document.getElementById("yr"); if (y) y.textContent = new Date().getFullYear();
  const s = CE.auth && CE.auth.get();
  const cta = document.querySelector(".nav .cta");
  if (cta && s && s.me) { cta.innerHTML = ""; cta.append(CE.h("a", { class: "btn cyan", href: s.me.role === "student" ? "student/" : "teacher/" }, s.me.role === "student" ? "Open my campus" : "Open staff portal")); }

  const catGrid = document.getElementById("catGrid"); if (!catGrid) return;
  const h = CE.h, D = CE.date, portal = s && s.me ? s.me.role : null;
  const link = (studentHash) => portal === "student" ? "student/" + studentHash : "signin.html";
  CE.api("ed_public").then(r => {
    if (!r.ok) throw r;
    const sn = document.getElementById("schoolName"); if (sn && r.school) sn.textContent = r.school === "CompassED" ? "Campus" : r.school + " campus";
    let age = "all";
    const drawAge = () => {
      catGrid.innerHTML = "";
      r.categories.forEach(c => { const n = age === "under11" ? (c.n_u11 ?? c.n) : age === "11plus" ? (c.n_11 ?? c.n) : c.n; catGrid.append(h("a", { class: "subj pat", style: { "--pat": "url(assets/art/pat-" + (CE.PAT[c.id] || "hub") + ".svg)" }, href: link("#/explore/" + c.id) }, h("div", { class: "row between" }, h("div", { class: "ico" }, CE.icon(c.icon)), h("span", { class: "badge" }, n + (n === 1 ? " activity" : " activities"))), h("h3", { style: { margin: 0 } }, c.name), h("div", { class: "sm mut" }, c.blurb))); });
      const cg = document.getElementById("compGrid"); cg.innerHTML = "";
      const comps = r.competitions.filter(c => age === "all" || !c.ages || c.ages === "all" || c.ages === age);
      if (!comps.length) cg.append(h("div", { class: "empty" }, "Nothing open right now. Check back soon."));
      comps.forEach(c => cg.append(h("a", { class: "card feat", href: link("#/competition/" + c.id), style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "row between" }, h("span", { class: "badge " + (c.kind === "tournament" ? "ink" : "cyan") }, c.kind), h("span", { class: "xs mut" }, D.left(c.closes))), h("h4", {}, c.title), h("p", { class: "sm mut" }, c.blurb), c.ages && c.ages !== "all" ? h("span", { class: "badge" }, c.ages === "11plus" ? "11 and over" : "Under 11") : null)));
      const clg = document.getElementById("clubGrid"); if (clg) { clg.innerHTML = ""; const cl = (r.clubs || []).filter(c => age === "all" || c.ages === "all" || c.ages === age); if (!cl.length) clg.append(h("div", { class: "empty" }, "No clubs listed yet.")); cl.forEach(c => clg.append(h("a", { class: "card feat", href: link("#/clubs"), style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "ico" }, CE.icon("users")), h("h4", {}, c.title), h("p", { class: "sm mut", style: { margin: 0 } }, c.day + " · " + c.time)))); }
    };
    document.querySelectorAll("#ageSeg button").forEach(b => b.onclick = () => { age = b.dataset.age; document.querySelectorAll("#ageSeg button").forEach(x => x.classList.toggle("on", x === b)); drawAge(); });
    drawAge();
    const gg = document.getElementById("galleryGrid"); if (gg) { gg.innerHTML = ""; const gal = r.gallery || []; if (!gal.length) gg.append(h("div", { class: "empty", style: { gridColumn: "1 / -1" } }, "Winners appear here once competitions close.")); gal.forEach(g => { const img = (g.links || []).find(l => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(l) || /\/uploads\//.test(l)); gg.append(h("div", { class: "g" }, img ? h("img", { src: img, alt: "", loading: "lazy" }) : h("div", { style: { aspectRatio: "4/3", display: "grid", placeItems: "center", background: "var(--bg3)" } }, CE.icon("medal")), h("div", { class: "b" }, h("div", { class: "row between" }, h("span", { class: "badge cyan" }, ["", "1st", "2nd", "3rd"][g.place] || g.place + "th"), h("span", { class: "xs mut" }, g.comp)), h("div", { class: "b sm", style: { marginTop: "6px" } }, g.name), h("div", { class: "xs mut" }, g.body)))); }); }
    const el = document.getElementById("eventList"); el.innerHTML = "";
    if (!r.events.length) el.append(h("div", { class: "empty" }, "No whole-school events in the next two months."));
    r.events.slice(0, 6).forEach(e => el.append(h("div", { class: "item" }, h("div", { class: "ico sm" }, CE.icon({ exam: "exam", trip: "bus", competition: "trophy" }[e.kind] || "calendar")), h("div", { class: "grow" }, h("div", { class: "t" }, e.title), h("div", { class: "s" }, D.dt(e.starts) + (e.place ? " · " + e.place : ""))))));
    const nl = document.getElementById("newsList"); nl.innerHTML = "";
    if (!r.news.length) nl.append(h("div", { class: "empty" }, "No news yet."));
    r.news.slice(0, 3).forEach(x => nl.append(h("a", { class: "card", href: link("#/news"), style: { textDecoration: "none", color: "inherit" } }, x.featured ? h("span", { class: "badge cyan" }, "Featured") : null, h("h4", { style: { marginTop: "6px" } }, x.title), h("p", { class: "sm mut", style: { margin: 0 } }, x.body.replace(/\*\*/g, "").slice(0, 160) + (x.body.length > 160 ? "…" : "")), h("div", { class: "xs mut", style: { marginTop: "8px" } }, D.ago(x.created)))));
  }).catch(e => {
    catGrid.innerHTML = ""; catGrid.append(h("div", { class: "empty", style: { gridColumn: "1 / -1" } }, CE.errText(e)));
    ["compGrid", "eventList", "newsList"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  });
})();
