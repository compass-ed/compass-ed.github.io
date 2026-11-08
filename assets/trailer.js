/* The Compass Ed trailer: 30 seconds of motion graphics drawn live on a canvas, so it needs no video file and no
   export from another tool. Every scene is timed in seconds on one timeline; "Save as video" records the canvas as
   it plays. Words go through CE.t, so the trailer reads in whichever language the page is in. */
(function () {
  const box = document.getElementById("trl"); if (!box) return;
  const cv = box.querySelector("canvas"), c = cv.getContext("2d"), W = 1600, H = 900, T = 30;
  cv.width = 1920; cv.height = 1080; c.setTransform(1.2, 0, 0, 1.2, 0, 0);   // drawn in a 1600×900 space, kept at full HD so it stays sharp on screen and in the saved video
  const tr = s => window.CE && CE.t ? CE.t(s) : s, rtl = document.documentElement.dir === "rtl";
  const HEAD = '"Manrope","Plus Jakarta Sans","IBM Plex Sans Arabic",system-ui,sans-serif', BODY = '"Plus Jakarta Sans","IBM Plex Sans Arabic",system-ui,sans-serif';
  const CY = "#4cc4cf", INK = "#000", SOFT = "#c9d2d4";
  const cl = v => v < 0 ? 0 : v > 1 ? 1 : v, out = p => 1 - Math.pow(1 - cl(p), 3), back = p => { p = cl(p) - 1; return 1 + p * p * (2.4 * p + 1.4); }, seg = (t0, d, now) => cl((now - t0) / d);
  const TINT = { maths: "#d9e8ff", english: "#fbe9cf", science: "#d4f4e4", geography: "#cff1f4", history: "#f7e3cb", computing: "#dfe5f8", art: "#f8dcee", music: "#e6dffb", languages: "#ffdfdb", pe: "#ffedc4", drama: "#eddffb" };

  /* ---------- drawings ---------- */
  /* an SVG with only a viewBox draws as nothing on a canvas in Firefox, so each one gets a real width and height first */
  const img = {}, load = (k, src) => fetch(src).then(r => r.text()).then(t => { const m = t.match(/viewBox="[^"]*?([\d.]+)\s+([\d.]+)"/); if (m && !/<svg[^>]*\swidth=/.test(t)) t = t.replace("<svg", '<svg width="' + m[1] + '" height="' + m[2] + '"');
    return new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = URL.createObjectURL(new Blob([t], { type: "image/svg+xml" })); img[k] = i; }); }).catch(() => {});
  const im = (k, x, y, w, h) => { const i = img[k]; if (i && i.naturalWidth) c.drawImage(i, x, y, w, h); };
  const rr = (x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  /* words rise one after another; o: size, font, weight, color, align (start, center, end), t0, now, st (stagger), d, maxW, lh */
  function words(str, x, y, o) {
    c.font = (o.weight || 800) + " " + o.size + "px " + (o.font || HEAD); c.textBaseline = "alphabetic"; c.textAlign = "left";
    const sp = c.measureText(" ").width, ws = tr(str).split(" ").map(w => ({ w, m: c.measureText(w).width })), lines = [[]], lh = o.lh || o.size * 1.12; let lw = 0, i = 0;
    ws.forEach(w => { const L = lines[lines.length - 1]; if (L.length && o.maxW && lw + sp + w.m > o.maxW) { lines.push([w]); lw = w.m; } else { L.push(w); lw += (L.length > 1 ? sp : 0) + w.m; } });
    const ar = w => /[\u0590-\u08FF]/.test(w), d = ws.some(w => ar(w.w));   // the words' own direction; a Latin run inside Arabic keeps its order
    c.direction = d ? "rtl" : "ltr";
    lines.forEach((L, li) => {
      const tw = L.reduce((n, w) => n + w.m, 0) + sp * (L.length - 1), lx = o.align === "center" ? x - tw / 2 : (o.align === "end") !== rtl ? x - tw : x, pos = []; let cur = d ? lx + tw : lx;
      for (let k = 0; k < L.length;) { if (!d) { pos[k] = cur; cur += L[k].m + sp; k++; } else if (ar(L[k].w)) { cur -= L[k].m; pos[k] = cur; cur -= sp; k++; } else { let j = k, bw = -sp; while (j < L.length && !ar(L[j].w)) bw += L[j++].m + sp; cur -= bw; let bx = cur; for (let q = k; q < j; q++) { pos[q] = bx; bx += L[q].m + sp; } cur -= sp; k = j; } }
      L.forEach((w, k) => { const p = cl((o.now - (o.t0 + i * (o.st == null ? .07 : o.st))) / (o.d || .5)); i++; if (p <= 0) return;
        c.save(); c.globalAlpha *= p; c.fillStyle = o.color || "#fff"; c.fillText(w.w, pos[k], y + li * lh + (1 - out(p)) * o.size * .5); c.restore(); });
    });
    return lines.length * lh;
  }
  function brand(x, y, size, t0, now) {   // "Compass Ed", always left to right
    c.font = "800 " + size + "px " + HEAD; c.direction = "ltr"; c.textAlign = "left"; c.textBaseline = "alphabetic";
    const a = c.measureText("Compass ").width, x0 = x - (a + c.measureText("Ed").width) / 2;
    [["Compass", x0, "#fff", t0], ["Ed", x0 + a, CY, t0 + .18]].forEach(([s, wx, col, ts]) => { const p = cl((now - ts) / .55); if (p <= 0) return; c.save(); c.globalAlpha *= p; c.fillStyle = col; c.fillText(s, wx, y + (1 - out(p)) * size * .4); c.restore(); });
  }
  function mark(cx, cy, s, p) {   // the logo with a soft cyan glow behind it
    if (p <= 0) return; const e = back(p), r = s * e; c.save(); c.globalAlpha *= cl(p * 2);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r * 1.3); g.addColorStop(0, "rgba(76,196,207,.5)"); g.addColorStop(1, "rgba(76,196,207,0)"); c.fillStyle = g; c.fillRect(cx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
    im("logo", cx - r / 2, cy - r / 2, r, r); c.restore();
  }
  function tile(x, y, w, h, art, label, p, tilt) {   // a drawn subject or category card
    if (p <= 0) return; const e = back(p); c.save(); c.globalAlpha *= cl(p * 1.6); c.translate(x + w / 2, y + h / 2); c.rotate(tilt || 0); c.scale(e, e); c.translate(-w / 2, -h / 2);
    rr(0, 0, w, h, Math.min(24, h * .18)); c.fillStyle = TINT[art] || "#e3f6f8"; c.fill();
    const s = Math.min(w, h) * (label ? .62 : .72); im(art, label ? (rtl ? 14 : w - s - 14) : (w - s) / 2, label ? 10 : (h - s) / 2 - 6, s, s);
    if (label) { c.font = "800 " + Math.round(h * .17) + "px " + HEAD; c.fillStyle = INK; c.textAlign = rtl ? "right" : "left"; c.direction = rtl ? "rtl" : "ltr"; c.fillText(tr(label), rtl ? w - 18 : 18, h - 20); }
    c.restore();
  }
  function pill(x, y, text, size, fill, color, p) {
    c.font = "700 " + size + "px " + BODY; c.textAlign = "left"; c.direction = rtl ? "rtl" : "ltr"; const w = c.measureText(text).width + size * 1.4, h = size * 1.9;
    c.save(); c.globalAlpha *= cl(p); const s = back(p); c.translate(x + (rtl ? -w / 2 : w / 2), y); c.scale(s, s); rr(-w / 2, -h / 2, w, h, h / 2); c.fillStyle = fill; c.fill(); c.fillStyle = color; c.textBaseline = "middle"; c.textAlign = "center"; c.fillText(text, 0, 1); c.restore(); return w;
  }
  const num = n => Math.round(n).toLocaleString(window.CE && CE.locale || undefined);
  const X = x => rtl ? W - x : x;   // mirror a left-edge x for right-to-left

  /* the dot grid never moves, so it is drawn once and laid over the moving glows each frame (720 small fills saved per frame) */
  let dots = null;
  function bg(now) {
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#03191c"); g.addColorStop(1, "#000"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    [[.8, .08, 640, .6, 0], [.16, .96, 560, .42, 2.1], [.5, .5, 980, .14, 4]].forEach(([fx, fy, r, a, ph]) => { const x = W * fx + Math.sin(now * .35 + ph) * 90, y = H * fy + Math.cos(now * .3 + ph) * 60, rg = c.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, "rgba(27,142,153," + a + ")"); rg.addColorStop(1, "rgba(27,142,153,0)"); c.fillStyle = rg; c.fillRect(0, 0, W, H); });
    if (!dots) { dots = document.createElement("canvas"); dots.width = cv.width; dots.height = cv.height; const b = dots.getContext("2d"); b.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
      b.fillStyle = "rgba(255,255,255,.07)"; for (let y = 30; y < H; y += 44) for (let x = 30; x < W; x += 44) b.fillRect(x, y, 2, 2); }
    c.drawImage(dots, 0, 0, W, H);
  }

  /* ---------- scenes: each gets its own local time in seconds ---------- */
  const S = [
    [0, 4.6, l => {   // the sting
      mark(800, 330, 190, seg(.15, .8, l)); brand(800, 585, 120, .9, l);
      words("Your school campus online", 800, 660, { size: 36, weight: 600, font: BODY, color: SOFT, align: "center", t0: 1.6, now: l });
    }],
    [4.4, 10.2, l => {   // welcome: the headline, the book and the subjects rising around it
      const hh = words("Welcome to the campus.", X(120), 250, { size: 104, maxW: 720, t0: .3, now: l });
      words("Activities to explore, competitions to enter, clubs, news and your schoolwork. One account, one place.", X(120), 250 + hh + 40, { size: 30, weight: 600, font: BODY, color: SOFT, maxW: 640, t0: 2.6, st: .05, now: l });
      const bp = seg(.5, 1, l), bs = back(bp), bx = rtl ? 380 : 1220; if (bp > 0) { c.save(); c.globalAlpha *= cl(bp * 2); c.translate(bx, 590); c.scale(bs, bs); im("book", -320, -205, 640, 410); c.restore(); }
      ["maths", "english", "science", "geography", "history", "computing", "art", "music"].forEach((a, i) => { const ang = (-165 + i * 21.4) * Math.PI / 180, x = bx + Math.cos(ang) * 340, y = 560 + Math.sin(ang) * 300; tile(x - 55, y - 65, 110, 130, a, null, seg(1.2 + i * .16, .7, l), (ang + Math.PI / 2) * .22); });
    }],
    [10, 15.4, l => {   // explore: eight categories
      words("Explore", X(120), 150, { size: 26, weight: 700, font: BODY, color: CY, t0: .2, now: l }); words("Pick a category", X(120), 250, { size: 84, t0: .3, now: l });
      [["Campus Hub", "computing"], ["Art, Design & Media", "art"], ["Our World", "geography"], ["Performing Arts", "drama"], ["Read, Write, Speak", "english"], ["Social Impact", "languages"], ["STEAM", "science"], ["Wellbeing & Sport", "pe"]]
        .forEach(([n, a], i) => { const col = i % 4, row = i >> 2, x = 120 + col * 345; tile(rtl ? W - x - 325 : x, 320 + row * 172, 325, 152, a, n, seg(.9 + i * .12, .6, l)); });
      words("Something for every afternoon, and house points for every activity you finish.", X(120), 760, { size: 30, weight: 600, font: BODY, color: SOFT, maxW: 1360, t0: 2.6, st: .04, now: l });
    }],
    [15.2, 20.1, l => {   // competitions: three tickets
      words("Enter competitions and challenges", X(120), 230, { size: 84, maxW: 1200, t0: .3, now: l });
      [["STEAM Build-Off: the strongest paper bridge", "competition", 12], ["100-word story: 'The last light'", "challenge", 8], ["Inter-form table tennis", "tournament", 4]].forEach(([title, kind, days], i) => {
        const p = seg(1 + i * .22, .7, l); if (p <= 0) return; const w = 440, h = 200, x0 = 120 + i * 470 + (1 - back(p)) * 420, x = rtl ? W - x0 - w : x0, y = 390;
        c.save(); c.globalAlpha *= cl(p * 1.5); rr(x, y, w, h, 22); c.fillStyle = "#fff"; c.fill(); c.save(); c.clip(); const sx = rtl ? x + w - 120 : x; c.fillStyle = INK; c.fillRect(sx, y, 120, h); c.restore();
        c.textAlign = "center"; c.textBaseline = "alphabetic"; c.font = "800 64px " + HEAD; c.fillStyle = CY; c.fillText(num(30 - (30 - days) * out(seg(1.3 + i * .22, 1.1, l))), sx + 60, y + 108);
        c.font = "700 15px " + BODY; c.fillStyle = SOFT; c.fillText(tr("days left"), sx + 60, y + 140);
        const bx = rtl ? x + w - 140 : x + 140; pill(bx, y + 40, tr(kind), 13, "#eef4f5", "#2b3335", seg(1.4 + i * .22, .4, l));
        words(title, bx, y + 100, { size: 24, maxW: 270, t0: 1.3 + i * .22, st: .03, d: .35, color: INK, now: l, lh: 29 });
        c.restore();
      });
      words("Winners get a notification, and points for their house.", X(120), 720, { size: 30, weight: 600, font: BODY, color: SOFT, maxW: 1360, t0: 2.6, st: .04, now: l });
    }],
    [19.9, 25, l => {   // schoolwork: a quiz answered, a checkpoint mastered
      words("Lessons, homework and quizzes", X(120), 200, { size: 80, maxW: 1360, t0: .3, now: l });
      const qp = seg(.9, .6, l); if (qp > 0) { const qx = rtl ? 860 : 120, qy = 290, qs = back(qp); c.save(); c.globalAlpha *= cl(qp * 1.5); c.translate(qx + 310, qy + 220); c.scale(qs, qs); c.translate(-(qx + 310), -(qy + 220));
        rr(qx, qy, 620, 440, 24); c.fillStyle = "#fff"; c.fill(); words("Solve 3x = 12. What is x?", rtl ? qx + 590 : qx + 30, qy + 66, { size: 30, color: INK, t0: 1.1, st: .03, d: .3, now: l });
        ["x = 3", "x = 4", "x = 9", "x = 36"].forEach((o, i) => { const oy = qy + 110 + i * 76, hit = i === 1 && l > 2.2; rr(qx + 30, oy, 560, 60, 14); c.fillStyle = hit ? "#e5f6ec" : "#f6f9fa"; c.fill(); if (hit) { c.strokeStyle = "#1f9d55"; c.lineWidth = 2; c.stroke(); }
          c.font = "600 24px " + BODY; c.fillStyle = INK; c.textAlign = rtl ? "right" : "left"; c.direction = "ltr"; c.textBaseline = "middle"; c.fillText(o, rtl ? qx + 566 : qx + 54, oy + 31);
          if (hit) { const tp = back(seg(2.2, .4, l)); c.save(); c.translate(rtl ? qx + 60 : qx + 560, oy + 30); c.scale(tp, tp); c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fillStyle = "#1f9d55"; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 3; c.lineCap = "round"; c.beginPath(); c.moveTo(-6, 0); c.lineTo(-2, 5); c.lineTo(7, -5); c.stroke(); c.restore(); } });
        pill(rtl ? qx + 590 : qx + 30, qy + 408, tr("Correct") + " · +5 " + tr("points"), 15, "#e5f6ec", "#1f9d55", seg(2.6, .4, l)); c.restore(); }
      const rp = seg(1.2, 1.7, l), rx = rtl ? 450 : 1150, ry = 450; if (rp > 0) { c.save(); c.globalAlpha *= cl(rp * 3); c.lineWidth = 22; c.lineCap = "round"; c.strokeStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.arc(rx, ry, 120, 0, 7); c.stroke();
        c.strokeStyle = CY; c.beginPath(); c.arc(rx, ry, 120, -Math.PI / 2, -Math.PI / 2 + out(rp) * 2 * Math.PI); c.stroke(); c.font = "800 56px " + HEAD; c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.direction = "ltr"; c.fillText(num(out(rp) * 100) + "%", rx, ry + 2); c.restore(); }
      words("Checkpoint mastered", rx, 640, { size: 28, weight: 700, font: BODY, color: CY, align: "center", t0: 2.9, now: l });
      words("Drafts, feedback, and a review queue that brings back anything you got wrong.", X(120), 830, { size: 28, weight: 600, font: BODY, color: SOFT, maxW: 1360, t0: 3.4, st: .04, now: l });
    }],
    [24.8, 28.6, l => {   // Compass Dash: the cube runs and jumps, XP counts up
      words("Revise with Compass Dash", X(120), 170, { size: 72, t0: .2, now: l });
      const px = 120, py = 230, pw = 1360, ph = 560, gy = py + ph - 110, sp = 520; c.save(); rr(px, py, pw, ph, 28); c.clip(); const sk = c.createLinearGradient(0, py, 0, gy); sk.addColorStop(0, "#06262b"); sk.addColorStop(1, "#0f4a52"); c.fillStyle = sk; c.fillRect(px, py, pw, ph);
      c.fillStyle = "#04282c"; c.fillRect(px, gy, pw, 110); c.fillStyle = CY; c.fillRect(px, gy, pw, 4); c.fillStyle = "rgba(76,196,207,.18)"; for (let x = px - ((l * sp) % 80); x < px + pw; x += 80) c.fillRect(x, gy + 30, 40, 4);
      const cx = rtl ? W - 420 : 420, dir = rtl ? -1 : 1, J = [1.2, 2.1, 2.75, 3.4]; let jump = 0, rot = 0;
      J.forEach(ts => { const x = cx + dir * sp * (ts - l); if (x > px - 60 && x < px + pw + 60) { c.beginPath(); c.moveTo(x - 28, gy); c.lineTo(x, gy - 64); c.lineTo(x + 28, gy); c.closePath(); c.fillStyle = "#e4572e"; c.fill(); } const u = (l - (ts - .34)) / .68; if (u > 0 && u < 1) { jump = 180 * 4 * u * (1 - u); rot = u * Math.PI / 2 * dir; } });
      c.save(); c.translate(cx, gy - 32 - jump); c.rotate(rot); rr(-32, -32, 64, 64, 12); c.fillStyle = CY; c.fill(); c.fillStyle = "#04282c"; c.fillRect(-14 + 8 * dir, -12, 8, 14); c.fillRect(6 + 8 * dir, -12, 8, 14); c.restore();
      c.font = "800 48px " + HEAD; c.fillStyle = CY; c.textAlign = rtl ? "left" : "right"; c.direction = "ltr"; c.textBaseline = "alphabetic"; c.fillText(num(out(seg(.4, 2.8, l)) * 1250) + " XP", rtl ? px + 40 : px + pw - 40, py + 76); c.restore();
      words("The school's revision site, open with the same account.", X(120), 852, { size: 26, weight: 600, font: BODY, color: SOFT, maxW: 1360, t0: 1.2, st: .04, now: l });
    }],
    [28.4, 31, l => {   // close
      mark(800, 330, 150, seg(.1, .7, l)); brand(800, 570, 110, .5, l);
      words("Ask your teacher for a login code", 800, 650, { size: 32, weight: 600, font: BODY, color: SOFT, align: "center", t0: 1, now: l });
    }]
  ];
  function draw(now) {
    bg(now);
    S.forEach(([t0, t1, f]) => { const a = Math.min(cl((now - t0) / .45), cl((t1 - now) / .5)); if (a <= 0) return; c.save(); c.globalAlpha = a; c.translate(0, (1 - out(cl((now - t0) / .6))) * 26); f(now - t0); c.restore(); });
  }

  /* ---------- the player ---------- */
  const big = document.getElementById("trlBig"), playB = document.getElementById("trlPlay"), prog = document.getElementById("trlProg"), tm = document.getElementById("trlTime"), save = document.getElementById("trlSave"), fs = document.getElementById("trlFs");
  let time = 0, playing = false, last = 0, raf = 0, rec = null, seen = false;
  const fmt = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  function ui() {
    prog.firstElementChild.style.width = time / T * 100 + "%"; prog.setAttribute("aria-valuenow", Math.round(time)); tm.textContent = fmt(time) + " / " + fmt(T);
    playB.replaceChildren(CE.icon(playing ? "pause" : "play")); playB.setAttribute("aria-label", tr(playing ? "Pause" : "Play")); big.replaceChildren(CE.icon("play"), tr(time >= T ? "Replay" : "Play trailer"));
    if (rec) save.textContent = tr("Recording…") + " " + Math.round(time) + " s";
  }
  function frame(ts) { if (!playing) return; time = Math.min(T, time + Math.min(.05, (ts - last) / 1000)); last = ts; draw(time); ui(); if (time >= T) { stop(); if (rec) rec.stop(); } else raf = requestAnimationFrame(frame); }
  function play() { if (time >= T) time = 0; playing = true; box.classList.add("on"); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); ui(); }
  function stop() { playing = false; box.classList.remove("on"); cancelAnimationFrame(raf); ui(); }
  const toggle = () => { if (rec) return; playing ? stop() : play(); };
  big.onclick = playB.onclick = toggle;
  prog.onclick = e => { if (rec) return; const r = prog.getBoundingClientRect(), f = (e.clientX - r.left) / r.width; time = T * (rtl ? 1 - f : f); draw(time); ui(); };
  prog.onkeydown = e => { const d = { ArrowRight: 2, ArrowLeft: -2, ArrowUp: 2, ArrowDown: -2 }[e.key]; if (!d || rec) return; e.preventDefault(); time = cl((time + d * (rtl ? -1 : 1)) / T) * T; draw(time); ui(); };
  if (box.requestFullscreen) fs.onclick = () => document.fullscreenElement ? document.exitFullscreen() : box.requestFullscreen(); else fs.remove();
  /* record the canvas while the trailer plays through once, then hand over the file */
  if (window.MediaRecorder && cv.captureStream) { save.classList.remove("hide"); save.onclick = () => {
    if (rec) return; const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(m => MediaRecorder.isTypeSupported(m)), chunks = [];
    rec = new MediaRecorder(cv.captureStream(60), mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined); rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { const b = new Blob(chunks, { type: rec.mimeType }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "compass-ed-trailer." + (/mp4/.test(rec.mimeType) ? "mp4" : "webm"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); rec = null; save.disabled = false; save.textContent = tr("Save as video"); };
    time = 0; save.disabled = true; rec.start(); play(); }; }
  document.addEventListener("visibilitychange", () => { if (document.hidden && playing && !rec) stop(); });
  box.seek = s => { time = cl(s / T) * T; draw(time); ui(); };

  Promise.all([load("logo", "assets/logo-white.svg"), load("book", "assets/art/book.svg"), ...Object.keys(TINT).map(a => load(a, "assets/art/subj/" + a + ".svg")), document.fonts ? document.fonts.ready : null]).then(() => {
    draw(3.4); ui();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;   // plays only when asked
    new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !seen) { seen = true; play(); } else if (!e.isIntersecting && playing && !rec) stop(); }), { threshold: .5 }).observe(box);
  });
})();
