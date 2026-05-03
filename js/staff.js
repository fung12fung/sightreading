/* ══════════════════════════════════════════════
   staff.js — VexFlow-based staff renderer with v2 extensions
   - drawStaff(el, notes, options) — single-bar staff (used by reveal/audiate/etc.)
   - drawScrollingScore(el, notes, options) — wide staff with note positions returned
   - drawNoteTimeline(canvas, opts) — line-graph of expected vs detected
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { vexToMidi, midiToLabel, DUR_BEATS, cardBeatPositions, totalCardBeats } = SRF.Util;

  /**
   * drawStaff — single-line staff renderer
   * @param {HTMLElement} el
   * @param {Array<{k:string, d:string}>} notes
   * @param {Object} options
   *   - clef:           'treble' | 'bass' (default 'treble')
   *   - keySignature:   'C' | 'G' | 'F' | 'D' | 'Bb' | ... (optional)
   *   - timeSignature:  '4/4' | '3/4' | ... (optional)
   *   - results:        boolean[] (auto-color: green correct, red wrong)
   *   - colors:         string[] explicit per-note colors (overrides results)
   *   - height:         number, css px (default 160)
   *   - phraseBreaks:   number[] note indices that begin a new phrase (extra space)
   */
  function drawStaff(el, notes, options) {
    el.innerHTML = '';
    if (!window.Vex || !notes || !notes.length) return;
    const opts = options || {};
    const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = Vex.Flow;
    const w  = el.clientWidth || 320;
    const h  = opts.height || 160;
    const rndr = new Renderer(el, Renderer.Backends.SVG);
    rndr.resize(w, h);
    const ctx = rndr.getContext();
    ctx.setFont('Arial', 10);

    const sw    = w - 20;
    const stave = new Stave(10, Math.round(h * 0.18), sw);
    stave.addClef(opts.clef || 'treble');
    if (opts.keySignature) stave.addKeySignature(opts.keySignature);
    if (opts.timeSignature) stave.addTimeSignature(opts.timeSignature);
    stave.setContext(ctx).draw();

    const vNotes = notes.map((note, i) => {
      const sn = new StaveNote({
        keys: [note.k],
        duration: note.d,
        clef: opts.clef || 'treble',
        auto_stem: true,
      });
      // Add accidentals if the key contains a sharp/flat
      const m = note.k.match(/^([a-g])(#|b)?\//i);
      if (m && m[2]) sn.addModifier(new Accidental(m[2]));

      const col = opts.colors ? opts.colors[i]
                : (opts.results && opts.results[i] !== undefined)
                  ? (opts.results[i] ? '#059669' : '#dc2626')
                  : null;
      if (col) sn.setStyle({ fillStyle: col, strokeStyle: col });
      return sn;
    });

    const total = totalCardBeats(notes);
    const num = Math.max(4, Math.ceil(total));
    const voice = new Voice({ num_beats: num, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(vNotes);
    new Formatter().joinVoices([voice]).format([voice], sw - 50);
    voice.draw(ctx, stave);

    // After rendering, return per-note x-positions so callers can place overlays
    const positions = vNotes.map(sn => {
      try {
        const bb = sn.getBoundingBox();
        return { x: bb.x + bb.w / 2, y: bb.y, w: bb.w };
      } catch { return null; }
    });
    return positions;
  }

  /**
   * drawScrollingScore — render a wide staff for the continuous mode.
   * Returns { width, height, notePositions } where notePositions[i] = x-pixel of note i.
   */
  function drawScrollingScore(el, notes, options) {
    el.innerHTML = '';
    if (!window.Vex || !notes || !notes.length) return null;
    const opts = options || {};
    const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = Vex.Flow;

    // Width per beat — controls scroll speed feel
    const pxPerBeat = opts.pxPerBeat || 60;
    const totalBeats = totalCardBeats(notes);
    const leftPad = 80;   // space for clef + key sig
    const rightPad = 40;
    const w = Math.max(320, leftPad + rightPad + totalBeats * pxPerBeat);
    const h = opts.height || 160;

    const rndr = new Renderer(el, Renderer.Backends.SVG);
    rndr.resize(w, h);
    const ctx = rndr.getContext();
    ctx.setFont('Arial', 10);

    const stave = new Stave(0, Math.round(h * 0.18), w);
    stave.addClef(opts.clef || 'treble');
    if (opts.keySignature) stave.addKeySignature(opts.keySignature);
    if (opts.timeSignature) stave.addTimeSignature(opts.timeSignature);
    stave.setContext(ctx).draw();

    const vNotes = notes.map((note, i) => {
      const sn = new StaveNote({
        keys: [note.k], duration: note.d,
        clef: opts.clef || 'treble',
        auto_stem: true,
      });
      const m = note.k.match(/^([a-g])(#|b)?\//i);
      if (m && m[2]) sn.addModifier(new Accidental(m[2]));
      if (opts.colors && opts.colors[i]) {
        sn.setStyle({ fillStyle: opts.colors[i], strokeStyle: opts.colors[i] });
      }
      return sn;
    });

    const numBeats = Math.max(4, Math.ceil(totalBeats));
    const voice = new Voice({ num_beats: numBeats, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(vNotes);
    new Formatter().joinVoices([voice]).format([voice], w - leftPad - rightPad);
    voice.draw(ctx, stave);

    const positions = vNotes.map(sn => {
      try {
        const bb = sn.getBoundingBox();
        return { x: bb.x + bb.w / 2, y: bb.y, w: bb.w };
      } catch { return null; }
    });
    return { width: w, height: h, notePositions: positions };
  }

  /**
   * drawNoteTimeline — preserved from v1 for reveal-style summary.
   * canvas: HTMLCanvasElement
   * opts: { mode:'pitch'|'rhythm', notes, detected, bpm, inputDelay }
   */
  function drawNoteTimeline(canvas, opts) {
    if (!canvas) return;
    const { mode, notes, detected, bpm, inputDelay } = opts;
    if (!notes || !notes.length) { canvas.style.display = 'none'; return; }

    const isRhythm = mode === 'rhythm';
    const beatMs   = 60000 / (bpm || 80);
    const expBeats = cardBeatPositions(notes);
    const totalBeats = totalCardBeats(notes);
    const expMidis = notes.map(n => vexToMidi(n.k));
    const det      = (detected || []).filter(d => d.midi > 0);
    const detMidis = det.map(d => d.midi);
    const allMidis = [...expMidis, ...detMidis];
    if (!allMidis.length) { canvas.style.display = 'none'; return; }

    const midiMin = Math.min(...allMidis) - 2;
    const midiMax = Math.max(...allMidis) + 2;
    const midiSpan = midiMax - midiMin;

    const dpr  = window.devicePixelRatio || 1;
    const PAD  = { top: 18, right: 14, bottom: 28, left: 46 };
    const cssW = (canvas.parentElement?.clientWidth || 340);
    const cssH = Math.max(100, Math.min(200, midiSpan * 14 + PAD.top + PAD.bottom));
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const plotW = cssW - PAD.left - PAD.right;
    const plotH = cssH - PAD.top  - PAD.bottom;
    const xMax = isRhythm ? totalBeats + 0.4 : notes.length + 0.5;
    const xMin = isRhythm ? -0.2 : 0.25;
    const xS = v => PAD.left + ((v - xMin) / (xMax - xMin)) * plotW;
    const yS = m => PAD.top  + plotH - ((m - midiMin) / midiSpan) * plotH;

    // Grid + Y labels
    for (let m = Math.ceil(midiMin); m <= Math.floor(midiMax); m++) {
      const y = yS(m);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(160,160,160,0.7)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(midiToLabel(m), PAD.left - 4, y);
    }
    // X ticks
    const tickCount = isRhythm ? Math.ceil(totalBeats) + 1 : notes.length + 1;
    for (let i = 0; i < tickCount; i++) {
      const x = xS(isRhythm ? i : i + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + plotH + 4); ctx.stroke();
    }

    // Expected (green)
    const expPts = expBeats.map((beat, i) => ({
      x: xS(isRhythm ? beat + (DUR_BEATS[notes[i].d] ?? 1) * 0.5 : i + 1),
      y: yS(expMidis[i]),
      beat, dur: DUR_BEATS[notes[i].d] ?? 1, midi: expMidis[i],
    }));
    if (isRhythm) {
      expPts.forEach((p, i) => {
        const x0 = xS(expBeats[i]), x1 = xS(expBeats[i] + expPts[i].dur);
        ctx.save(); ctx.strokeStyle = 'rgba(74,222,128,0.28)'; ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, p.y); ctx.lineTo(x1, p.y); ctx.stroke(); ctx.restore();
      });
    }
    ctx.save(); ctx.strokeStyle = 'rgba(74,222,128,0.8)'; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    expPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke(); ctx.restore();
    expPts.forEach(p => {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    });

    // Detected (red) — apply inputDelay offset in rhythm mode
    if (det.length) {
      const redPts = det.map((d, i) => ({
        x: xS(isRhythm && d.ts !== null ? (d.ts - (inputDelay || 0)) / beatMs : i + 1),
        y: yS(d.midi),
      }));
      ctx.save(); ctx.strokeStyle = 'rgba(248,113,113,0.8)'; ctx.lineWidth = 2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      redPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke(); ctx.restore();
      redPts.forEach(p => {
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      });
    }

    // Legend
    const lx = PAD.left + 2, ly = 9;
    ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,180,180,0.85)'; ctx.font = '10px system-ui';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('expected', lx + 7, ly);
    if (det.length) {
      ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.arc(lx + 70, ly, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(180,180,180,0.85)';
      ctx.fillText('played', lx + 77, ly);
    }
    canvas.style.display = 'block';
  }

  SRF.Staff = { drawStaff, drawScrollingScore, drawNoteTimeline };
})();
