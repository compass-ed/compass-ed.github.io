/* Sign-in, login codes and account creation. */
(function () {
  const $ = CE.$, qs = new URLSearchParams(location.search);
  const SUBJ = [["Maths"], ["English"], ["Science"], ["Geography"], ["History"], ["Computing"], ["Art & Design"], ["Music"], ["Languages"], ["PE & Wellbeing"], ["Drama"]];
  SUBJ.forEach((s, i) => $("#uSubj").append(CE.h("option", { value: i }, s[0])));
  const tabs = { in: [$("#tabIn"), $("#fIn")], code: [$("#tabCode"), $("#fCode")], up: [$("#tabUp"), $("#fUp")] };
  const show = k => { Object.entries(tabs).forEach(([n, [t, f]]) => { t.classList.toggle("on", n === k); f.classList.toggle("hide", n !== k); }); if (k === "code") $("#cCode").focus(); };
  $("#tabIn").onclick = () => show("in"); $("#tabCode").onclick = () => show("code"); $("#tabUp").onclick = () => show("up");
  $("#toCode").onclick = $("#toCode2").onclick = e => { e.preventDefault(); show("code"); };
  show(qs.get("signup") === "1" ? "up" : qs.get("code") != null ? "code" : "in");
  if (qs.get("code")) $("#cCode").value = fmt(qs.get("code"));
  let role = qs.get("role") === "teacher" ? "teacher" : "student";
  const setRole = r => { role = r; $("#roleS").classList.toggle("on", r === "student"); $("#roleT").classList.toggle("on", r === "teacher"); $("#studentFields").classList.toggle("hide", r !== "student"); $("#teacherFields").classList.toggle("hide", r !== "teacher"); $("#codeLabel").textContent = r === "student" ? "School join code" : "Teacher invite code"; $("#uCode").placeholder = r === "student" ? "e.g. COMPASS-2026" : "e.g. TEACH-2026"; };
  $("#roleS").onclick = () => setRole("student"); $("#roleT").onclick = () => setRole("teacher"); setRole(role);

  const s = CE.auth.get();
  if (s && s.me) location.replace(s.me.role === "student" ? "student/" : "teacher/");

  if (CE.demo && window.CE_DEMO) {
    const a = window.CE_DEMO.accounts, box = $("#demoAccounts");
    const link = (u, p) => CE.h("a", { href: "#", style: { color: "#4cc4cf" }, onclick: e => { e.preventDefault(); show("in"); $("#iUser").value = u; $("#iPw").value = p; } }, u);
    const code = c => CE.h("a", { href: "#", style: { color: "#4cc4cf", fontFamily: "var(--mono)" }, onclick: e => { e.preventDefault(); show("code"); $("#cCode").value = c; $("#cCode").dispatchEvent(new Event("input")); } }, c);
    box.append(CE.h("div", { class: "card", style: { background: "rgba(0,0,0,.55)", backdropFilter: "blur(8px)", borderColor: "#2a2a2a", color: "#fff" } },
      CE.h("div", { class: "kicker" }, "Preview accounts"),
      CE.h("div", { class: "sm" }, "Students: ", ...a.students.flatMap(([u, p], i) => [i ? " · " : "", link(u, p)])),
      CE.h("div", { class: "sm", style: { marginTop: "6px" } }, "Staff: ", ...a.staff.flatMap(([u, p], i) => [i ? " · " : "", link(u, p)])),
      CE.h("div", { class: "sm", style: { marginTop: "6px" } }, "Codes: new student ", code("4821-0937"), " · Alice ", code("7731-2046"), " · Finn's reset ", code("5540-7312"), " · revoked ", code("1193-8820")),
      CE.h("div", { class: "xs mut", style: { marginTop: "8px" } }, "Join code " + a.join + " · invite code " + a.invite + ". Preview mode keeps a sample campus in this browser; add ?demo=0 to turn it off.")));
  }

  const go = (r) => { CE.auth.set(r.tok, r.me); const next = qs.get("next") || ""; const hash = next.includes("#") ? next.slice(next.indexOf("#")) : ""; location.href = (r.me.role === "student" ? "student/" : "teacher/") + hash; };
  const lockText = r => r.error === "locked" ? "Too many tries. Wait " + (r.secs || 60) + " seconds, then try again." : CE.errText(r);

  fIn: {
    const f = $("#fIn");
    f.onsubmit = async e => {
      e.preventDefault(); const b = $("#iBtn"), er = $("#iErr"); er.textContent = "";
      const u = $("#iUser").value.trim(), p = $("#iPw").value; if (!u || !p) return er.textContent = "Type your username and password.";
      b.disabled = true;
      try { const r = await CE.api("ed_login", { p_user: u, p_pw: p }); if (!r.ok) { er.textContent = lockText(r); return; } go(r); }
      catch (x) { er.textContent = CE.errText(x); } finally { b.disabled = false; }
    };
  }

  /* ----- login codes ----- */
  function fmt(v) { const d = String(v || "").replace(/\D/g, "").slice(0, 8); return d.length > 4 ? d.slice(0, 4) + "-" + d.slice(4) : d; }
  const cCode = $("#cCode"), cInfo = $("#cInfo"), cSetup = $("#cSetup"), cBtn = $("#cBtn"), cErr = $("#cErr");
  let checked = null;   // the result of ed_code_check for the code currently in the box
  cCode.addEventListener("input", () => { const v = fmt(cCode.value); if (cCode.value !== v) cCode.value = v; checked = null; cInfo.classList.add("hide"); cSetup.classList.add("hide"); cBtn.textContent = "Continue"; cErr.textContent = ""; });
  $("#fCode").onsubmit = async e => {
    e.preventDefault(); cErr.textContent = "";
    const code = fmt(cCode.value); if (code.length !== 9) return cErr.textContent = "Type all 8 digits of your code.";
    cBtn.disabled = true;
    try {
      if (!checked) {
        const r = await CE.api("ed_code_check", { p_code: code }); if (!r.ok) { cErr.textContent = lockText(r); return; }
        checked = r;
        if (r.status === "account") {
          cInfo.classList.remove("hide"); cInfo.innerHTML = ""; cInfo.append(CE.h("div", { class: "card tint" }, CE.h("b", {}, "Hello" + (r.name ? ", " + r.name : "") + "."), " ", r.reset ? "This code signs you in and asks you to set a new password." : "This code signs you in to your " + (r.role === "teacher" ? "staff" : "student") + " account."));
          const x = await CE.api("ed_code_login", { p_code: code }); if (!x.ok) { cErr.textContent = lockText(x); checked = null; return; }
          go(x); return;
        }
        cInfo.classList.remove("hide"); cInfo.innerHTML = ""; cInfo.append(CE.h("div", { class: "card tint" }, CE.h("b", {}, "This code is for a new " + (r.role === "teacher" ? "staff" : "student") + " account"), r.class || r.year ? " in " + [r.class, r.year ? "Year " + r.year : null].filter(Boolean).join(", ") : "", ". Fill in your details to set it up."));
        cSetup.classList.remove("hide"); $("#cParentWrap").classList.toggle("hide", r.role !== "student"); cBtn.textContent = "Create my account"; $("#cName").focus(); return;
      }
      const name = $("#cName").value.trim(), user = $("#cUser").value.trim(), pw = $("#cPw").value;
      if (!name) return cErr.textContent = "Type your name.";
      if (!/^[A-Za-z0-9_.]{3,24}$/.test(user)) return cErr.textContent = CE.errText("bad_user");
      if (pw.length < 8) return cErr.textContent = CE.errText("bad_pw");
      if (!$("#cTerms").checked) return cErr.textContent = CE.errText("consent");
      const r = await CE.api("ed_code_setup", { p_code: code, p_user: user, p_pw: pw, p_name: name, p_consent: true, p_parent: $("#cParent").checked }); if (!r.ok) { cErr.textContent = lockText(r); return; }
      go(r);
    } catch (x) { cErr.textContent = CE.errText(x); } finally { cBtn.disabled = false; }
  };

  /* ----- create account with the school's codes ----- */
  $("#fUp").onsubmit = async e => {
    e.preventDefault(); const b = $("#uBtn"), er = $("#uErr"); er.textContent = "";
    const code = $("#uCode").value.trim(), name = $("#uName").value.trim(), user = $("#uUser").value.trim(), pw = $("#uPw").value;
    if (!code) return er.textContent = "Type the code your school gave you.";
    if (!/^[A-Za-z0-9_.]{3,24}$/.test(user)) return er.textContent = CE.errText("bad_user");
    if (pw.length < 8) return er.textContent = CE.errText("bad_pw");
    if (!$("#uTerms").checked) return er.textContent = CE.errText("consent");
    b.disabled = true;
    try {
      const r = role === "student" ? await CE.api("ed_signup", { p_join: code, p_user: user, p_pw: pw, p_name: name, p_year: +$("#uYear").value || 0, p_class: +($("#uClass").value.replace(/\D/g, "")) || 0, p_consent: true })
                                   : await CE.api("ed_claim", { p_invite: code, p_user: user, p_pw: pw, p_name: name, p_subj: +$("#uSubj").value, p_consent: true });
      if (!r.ok) { er.textContent = lockText(r); return; }
      go(r);
    } catch (x) { er.textContent = CE.errText(x); } finally { b.disabled = false; }
  };
})();
