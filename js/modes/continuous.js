/* ══════════════════════════════════════════════
   modes/continuous.js — never-stop scrolling reader (Phase-1 keystone)

   How it works:
   - Generate N notes (sessionLengthBars * 4 quarters as default)
   - Render the score wide via Staff.drawScrollingScore()
   - Translate the SVG horizontally so the play-line stays at a fixed x
   - Click track plays beats; each beat advances the play position
   - Mic notes are matched to the *current* expected note within ±0.5 beat
   - Beats-kept = beats with at least one correct (or any) detected note
   - NEVER stop. Errors flash red on the note but the staff keeps scrolling.
   - Eye-hand-span overlay: translucent gradient from play-line to N notes ahead
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { $, vexToMidi, RANGE_KEYS, noteMatch, cardBeatPositions, totalCardBeats } = SRF.Util;

  // Continuous-mode state (transient; only valid while mode is active)
  let state = null;

  function generateNotes(opts) {
    const lo = opts.lowMidi != null ? opts.lowMidi : vexToMidi('c/4');
    const hi = opts.highMidi != null ? opts.highMidi : vexToMidi('c/5');
    const pool = RANGE_KEYS.filter(k => {
      const m = vexToMidi(k);
      return m >= lo && m <= hi;
    });
    const src = pool.length >= 2 ? pool : RANGE_KEYS;
    const total = opts.beatCount || 32;
    const notes = [];
    let prev = -1;
    for (let i = 0; i < total; i++) {
      let idx;
      do { idx = Math.floor(Math.random() * src.length); } while (idx === prev && src.length > 1);
      prev = idx;
      notes.push({ k: src[idx], d: 'q' });
    }
    return notes;
  }

  function enter(cfg) {
    const settings = SRF.Store.get(SRF.Store.DOMAINS.SETTINGS);
    const profile  = SRF.Store.get(SRF.Store.DOMAINS.PROFILE);

    const bpm = cfg.bpm || settings.bpm || 70;
    const bars = cfg.lengthBars || settings.sessionLengthBars || 32;
    const beatsPerBar = 4;
    const beatCount = bars * beatsPerBar;
    const beatMs = 60000 / bpm;

    const notes = generateNotes({ beatCount });
    const expBeats = cardBeatPositions(notes);
    const expMidis = notes.map(n => vexToMidi(n.k));

    state = {
      notes, expBeats, expMidis,
      bpm, beatMs,
      currentBeat: 0,
      playStartMs: 0,
      noteHits: new Array(notes.length).fill(false),
      beatHits: new Array(beatCount).fill(false),
      detected: [],     // { midi, ts }
      noteColors: new Array(notes.length).fill(null),
      paused: false,
      ended: false,
      rafId: null,
      sessionId: SRF.Util.uuid(),
      startedAt: Date.now(),
      inputDelay: profile?.inputDelayMs || 0,
      spanTarget: settings.showSpanIndicator ? 4 : 0,  // notes ahead to highlight
    };

    // Build UI
    setupUi();

    // Render the scrolling score
    const scoreEl = $('cont-score');
    const layout = SRF.Staff.drawScrollingScore(scoreEl, notes, {
      clef: 'treble',
      pxPerBeat: 70,
      height: 160,
    });
    state.layout = layout;
    if (!layout) {
      console.warn('[continuous] failed to render score');
      $('cont-status').textContent = 'Render error — VexFlow not loaded?';
      return;
    }

    // Position the score so the first note sits at the play-line (40% from left)
    const wrap = $('cont-score-wrap');
    const playLineX = wrap.clientWidth * 0.40;
    state.playLineX = playLineX;
    state.scoreOffset = playLineX - (layout.notePositions[0]?.x || 80);
    scoreEl.style.transform = `translateX(${state.scoreOffset}px)`;

    // Position the play-line div
    const playLine = $('cont-playline');
    playLine.style.left = `${playLineX}px`;

    // Span overlay
    updateSpanOverlay();

    // Stats display
    updateStats();

    // Wait until mic is ready (it should already be initialised in app.js)
    if (!SRF.Audio.isReady()) {
      $('cont-status').textContent = 'Microphone not available — staff will scroll without scoring.';
    } else {
      $('cont-status').textContent = 'Get ready…';
    }

    // Start click track — pre-count of 4 beats
    const PRE = 4;
    state.playStartMs = SRF.Audio.startClickTrack(bpm, PRE, beatCount * beatMs + 1000, (idx, isPre) => {
      if (state.ended) return;
      if (isPre) {
        $('cont-status').textContent = `Pre-count: ${PRE - idx}`;
        return;
      }
      const m = idx - PRE;
      if (m === 0) $('cont-status').textContent = 'Read! Never stop.';
      // Beat advanced — check if previous beat was hit
      if (m > 0 && !state.beatHits[m - 1]) {
        // missed beat — flash red on the note that was due at m-1
        flashMissedBeat(m - 1);
      }
      state.currentBeat = m;
      if (m >= beatCount) {
        finishSession();
        return;
      }
    });

    // Start mic detection — start ~200ms before play to warm stability gate
    const micDelay = Math.max(0, state.playStartMs - 200 - Date.now());
    state.micTO = setTimeout(() => {
      state.micTO = null;
      if (!SRF.Audio.isReady()) return;
      SRF.Audio.start((midi) => {
        if (state.ended) return;
        const ts = Date.now() - state.playStartMs;
        if (ts < -300) return;   // before play started
        state.detected.push({ midi, ts });
        evaluateDetection(midi, ts);
      });
    }, micDelay);

    // Start RAF loop for scroll animation + UI updates
    requestRaf();

    // Wire quit button
    $('btn-cont-quit').onclick = () => {
      state.ended = true;
      finishSession(true);
    };
  }

  function setupUi() {
    // Reset DOM in case mode is re-entered
    $('cont-score-wrap').classList.remove('hidden');
    $('cont-status').textContent = '';
    $('cont-stats').textContent  = '';
    $('cont-playline').style.background = '';
  }

  function updateSpanOverlay() {
    const overlay = $('cont-span-overlay');
    if (!state.layout || !overlay) return;
    if (state.spanTarget <= 0) { overlay.style.display = 'none'; return; }
    overlay.style.display = '';
    // We compute span x range in *world* coords (relative to score svg);
    // then translate to screen coords using current scoreOffset.
    const beatPx = 70;  // matches drawScrollingScore pxPerBeat
    const spanBeatsAhead = state.spanTarget;
    const playWorldX = state.layout.notePositions[Math.min(state.currentBeat, state.notes.length - 1)]?.x;
    if (playWorldX == null) return;
    const aheadIdx = Math.min(state.notes.length - 1, state.currentBeat + spanBeatsAhead);
    const aheadWorldX = state.layout.notePositions[aheadIdx]?.x;
    if (aheadWorldX == null) return;
    const startScreenX = playWorldX + state.scoreOffset;
    const endScreenX   = aheadWorldX + state.scoreOffset;
    overlay.style.left  = `${startScreenX}px`;
    overlay.style.width = `${Math.max(0, endScreenX - startScreenX)}px`;
  }

  function evaluateDetection(midi, tsMs) {
    // Translate ts to beat position with input-delay correction
    const beatPos = (tsMs - state.inputDelay) / state.beatMs;
    // Match to closest expected note within ±0.5 beat window
    let bestI = -1, bestAbs = Infinity;
    for (let i = 0; i < state.notes.length; i++) {
      if (state.noteHits[i]) continue;
      const d = Math.abs(beatPos - state.expBeats[i]);
      if (d < bestAbs && d < 0.5) { bestAbs = d; bestI = i; }
    }
    if (bestI < 0) return;
    const correctPitch = noteMatch(midi, state.expMidis[bestI]);
    state.noteHits[bestI] = true;
    state.beatHits[Math.floor(state.expBeats[bestI])] = correctPitch;
    state.noteColors[bestI] = correctPitch ? '#059669' : '#dc2626';
    // Note: we don't redraw the score mid-session — that would jump the scroll position
    // and interrupt the "never-stop" focus. Errors are surfaced at session-end via the
    // timeline graph, plus the brief flash indicator below.
    flashNoteIndicator(bestI, correctPitch);
    updateStats();
  }

  function flashMissedBeat(beatIdx) {
    // Mark missed beats internally; visualisation deferred to session-end timeline.
    for (let i = 0; i < state.notes.length; i++) {
      if (Math.floor(state.expBeats[i]) === beatIdx && !state.noteHits[i]) {
        state.noteHits[i] = true;
        state.noteColors[i] = '#dc2626';
        state.beatHits[beatIdx] = false;
      }
    }
  }

  function flashNoteIndicator(noteIdx, correct) {
    const ind = $('cont-flash');
    if (!ind) return;
    ind.textContent = correct ? '✓' : '✗';
    ind.style.color = correct ? '#4ade80' : '#f87171';
    ind.classList.remove('pop');
    void ind.offsetWidth;
    ind.classList.add('pop');
  }

  function updateStats() {
    const total = state.beatHits.length;
    const kept = state.beatHits.filter(Boolean).length;
    const pct = total > 0 ? Math.round(100 * kept / total) : 0;
    const cur = state.currentBeat;
    $('cont-stats').innerHTML =
      `<span>Beat ${cur}/${total}</span><span>Beats kept: ${kept} (${pct}%)</span>`;
  }

  function requestRaf() {
    function tick() {
      if (state.ended) return;
      // Compute current beat with sub-beat precision based on wall-clock
      const now = Date.now();
      const elapsed = now - state.playStartMs;
      const subBeat = elapsed / state.beatMs;
      // Animate scroll — keep current play position aligned with playLineX
      if (state.layout && subBeat >= 0) {
        // Linearly interpolate world-x between adjacent note positions
        const i = Math.max(0, Math.min(state.notes.length - 1, Math.floor(subBeat)));
        const j = Math.min(state.notes.length - 1, i + 1);
        const t = Math.min(1, Math.max(0, subBeat - i));
        const xa = state.layout.notePositions[i]?.x ?? 0;
        const xb = state.layout.notePositions[j]?.x ?? xa;
        const playWorldX = xa + (xb - xa) * t;
        state.scoreOffset = state.playLineX - playWorldX;
        $('cont-score').style.transform = `translateX(${state.scoreOffset}px)`;
        updateSpanOverlay();
      }
      state.rafId = requestAnimationFrame(tick);
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function finishSession(quitEarly) {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    SRF.Audio.stop();
    SRF.Audio.stopClickTrack();
    if (state.micTO) { clearTimeout(state.micTO); state.micTO = null; }
    state.ended = true;

    const total = state.beatHits.length;
    const kept = state.beatHits.filter(Boolean).length;
    const summary = {
      beatsTotal: total,
      beatsKept: kept,
      accuracy: total > 0 ? kept / total : 0,
      notes: state.notes.length,
      detected: state.detected.length,
      quitEarly: !!quitEarly,
    };

    // Persist session
    SRF.Store.appendSession({
      id: state.sessionId,
      startedAt: state.startedAt,
      endedAt: Date.now(),
      trackId: SRF.Store.get(SRF.Store.DOMAINS.PROFILE)?.trackId,
      modeId: 'continuous',
      cfg: { bpm: state.bpm, lengthBars: total / 4 },
      summary,
      attempts: [],   // Phase-2: per-pattern attempts go here
    });

    // Hand off to session-end screen
    SRF.Router.show('session-end', {
      modeId: 'continuous',
      summary,
      notes: state.notes,
      detected: state.detected,
      bpm: state.bpm,
      inputDelay: state.inputDelay,
      noteColors: state.noteColors.slice(),
    });
  }

  function exit() {
    if (!state) return;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    SRF.Audio.stop();
    SRF.Audio.stopClickTrack();
    if (state.micTO) { clearTimeout(state.micTO); state.micTO = null; }
    state.ended = true;
    state = null;
  }

  function summarize() {
    if (!state) return null;
    const total = state.beatHits.length;
    const kept  = state.beatHits.filter(Boolean).length;
    return { beatsTotal: total, beatsKept: kept, accuracy: total ? kept/total : 0 };
  }

  // Register
  document.addEventListener('DOMContentLoaded', () => {
    SRF.Modes.register('continuous', { enter, exit, summarize });
  });
})();
