/* ══════════════════════════════════════════════
   screens/session_end.js — post-session summary
   Shows beats-kept score, the note timeline graph, and Next/Quit options.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { $ } = SRF.Util;

  function onEnter(params) {
    const { summary, notes, detected, bpm, inputDelay } = params || {};
    const pct = Math.round(100 * (summary?.accuracy || 0));
    const kept = summary?.beatsKept ?? 0;
    const total = summary?.beatsTotal ?? 0;

    $('se-score-pct').textContent = `${pct}%`;
    $('se-score-detail').textContent = `${kept} / ${total} beats kept`;

    // Headline message based on accuracy
    let head = 'Keep going.';
    if (pct >= 90) head = 'Excellent — you held tempo through nearly everything.';
    else if (pct >= 75) head = 'Strong reading. Eye-hand span is working.';
    else if (pct >= 50) head = 'Solid foundation. Try slowing the BPM and reading further ahead.';
    else if (summary?.quitEarly) head = 'Quit early — your progress was still saved.';
    $('se-headline').textContent = head;

    // Render the note timeline graph
    requestAnimationFrame(() => {
      SRF.Staff.drawNoteTimeline($('se-timeline-canvas'), {
        mode: 'rhythm',     // continuous mode is rhythm-style (notes have ts)
        notes, detected, bpm,
        inputDelay: inputDelay || 0,
      });
    });

    $('btn-se-again').onclick = () => {
      SRF.Router.show('practice-continuous');
      SRF.Modes.enter('continuous', {});
    };
    $('btn-se-home').onclick = () => {
      SRF.Router.show('home');
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    SRF.Router.register('session-end', { onEnter });
  });
})();
