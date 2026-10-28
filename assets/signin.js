/* Sign-in and account creation. */
(function () {
  const $ = CE.$, qs = new URLSearchParams(location.search);
  const SUBJ = [["Maths"], ["English"], ["Science"], ["Geography"], ["History"], ["Computing"], ["Art & Design"], ["Music"], ["Languages"], ["PE & Wellbeing"], ["Drama"]];
  SUBJ.forEach((s, i) => $("#uSubj").append(CE.h("option", { value: i }, s[0])));
  const tabIn = $("#tabIn"), tabUp = $("#tabUp"), fIn = $("#fIn"), fUp = $("#fUp");
  const show = up => { tabIn.classList.toggle("on", !up); tabUp.classList.toggle("on", up); fIn.classList.toggle("hide", up); fUp.classList.toggle("hide", !up); };
  tabIn.onclick = () => show(false); tabUp.onclick = () => show(true);
  show(qs.get("signup") === "1");
  let role = qs.get("role") === "teacher" ? "teacher" : "student";
  const setRole = r => { role = r; $("#roleS").classList.toggle("on", r === "student"); $("#roleT").classList.toggle("on", r === "teacher"); $("#studentFields").classList.toggle("hide", r !== "student"); $("#teacherFields").classList.toggle("hide", r !== "teacher"); $("#codeLabel").textContent = r === "student" ? "School join code" : "Teacher invite code"; $("#uCode").placeholder = r === "student" ? "e.g. COMPASS-2026" : "e.g. TEACH-2026"; };
  $("#roleS").onclick = () => setRole("student"); $("#roleT").onclick = () => setRole("teacher"); setRole(role);

  const s = CE.auth.get();
  if (s && s.me) location.replace(s.me.role === "student" ? "app.html" : "teach.html");

  if (CE.demo && window.CE_DEMO) {
    const a = window.CE_DEMO.accounts, box = $("#demoAccounts");
    const link = (u, p) => CE.h("a", { href: "#", style: { color: "#4cc4cf" }, onclick: e => { e.preventDefault(); show(false); $("#iUser").value = u; $("#iPw").value = p; } }, u);
    box.append(CE.h("div", { class: "card", style: { background: "#151515", borderColor: "#2a2a2a", color: "#fff" } },
      CE.h("div", { class: "kicker" }, "Preview accounts"),
      CE.h("div", { class: "sm" }, "Students: ", ...a.students.flatMap(([u, p], i) => [i ? " · " : "", link(u, p)])),
      CE.h("div", { class: "sm", style: { marginTop: "6px" } }, "Staff: ", ...a.staff.flatMap(([u, p], i) => [i ? " · " : "", link(u, p)])),
      CE.h("div", { class: "xs mut", style: { marginTop: "8px" } }, "Join code " + a.join + " · invite code " + a.invite + ". Preview mode keeps a sample campus in this browser; add ?demo=0 to turn it off.")));
  }

  const go = (r) => { CE.auth.set(r.tok, r.me); const next = qs.get("next"); location.href = next && /^(app|teach)\.html/.test(next) ? next : (r.me.role === "student" ? "app.html" : "teach.html"); };

  fIn.onsubmit = async e => {
    e.preventDefault(); const b = $("#iBtn"), er = $("#iErr"); er.textContent = "";
    const u = $("#iUser").value.trim(), p = $("#iPw").value; if (!u || !p) return er.textContent = "Type your username and password.";
    b.disabled = true;
    try { const r = await CE.api("ed_login", { p_user: u, p_pw: p }); if (!r.ok) { er.textContent = r.error === "locked" ? "Too many tries. Wait " + (r.secs || 60) + " seconds, then try again." : CE.errText(r); return; } go(r); }
    catch (x) { er.textContent = CE.errText(x); } finally { b.disabled = false; }
  };

  fUp.onsubmit = async e => {
    e.preventDefault(); const b = $("#uBtn"), er = $("#uErr"); er.textContent = "";
    const code = $("#uCode").value.trim(), name = $("#uName").value.trim(), user = $("#uUser").value.trim(), pw = $("#uPw").value;
    if (!code) return er.textContent = "Type the code your school gave you.";
    if (!/^[A-Za-z0-9_.]{3,24}$/.test(user)) return er.textContent = CE.errText("bad_user");
    if (pw.length < 8) return er.textContent = CE.errText("bad_pw");
    b.disabled = true;
    try {
      const r = role === "student" ? await CE.api("ed_signup", { p_join: code, p_user: user, p_pw: pw, p_name: name, p_year: +$("#uYear").value || 0, p_class: +($("#uClass").value.replace(/\D/g, "")) || 0 })
                                   : await CE.api("ed_claim", { p_invite: code, p_user: user, p_pw: pw, p_name: name, p_subj: +$("#uSubj").value });
      if (!r.ok) { er.textContent = CE.errText(r); return; }
      go(r);
    } catch (x) { er.textContent = CE.errText(x); } finally { b.disabled = false; }
  };
})();
