/* Public pages: menu, year, signed-in shortcut, and the live campus data on the home page. */
(function () {
  const b = document.querySelector("[data-burger]"), n = document.getElementById("pubnav");
  if (b && n) b.addEventListener("click", () => n.classList.toggle("open"));
  // Compass Dash: inside your portal when signed in (its menu stays in reach), else on its own page
  if (n && !n.querySelector("a[data-dash]")) { const me = CE.auth && CE.auth.get(), a = CE.h("a", { href: me && me.me ? (me.me.role === "student" ? "student/" : "teacher/") + "#/dash" : "dash/", "data-dash": "" }, "Compass Dash"), ab = n.querySelector('a[href="about.html"]'); ab ? n.insertBefore(a, ab) : n.append(a); }
  // longer French or Arabic labels can overflow the bar: first drop "Create account" (also on the sign-in page), then fold the links into the menu button, as on a phone
  const bar = n && n.closest(".nav"), row = bar && bar.querySelector(".wrap");
  if (row) { const over = () => row.scrollWidth > row.clientWidth + 1, fit = () => { bar.classList.remove("snug", "tight"); if (over()) bar.classList.add("snug"); if (over()) bar.classList.add("tight"); }; addEventListener("resize", fit); addEventListener("load", fit); setTimeout(fit, 50); if (document.fonts) document.fonts.ready.then(fit); }
  const y = document.getElementById("yr"); if (y) y.textContent = new Date().getFullYear();
  const pb = document.getElementById("printBtn"); if (pb) pb.onclick = () => print();
  const s = CE.auth && CE.auth.get();
  const cta = document.querySelector(".nav .cta");
  if (cta && s && s.me) { cta.innerHTML = ""; cta.append(CE.h("a", { class: "btn cyan", href: s.me.role === "student" ? "student/" : "teacher/" }, s.me.role === "student" ? "Open my campus" : "Open staff portal")); }

  if (CE.reveal) CE.reveal(document);   /* static sections on this page */
  const slots = {}; document.querySelectorAll("[data-campus]").forEach(el => slots[el.dataset.campus] = el);
  if (!Object.keys(slots).length) return;
  const campus = document.createElement("div");
  CE.campus(campus, { portal: s && s.me ? s.me.role : null, inPortal: false, slots }).then(r => { const sn = document.getElementById("schoolName"); if (sn && r && r.school) sn.textContent = /^compass ?ed$/i.test(r.school) ? "Campus" : r.school + " campus"; });
})();
