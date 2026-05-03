/* ══════════════════════════════════════════════
   modes/calibrate.js — input-delay calibration
   Plays 6 click beats at fixed CAL_BPM=60. User taps any note on each beat.
   Median offset becomes profile.inputDelayMs.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { $ } = SRF.Util;

  const CAL_BPM  = 60;
  const CAL_PRE  = 2;
  const CAL_MEAS = 6;

  let calMicTO = null, calEndTO = null;
  let calOffsets = [];
  let calHitBeats = new Set();
  let calPlayStartMs = 0;
  let onComplete = null;
  let onCancel = null;

  function resetBeats() {
    for (let i = 0; i < CAL_MEAS; i++) {
      const e = $('cb' + i);
      if (e) e.className = 'cbeat';
    }
  }

  function show(opts) {
    onComplete = opts.onComplete || null;
    onCancel   = opts.onCancel   || null;

    SRF.Audio.stop();
    SRF.Audio.stopClickTrack();
    if (calMicTO) { clearTimeout(calMicTO); calMicTO = null; }
    if (calEndTO) { clearTimeout(calEndTO); calEndTO = null; }

    resetBeats();
    $('cal-progress').textContent = 'Ready — tap Start';
    $('cal-result').style.display = 'none';
    $('cal-intro').style.display  = '';

    const skipBtn   = $('btn-cal-skip');
    const actionBtn = $('btn-cal-action');
    skipBtn.textContent = 'Skip';
    skipBtn.onclick = () => { cleanup(); if (onCancel) onCancel(); };
    actionBtn.textContent = '▶ Start';
    actionBtn.disabled = false;
    actionBtn.onclick = start;

    SRF.Router.show('cal');
  }

  function start() {
    calOffsets = [];
    calHitBeats = new Set();
    resetBeats();
    $('cal-result').style.display = 'none';
    $('cal-intro').style.display  = 'none';
    $('cal-progress').textContent = 'Pre-count…';

    const actionBtn = $('btn-cal-action');
    actionBtn.disabled = true;
    actionBtn.textContent = '…';
    $('btn-cal-skip').onclick = () => {
      cleanup();
      if (onCancel) onCancel();
    };

    const beatMs = 60000 / CAL_BPM;

    function onBeat(beatIdx, isPrecount) {
      if (isPrecount) {
        $('cal-progress').textContent = `Pre-count: ${CAL_PRE - beatIdx}`;
        return;
      }
      const m = beatIdx - CAL_PRE;
      if (m >= CAL_MEAS) return;
      resetBeats();
      for (const h of calHitBeats) {
        const e = $('cb' + h);
        if (e) e.classList.add('hit');
      }
      if (!calHitBeats.has(m)) {
        const e = $('cb' + m);
        if (e) e.classList.add('active');
      }
      $('cal-progress').textContent = `Beat ${m + 1} / ${CAL_MEAS}`;
    }

    calPlayStartMs = SRF.Audio.startClickTrack(CAL_BPM, CAL_PRE, CAL_MEAS * beatMs + 500, onBeat);

    const calMicDelay = Math.max(0, calPlayStartMs - Math.round(beatMs * 0.4) - Date.now());
    calMicTO = setTimeout(() => {
      calMicTO = null;
      SRF.Audio.start((midi) => {
        const ts = Date.now() - calPlayStartMs;
        let bestBeat = -1, bestDiff = Infinity;
        for (let i = 0; i < CAL_MEAS; i++) {
          if (calHitBeats.has(i)) continue;
          const diff = Math.abs(ts - i * beatMs);
          if (diff < bestDiff && diff < beatMs * 0.9) { bestDiff = diff; bestBeat = i; }
        }
        if (bestBeat < 0) return;
        if (calOffsets.length >= CAL_MEAS) return;
        calHitBeats.add(bestBeat);
        const offset = Math.round(ts - bestBeat * beatMs);
        calOffsets.push(offset);
        resetBeats();
        for (const h of calHitBeats) {
          const e = $('cb' + h);
          if (e) e.classList.add('hit');
        }
        const cur = Math.min(CAL_MEAS - 1, Math.floor(ts / beatMs));
        if (!calHitBeats.has(cur)) {
          const e = $('cb' + cur);
          if (e) e.classList.add('active');
        }
      });
    }, calMicDelay);

    calEndTO = setTimeout(() => {
      calEndTO = null;
      SRF.Audio.stop();
      SRF.Audio.stopClickTrack();
      resetBeats();
      for (let i = 0; i < CAL_MEAS; i++) {
        const e = $('cb' + i);
        if (e) e.classList.add(calHitBeats.has(i) ? 'hit' : 'missed');
      }
      finish();
    }, (CAL_PRE + CAL_MEAS + 1) * beatMs + 300);
  }

  function finish() {
    const n = calOffsets.length;
    $('cal-progress').textContent = n > 0
      ? `Detected ${n} / ${CAL_MEAS} beats`
      : 'No notes detected — check microphone';

    let median = 0;
    if (n > 0) {
      const sorted = [...calOffsets].sort((a, b) => a - b);
      median = sorted[Math.floor(sorted.length / 2)];
    }
    $('cal-delay-val').textContent = n > 0 ? `${median}ms` : '—';
    $('cal-delay-val').className   = 'delay-val ' + (median < 500 ? 'ok' : 'warn');
    $('cal-delay-sub').textContent = n > 0
      ? (median < 500 ? 'Calibrated ✓' : 'High delay — results may vary')
      : 'No notes detected — check mic';
    $('cal-result').style.display = '';
    const actionBtn = $('btn-cal-action');
    actionBtn.disabled = false;
    actionBtn.textContent = 'Continue →';
    actionBtn.onclick = () => {
      cleanup();
      if (onComplete) onComplete({ inputDelayMs: median, detectedBeats: n });
    };
    const skipBtn = $('btn-cal-skip');
    skipBtn.textContent = '↩ Try again';
    skipBtn.onclick = () => start();
  }

  function cleanup() {
    SRF.Audio.stop();
    SRF.Audio.stopClickTrack();
    if (calMicTO) { clearTimeout(calMicTO); calMicTO = null; }
    if (calEndTO) { clearTimeout(calEndTO); calEndTO = null; }
  }

  SRF.Calibrate = { show };
})();
