/* Page-transition handshake, loaded first in <head> so the arriving page paints with the compass veil already in place
   (no flash of content). The page we came from set ce_tx just before navigating; reduced-motion users never see any of it. */
(function () {
  try {
    var t = sessionStorage.getItem("ce_tx"); if (!t) return; sessionStorage.removeItem("ce_tx");
    if (Date.now() - (+t) > 4000 || matchMedia("(prefers-reduced-motion: reduce)").matches || !(window.CSS && CSS.registerProperty)) return;
    var d = document.documentElement; d.classList.add("tx-in");
    var off = function () { d.classList.remove("tx-in"); };
    setTimeout(off, 2000); addEventListener("pageshow", function (e) { if (e.persisted) off(); });
  } catch (e) {}
})();
