/* Public pages: menu, year, signed-in shortcut, and the live campus data on the home page. */
(function () {
  const b = document.querySelector("[data-burger]"), n = document.getElementById("pubnav");
  if (b && n) b.addEventListener("click", () => n.classList.toggle("open"));
  // Compass Dash: inside your portal when signed in (its menu stays in reach), else on its own page
  if (n && !n.querySelector("a[data-dash]")) { const me = CE.auth && CE.auth.get(), a = CE.h("a", { href: me && me.me ? (me.me.role === "student" ? "student/" : "teacher/") + "#/dash" : "dash/", "data-dash": "" }, "Compass Dash"), ab = n.querySelector('a[href="about.html"]'); ab ? n.insertBefore(a, ab) : n.append(a); }
  // longer French or Arabic labels can overflow the bar: first drop "Create account" (also on the sign-in page), then fold the links into the menu button, as on a phone;
  // on the narrowest phones the wordmark goes too (the logo stays) and the button label is trimmed
  const bar = n && n.closest(".nav"), row = bar && bar.querySelector(".wrap");
  if (row) { const cta = bar.querySelector(".cta"), over = () => row.scrollWidth > row.clientWidth + 1, fit = () => { const ls = bar.querySelector(".lang-sw"); bar.classList.remove("snug", "tight", "tiny"); if (ls && cta) cta.prepend(ls); if (over()) bar.classList.add("snug"); if (over()) bar.classList.add("tight"); if (over() && ls) n.append(ls); if (over()) bar.classList.add("tiny"); }; addEventListener("resize", fit); addEventListener("load", fit); setTimeout(fit, 50); if (document.fonts) document.fonts.ready.then(fit); }
  // the bar turns dark while it floats over the dark top of a page
  const top = document.querySelector(".crown, main > .hero:first-child"), nb = document.querySelector("header.nav");
  if (top && nb && scrollY < top.offsetHeight - 60) nb.classList.add("dark");
  if (top && nb && "IntersectionObserver" in window) new IntersectionObserver(es => nb.classList.toggle("dark", es[0].isIntersecting), { rootMargin: "-60px 0px 0px 0px" }).observe(top);
  const y = document.getElementById("yr"); if (y) y.textContent = new Date().getFullYear();
  const pb = document.getElementById("printBtn"); if (pb) pb.onclick = () => print();
  const s = CE.auth && CE.auth.get();
  const cta = document.querySelector(".nav .cta");
  if (cta && s && s.me) { cta.querySelectorAll(".btn").forEach(b => b.remove()); cta.append(CE.h("a", { class: "btn cyan", href: s.me.role === "student" ? "student/" : "teacher/" }, s.me.role === "student" ? "Open my campus" : "Open staff portal")); }   // only the buttons: the language menu stays

  if (CE.reveal) CE.reveal(document);   /* static sections on this page */
  const slots = {}; document.querySelectorAll("[data-campus]").forEach(el => slots[el.dataset.campus] = el);
  if (!Object.keys(slots).length) return;
  const campus = document.createElement("div");
  CE.campus(campus, { portal: s && s.me ? s.me.role : null, inPortal: false, slots }).then(r => { const sn = document.getElementById("schoolName"); if (sn && r && r.school) sn.textContent = /^compass ?ed$/i.test(r.school) ? "Campus" : r.school + " campus"; });
})();
