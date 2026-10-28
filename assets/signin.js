/* Sign-in page logic. */
(function () {
  const $ = CE.$, qs = new URLSearchParams(location.search);
  const tabS = $("#tabS"), tabT = $("#tabT"), fS = $("#fS"), fT = $("#fT");
  const show = role => { const t = role === "teacher"; tabS.classList.toggle("on", !t); tabT.classList.toggle("on", t); fS.classList.toggle("hide", t); fT.classList.toggle("hide", !t); $(t ? "#tUser" : "#sCode").focus(); };
  tabS.onclick = () => show("student"); tabT.onclick = () => show("teacher");
  show(qs.get("role") === "teacher" ? "teacher" : "student");

  // already signed in? go straight through
  if (CE.teacher.get() && qs.get("role") === "teacher") location.replace("teach.html");
  else if (CE.student.get() && qs.get("role") !== "teacher" && !qs.get("code")) location.replace("app.html");

  if (CE.demo && window.CE_DEMO) {
    const a = window.CE_DEMO.accounts, box = $("#demoAccounts");
    box.append(CE.h("div", { class: "card", style: { background: "#151515", borderColor: "#2a2a2a", color: "#fff" } },
      CE.h("div", { class: "kicker" }, "Preview accounts"),
      CE.h("div", { class: "sm" }, "Students: ", ...a.students.map(([c, u], i) => CE.h("span", {}, i ? " · " : "", CE.h("a", { href: "#", style: { color: "#4cc4cf" }, onclick: e => { e.preventDefault(); show("student"); $("#sCode").value = c; $("#sUser").value = u; } }, u + " (" + c + ")")))),
      CE.h("div", { class: "sm", style: { marginTop: "6px" } }, "Teachers: ", ...a.teachers.map(([u, p], i) => CE.h("span", {}, i ? " · " : "", CE.h("a", { href: "#", style: { color: "#4cc4cf" }, onclick: e => { e.preventDefault(); show("teacher"); $("#tUser").value = u; $("#tPw").value = p; } }, u)))),
      CE.h("div", { class: "xs mut", style: { marginTop: "8px" } }, "Preview mode keeps a sample school in this browser. Add ?demo=0 to the address to turn it off.")));
  }

  fS.onsubmit = async e => {
    e.preventDefault(); const b = $("#sBtn"), er = $("#sErr"); er.textContent = "";
    const code = $("#sCode").value.replace(/\D/g, ""), user = $("#sUser").value.trim();
    if (code.length !== 4) return er.textContent = "The code is 4 digits.";
    if (!/^[A-Za-z0-9_]{3,16}$/.test(user)) return er.textContent = "Usernames are 3 to 16 letters, numbers or _.";
    b.disabled = true;
    try {
      const r = await CE.api("ce_s_login", { p_code: code, p_user: user });
      if (!r.ok) { er.textContent = CE.errText(r); return; }
      CE.student.set({ code: r.code, username: r.username, sid: r.sid, house: r.house, year: r.year, class: r.class, subjects: r.subjects });
      location.href = "app.html" + (qs.get("next") ? "#" + qs.get("next") : "");
    } catch (x) { er.textContent = CE.errText(x); } finally { b.disabled = false; }
  };

  fT.onsubmit = async e => {
    e.preventDefault(); const b = $("#tBtn"), er = $("#tErr"); er.textContent = "";
    const u = $("#tUser").value.trim(), p = $("#tPw").value; if (!u || !p) return er.textContent = "Type your username and password.";
    b.disabled = true;
    try {
      const r = await CE.api("cd_t_login", { p_user: u, p_pw: p });
      if (!r.ok) { er.textContent = r.error === "locked" ? "Too many tries. Wait 30 seconds, then try again." : r.error === "disabled" ? "This account has been switched off." : "That username and password do not match."; return; }
      const me = await CE.api("ce_t_me", { p_key: r.tok });
      if (!me.ok) { er.textContent = CE.errText(me); return; }
      CE.teacher.set(r.tok, me);
      location.href = "teach.html";
    } catch (x) { er.textContent = CE.errText(x); } finally { b.disabled = false; }
  };

  // Microsoft
  const ms = $("#msBtn"), help = $("#msHelp");
  if (!CE.MS.enabled()) { help.textContent = CE.demo ? "Microsoft sign-in needs the school's app registration (see README). In preview mode it is switched off." : "Microsoft sign-in is not switched on for this school yet."; ms.disabled = true; }
  else {
    ms.onclick = () => CE.MS.signIn("signin");
    CE.MS.finish().then(r => {
      if (!r) return;
      if (!r.ok) { help.textContent = CE.errText(r); return; }
      if (r.role === "teacher") { CE.teacher.set(r.tok, r.me); location.href = "teach.html"; }
      else { CE.student.set(r.student); location.href = "app.html"; }
    }).catch(x => { help.textContent = CE.errText(x); });
  }
})();
