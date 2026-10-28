/* Compass Ed icon set: hand-drawn 24-unit stroke icons, one accent weight, no emoji.
   CE.icon(name) returns an inline <svg>. Any element with data-icon="name" is filled on load. */
(function () {
  const P = {
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/><path d="M9 7h7"/>',
    lesson: '<path d="M3 6h7a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H3z"/><path d="M21 6h-7a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h8z"/>',
    pencil: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m13.5 7.5 3 3"/>',
    repeat: '<path d="M17 3l4 4-4 4"/><path d="M3 11V9a2 2 0 0 1 2-2h16"/><path d="m7 21-4-4 4-4"/><path d="M21 13v2a2 2 0 0 1-2 2H3"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m7 15 4-5 3 3 5-7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/>',
    megaphone: '<path d="M3 10v4h3l8 4V6l-8 4z"/><path d="M18 9a4 4 0 0 1 0 6"/><path d="M6 14v5h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    game: '<path d="M6 9h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 16h-4l-1 .6A4 4 0 0 1 2 14v-1a4 4 0 0 1 4-4z"/><path d="M7 12v3M5.5 13.5h3"/><path d="M16.5 12.5h.01M18.5 14.5h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 13.5a6.5 6.5 0 0 1 4 6.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    puzzle: '<path d="M10 3a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v3h1a2 2 0 1 1 0 4h-1v3a2 2 0 0 1-2 2h-3v-1a2 2 0 1 0-4 0v1H5a2 2 0 0 1-2-2v-3h1a2 2 0 1 0 0-4H3V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2z"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    ruler: '<path d="M3 15.5 15.5 3 21 8.5 8.5 21z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
    teams: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/>',
    cross: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 2"/><path d="M5 4 2.5 6.5M19 4l2.5 2.5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/>',
    exam: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    bus: '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16"/><path d="M7 20v-3M17 20v-3"/><path d="M8 14h.01M16 14h.01"/>',
    pin: '<path d="M14 3 21 10l-4 1-3 3 .5 4.5L9 13l-5.5 5.5L9 13 3.5 8.5 8 9l3-3z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
    inbox: '<path d="M4 13V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8"/><path d="M4 13h4l2 3h4l2-3h4v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    exit: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4"/><path d="M19 12H9"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    arrowl: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
    down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    place: '<path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z"/><circle cx="12" cy="10" r="2"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 21h8M10 17h4v4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    leaf: '<path d="M5 20c0-8 4-13 14-14-1 10-6 14-14 14z"/><path d="M5 20c3-4 6-7 10-10"/>',
    warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    muscle: '<path d="M6 19c-2-3-2-7 0-9l2-2 3 2 2-3 3 1 2 3-1 5-3 3z"/><path d="M8 8 6 5l3-2 2 3"/>',
    submit: '<path d="M4 12.5 20 5l-4 15-5-6z"/><path d="M11 14 20 5"/>',
    cup: '<path d="M6 4h12v6a6 6 0 0 1-12 0z"/><path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4"/><path d="M12 16v4M8 20h8"/>',
    sport: '<circle cx="12" cy="12" r="9"/><path d="M12 3c-2.5 2.5-2.5 15.5 0 18M12 3c2.5 2.5 2.5 15.5 0 18"/><path d="M3.5 9h17M3.5 15h17"/>',
    drama: '<path d="M4 4h8v7a4 4 0 0 1-8 0z"/><path d="M12 9h8v7a4 4 0 0 1-8 0z"/><path d="M6.5 7h.01M9.5 7h.01M14.5 12h.01M17.5 12h.01"/><path d="M6.5 9.5c.8.8 2.2.8 3 0M14.5 15.5c.8-.8 2.2-.8 3 0"/>',
    news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M7 9h7M7 12h7M7 15h4"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8"/><path d="m12 13 .9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
    explore: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="m13.5 8.5-1.5 4-4 1.5 1.5-4z"/>',
    people: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0"/><path d="M14 19a4.5 4.5 0 0 1 7.5-3.3"/>',
    key: '<circle cx="8" cy="14" r="4"/><path d="m11 11 9-9"/><path d="m17 5 2 2M14 8l2 2"/>',
    campus: '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/><path d="M12 9h.01"/>',
    /* subjects */
    maths: '<path d="M4 7h7M7.5 4v6"/><path d="M13 6h7"/><path d="M13 14h7M13 18h7"/><path d="m4 14 6 6M10 14l-6 6"/>',
    english: '<path d="M5 20V4h9"/><path d="M5 12h7"/><path d="M5 20h9"/><path d="m16 20 3-9 3 9M17 17h4"/>',
    science: '<path d="M9 3h6"/><path d="M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7.5 15h9"/>',
    geography: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    french: '<path d="M3 5h18v14H3z"/><path d="M9 5v14M15 5v14"/>',
    computing: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="m8 9 2 1.5L8 12M12 12h3"/>',
    art: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1a9 9 0 0 0-6-12z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    history: '<path d="M6 3h12v18H6z"/><path d="M6 3c-2 0-2 2 0 2M6 19c-2 0-2 2 0 2"/><path d="M10 8h4M10 12h4M10 16h2"/>',
    spanish: '<path d="M3 5h18v14H3z"/><path d="M3 9h18M3 15h18"/>',
    arabic: '<path d="M4 17c2 2 5 2 7 0s2-6 0-8M11 9c3 0 5 2 5 5s-2 5-5 5"/><path d="M19 7v10"/><path d="M19 4h.01"/>'
  };
  const SUBJ = ["maths", "english", "science", "geography", "french", "computing", "art", "music", "history", "spanish", "arabic"];
  window.CE = window.CE || {};
  CE.icon = function (name, cls) {
    const el = document.createElement("span"); el.className = "i" + (cls ? " " + cls : ""); el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || P.compass) + "</svg>";
    return el;
  };
  CE.iconHtml = (name, cls) => CE.icon(name, cls).outerHTML;
  CE.subjKey = id => SUBJ[id] || "book";
  CE.hydrateIcons = root => (root || document).querySelectorAll("[data-icon]").forEach(el => { if (!el.firstChild) el.append(CE.icon(el.dataset.icon)); });
  if (document.readyState !== "loading") CE.hydrateIcons(); else document.addEventListener("DOMContentLoaded", () => CE.hydrateIcons());
})();
