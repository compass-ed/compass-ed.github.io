/* Compass Ed languages: English (source), French, Arabic (right to left).
   Loaded in <head> on every page, before anything paints. The page code stays in English; this layer swaps the text
   on screen for the chosen language as it appears, so pages built later by the portals are translated too.
   Dictionaries live in assets/i18n/<lang>.js and register themselves with CE_I18N({ t, h, r }):
     t: exact text  ->  translation          (labels, buttons, sentences)
     h: inner HTML  ->  translated inner HTML (static sentences with bold or links inside)
     r: [[regex, replacement], ...]          (text with numbers or names in it, e.g. "3 days left")
   Users' own content (titles, names, messages) is left as written. */
(function () {
  const LANGS = { en: { name: "English", locale: "en-GB" }, fr: { name: "Français", locale: "fr-FR" }, ar: { name: "العربية", locale: "ar-u-nu-latn", rtl: true } };
  let lang = "en";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q && LANGS[q]) localStorage.setItem("ce_lang", q);
    lang = localStorage.getItem("ce_lang") || "en";
  } catch (e) {}
  if (!LANGS[lang]) lang = "en";
  const root = document.documentElement, me = document.currentScript, base = me ? me.src.replace(/[^/]*$/, "") : "assets/";
  root.lang = lang; root.dir = LANGS[lang].rtl ? "rtl" : "ltr";
  const CE = window.CE = window.CE || {};
  CE.lang = lang; CE.locale = LANGS[lang].locale; CE.langs = LANGS;
  CE.setLang = l => { try { localStorage.setItem("ce_lang", l); } catch (e) {} const u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u.href); };
  CE.t = s => s;
  CE.langSwitch = cls => {
    const sel = document.createElement("select"); sel.className = "lang-sw" + (cls ? " " + cls : ""); sel.setAttribute("aria-label", "Language"); sel.setAttribute("data-no-i18n", "");
    for (const [k, v] of Object.entries(LANGS)) { const o = document.createElement("option"); o.value = k; o.textContent = v.name; o.lang = k; if (k === lang) o.selected = true; sel.append(o); }
    sel.onchange = () => CE.setLang(sel.value);
    return sel;
  };
  // a switcher in whichever header the page has: portal top bar, else the public/sign-in nav
  const placeSwitch = () => {
    if (document.querySelector(".lang-sw")) return;
    const top = document.querySelector(".topbar"), cta = document.querySelector(".nav .cta"), navWrap = document.querySelector(".nav .wrap");
    if (top) { const s = CE.langSwitch("on-dark-auto"); const anchor = top.querySelector('a[href="#/search"]'); anchor ? top.insertBefore(s, anchor) : top.append(s); }
    else if (cta) cta.prepend(CE.langSwitch());
    else if (navWrap) navWrap.append(CE.langSwitch());
  };
  document.addEventListener("DOMContentLoaded", () => setTimeout(placeSwitch, 0));
  if (lang === "en") return;

  /* ---------- non-English: load the dictionary, translate before the first paint ---------- */
  root.classList.add("i18n-pending");
  const st = document.createElement("style"); st.textContent = "html.i18n-pending body{visibility:hidden}"; document.head.append(st);
  const reveal = () => root.classList.remove("i18n-pending"); setTimeout(reveal, 2500);
  if (LANGS[lang].rtl) { const f = document.createElement("link"); f.rel = "stylesheet"; f.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"; document.head.append(f); }
  let D = { t: {}, h: {}, r: [] };
  window.CE_I18N = d => { Object.assign(D.t, d.t || {}); Object.assign(D.h, d.h || {}); D.r.push(...(d.r || []).map(([re, to]) => [new RegExp(re), to])); };
  document.write('<script src="' + base + "i18n/" + lang + '.js"><\/script>');   // same-origin, blocking: the words are ready before the page body parses

  const tr = text => {
    const core = text.trim(); if (!core || !/\p{L}/u.test(core)) return null;
    let out = one(core);
    if (out == null && core.includes(" · ")) { const parts = core.split(" · "), done = parts.map(p => one(p.trim())); if (done.some(x => x != null)) out = parts.map((p, i) => done[i] != null ? done[i] : p).join(" · "); }
    if (out == null || out === core) return null;
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    return lead + out + trail;
  };
  const one = s => { if (Object.prototype.hasOwnProperty.call(D.t, s)) return D.t[s]; for (const [re, to] of D.r) if (re.test(s)) return s.replace(re, to); return null; };
  CE.t = s => { if (typeof s !== "string") return s; const x = tr(s); return x == null ? s : x; };
  for (const k of ["confirm", "alert", "prompt"]) { const f = window[k]; if (f) window[k] = (m, ...a) => f.call(window, CE.t(String(m == null ? "" : m)), ...a); }

  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "CODE", "PRE", "SVG"]);
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  const written = new WeakMap();
  const skipEl = el => !el || SKIP.has(el.tagName) || (el.closest && el.closest("[data-no-i18n],[contenteditable=''],[contenteditable=true],.ProseMirror"));
  const doText = n => {
    if (written.get(n) === n.data) return;
    const p = n.parentElement; if (skipEl(p)) return;
    const x = tr(n.data); if (x == null) return;
    if (p.tagName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", p.textContent);   // keep the value the form submits in English
    n.data = x; written.set(n, x);
  };
  const doAttrs = el => { if (skipEl(el)) return; for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const x = tr(v); if (x != null) el.setAttribute(a, x); } } };
  const INLINE = new Set(["A", "B", "STRONG", "EM", "I", "CODE", "SMALL", "BR", "SPAN", "U", "KBD", "ABBR", "SUB", "SUP", "MARK", "Q", "TIME"]);
  const doUnit = el => {   // a sentence with bold, links or code inside, translated as a whole (static pages)
    if (!el.children.length || INLINE.has(el.tagName) || skipEl(el)) return false;
    const key = el.innerHTML.replace(/\s+/g, " ").trim(); if (!Object.prototype.hasOwnProperty.call(D.h, key)) return false;
    el.innerHTML = D.h[key]; el.querySelectorAll("*").forEach(c => { c.__i18n = 1; }); el.__i18n = 1; return true;
  };
  const walk = node => {
    if (node.nodeType === 3) return doText(node);
    if (node.nodeType !== 1 || skipEl(node)) return;
    if (node.__i18n) return;
    if (doUnit(node)) return;
    doAttrs(node);
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  };
  const first = () => {
    walk(document.head.querySelector("title") || document.head);
    walk(document.body); reveal();
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  document.addEventListener("DOMContentLoaded", first);
})();
