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
    const slipBox = h("div", { class: "stack" }); page.append(slipBox); slips(slipBox);   /* the one thing this page can do: sign a permission slip */
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
    page.append(h("p", { class: "xs mut" }, "This page shows only what is listed above. The only thing it can change is your answer to a permission slip. Your child can make a new link at any time, which stops this one working."));
  } catch (e) { CE.fail(page, e); }

  /* Permission slips (compassed-v2.9-features.sql): read the details, answer yes or no, sign with your name */
  async function slips(box) {
    let r; try { r = await CE.api("ed_s_parent_slips", { p_tok: tok }); } catch (e) { return; }   // older database: no slips yet
    if (!r || !r.ok || !r.rows.length) return;
    box.innerHTML = ""; box.append(h("h2", { style: { margin: "8px 0 0" } }, "Permission slips"));
    r.rows.forEach(x => box.append(slipCard(x)));
  }
  function slipCard(x) {
    const c = h("div", { class: "card slip" + (x.open && x.answer == null ? " tint" : "") }), due = D.short(x.due + "T12:00:00");
    const head = () => [h("div", { class: "hd" }, h("h3", {}, x.title), x.answer === true ? h("span", { class: "badge ok" }, "Permission given") : x.answer === false ? h("span", { class: "badge bad" }, "Permission not given") : h("span", { class: x.open ? "badge warn" : "badge" }, x.open ? "Please sign by " + due : "Closed")),
      x.event ? h("div", { class: "sm mut" }, x.event.title + " · " + D.dt(x.event.starts) + (x.event.place ? " · " + x.event.place : "")) : null, x.body ? h("div", { html: CE.rich(x.body) }) : null];
    const signed = () => { c.className = "card slip"; c.replaceChildren(...head().filter(Boolean), h("div", { class: "sm" }, "Signed by " + x.signer + (x.relation ? " (" + x.relation + ")" : "") + " · " + D.dt(x.signed_at)),
      x.note ? h("div", { class: "sm mut" }, (x.question || "Note") + ": " + x.note) : null, x.open ? h("button", { class: "btn sm ghost", onclick: form }, "Change answer") : null); };
    function form() {
      const nm = "ans" + x.id, yes = h("input", { type: "radio", name: nm, value: "yes", checked: x.answer !== false }), no = h("input", { type: "radio", name: nm, value: "no", checked: x.answer === false });
      const who = h("input", { class: "in", maxlength: 80, autocomplete: "name", value: x.signer || "" }), rel = h("input", { class: "in", maxlength: 40, list: "relations", value: x.relation || "", placeholder: "e.g. Mother, Father, Carer" });
      const note = h("textarea", { class: "in", rows: 2, maxlength: 500 }, x.note || ""), er = h("div", { class: "err", role: "alert" });
      const send = async e => { e.preventDefault(); er.textContent = ""; if (who.value.trim().length < 2) return er.textContent = "Type your full name to sign.";
        const b = e.submitter || e.target.querySelector("button[type=submit]"); if (b) b.disabled = true;
        let res; try { res = await CE.api("ed_s_parent_slip_sign", { p_tok: tok, p_slip: x.id, p_answer: yes.checked, p_signer: who.value.trim(), p_relation: rel.value.trim(), p_note: note.value.trim() }); } catch (z) { res = { ok: false, error: "network" }; }
        if (b) b.disabled = false;
        if (!res.ok) return er.textContent = res.error === "closed" ? "The sign-by date has passed. Please contact the school." : res.error === "network" ? "Could not reach the school. Check your connection and try again." : CE.errText(res);
        Object.assign(x, { answer: yes.checked, signer: who.value.trim(), relation: rel.value.trim(), note: note.value.trim(), signed_at: new Date().toISOString() }); CE.toast("Thank you. Your answer has been sent to the school.", "ok"); signed(); };
      c.replaceChildren(...head().filter(Boolean), h("form", { class: "stack", onsubmit: send },
        h("fieldset", { class: "choice" }, h("legend", { class: "b" }, "Your answer"), h("label", { class: "chk" }, yes, "Yes, I give permission"), h("label", { class: "chk" }, no, "No, I do not give permission")),
        h("div", { class: "grid g2" }, h("label", { class: "f" }, "Your full name", who), h("label", { class: "f" }, "Relationship to the student", rel)),
        h("label", { class: "f" }, x.question || "Anything the school should know? (optional)", note),
        h("datalist", { id: "relations" }, ...["Mother", "Father", "Parent", "Carer", "Guardian"].map(v => h("option", { value: CE.t(v) }))), er,
        h("div", { class: "row" }, h("button", { class: "btn cyan", type: "submit" }, "Sign"), x.answer != null ? h("button", { class: "btn ghost", type: "button", onclick: signed }, "Cancel") : null),
        h("p", { class: "xs mut", style: { margin: 0 } }, "Typing your name here counts as your signature. The school sees your answer, name, relationship and note.")));
    }
    if (x.answer != null) signed(); else if (x.open) form(); else c.replaceChildren(...head().filter(Boolean));
    return c;
  }
})();
