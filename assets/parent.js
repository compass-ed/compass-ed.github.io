/* Parent summary: a read-only weekly digest opened from a private link the student makes in Settings. */
(async function () {
  const h = CE.h, D = CE.date, page = CE.$("#page");
  const tok = new URLSearchParams(location.search).get("t") || "";
  CE.loading(page);
  try {
    const r = await CE.api("ed_parent", { p_tok: tok });
    if (!r.ok) { page.innerHTML = ""; return page.append(h("div", { class: "empty" }, h("div", { class: "big" }, CE.icon("key")), h("div", { class: "b" }, "This link is not valid"), h("div", { class: "sm" }, "Ask your child to make a new link from Settings in Compass Ed."))); }
    page.innerHTML = "";
    const card = (t, b) => h("div", { class: "card" }, h("h3", {}, t), b);
    page.append(h("div", {}, h("div", { class: "kicker" }, r.school + " · weekly summary"), h("h1", { style: { fontSize: "32px" } }, r.name), h("div", { class: "mut" }, [r.class, r.year ? "Year " + r.year : null, r.house ? "House " + r.house : null].filter(Boolean).join(" · ") + " · as of " + D.long(new Date()))));
    page.append(h("div", { class: "grid g4" },
      h("div", { class: "card stat" }, h("span", { class: "n" }, r.week.lessons), h("span", { class: "l" }, "Lessons this week")),
      h("div", { class: "card stat" }, h("span", { class: "n" }, r.week.activities), h("span", { class: "l" }, "Activities this week")),
      h("div", { class: "card stat" }, h("span", { class: "n" }, r.week.quizzes), h("span", { class: "l" }, "Quizzes this week")),
      h("div", { class: "card stat" }, h("span", { class: "n" }, r.pts_week + " / " + r.pts), h("span", { class: "l" }, "House points (week / total)"))));
    const st = s => ({ todo: ["badge", "Not started"], draft: ["badge warn", "Draft"], submitted: ["badge cyan", "Handed in"], returned: ["badge ok", "Returned"] }[s] || ["badge", s]);
    page.append(card("Work due", r.due.length ? h("div", { class: "list" }, ...r.due.map(a => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", { class: "t" }, a.title), h("div", { class: "s" }, a.subj + " · due " + D.dt(a.due))), h("span", { class: st(a.status)[0] }, st(a.status)[1])))) : h("div", { class: "empty" }, "Nothing due in the next two weeks.")));
    page.append(card("Marked recently", r.returned.length ? h("div", { class: "list" }, ...r.returned.map(a => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", { class: "t" }, a.title), h("div", { class: "s" }, (a.feedback || "No written feedback") + " · " + D.short(a.at))), h("span", { class: "badge ok" }, a.score != null ? a.score + "%" : "Marked")))) : h("div", { class: "empty" }, "Nothing marked in the last two weeks.")));
    const g = h("div", { class: "grid g2" }); page.append(g);
    g.append(card("Coming up", r.events.length ? h("div", { class: "list" }, ...r.events.map(e => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", { class: "t sm" }, e.title), h("div", { class: "s xs" }, D.dt(e.starts) + (e.place ? " · " + e.place : "")))))) : h("div", { class: "empty" }, "No events in the next two weeks.")));
    g.append(card("Clubs", r.clubs.length ? h("div", { class: "list" }, ...r.clubs.map(c => h("div", { class: "item" }, h("div", { class: "grow" }, h("div", { class: "t sm" }, c.title), h("div", { class: "s xs" }, c.day + " " + c.time))))) : h("div", { class: "empty" }, "Not signed up to any clubs.")));
    page.append(h("p", { class: "xs mut" }, "This page shows only what is listed above. It cannot change anything. Your child can make a new link at any time, which stops this one working."));
  } catch (e) { CE.fail(page, e); }
})();
