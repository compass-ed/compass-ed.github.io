/* Public pages: menu, year, signed-in shortcut, and the live campus data on the home page. */
(function () {
  const b = document.querySelector("[data-burger]"), n = document.getElementById("pubnav");
  if (b && n) b.addEventListener("click", () => n.classList.toggle("open"));
  const y = document.getElementById("yr"); if (y) y.textContent = new Date().getFullYear();
  const pb = document.getElementById("printBtn"); if (pb) pb.onclick = () => print();
  const s = CE.auth && CE.auth.get();
  const cta = document.querySelector(".nav .cta");
  if (cta && s && s.me) { cta.innerHTML = ""; cta.append(CE.h("a", { class: "btn cyan", href: s.me.role === "student" ? "student/" : "teacher/" }, s.me.role === "student" ? "Open my campus" : "Open staff portal")); }

  if (CE.reveal) CE.reveal(document);   /* static sections on this page */
  const campus = document.getElementById("campus"); if (!campus) return;
  CE.campus(campus, { portal: s && s.me ? s.me.role : null, inPortal: false }).then(r => { const sn = document.getElementById("schoolName"); if (sn && r && r.school) sn.textContent = /^compass ?ed$/i.test(r.school) ? "Campus" : r.school + " campus"; });
})();
