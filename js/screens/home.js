/* ══════════════════════════════════════════════
   screens/home.js — main hub after onboarding
   Phase 1: single Continuous Reading entry point + status.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { $ } = SRF.Util;

  function onEnter() {
    const profile  = SRF.Store.get(SRF.Store.DOMAINS.PROFILE);
    const settings = SRF.Store.get(SRF.Store.DOMAINS.SETTINGS);
    const sessions = SRF.Store.get(SRF.Store.DOMAINS.SESSIONS) || [];
    const track    = SRF.Track.byId(profile.trackId);

    $('home-track').textContent  = track ? track.name : '—';
    $('home-bpm').textContent    = `${settings.bpm} BPM`;
    $('home-bars').textContent   = `${settings.sessionLengthBars} bars`;

    // Last session glance
    const last = sessions[sessions.length - 1];
    const lastEl = $('home-last');
    if (last) {
      const pct = Math.round(100 * (last.summary?.accuracy || 0));
      const date = new Date(last.startedAt).toLocaleDateString();
      lastEl.textContent = `Last session (${date}): ${pct}% beats kept`;
    } else {
      lastEl.textContent = 'No sessions yet — your first practice awaits.';
    }

    $('btn-home-practice').onclick = () => {
      // Ensure mic is initialised before entering continuous
      SRF.Audio.init().then(ok => {
        const profile = SRF.Store.get(SRF.Store.DOMAINS.PROFILE);
        profile.micGranted = !!ok;
        SRF.Store.set(SRF.Store.DOMAINS.PROFILE, profile);

        // If rhythm calibration hasn't been done yet, offer it once
        if (ok && (!profile.inputDelayMs || profile.inputDelayMs === 0)) {
          SRF.Calibrate.show({
            onComplete: ({ inputDelayMs }) => {
              profile.inputDelayMs = inputDelayMs;
              SRF.Store.set(SRF.Store.DOMAINS.PROFILE, profile);
              startPractice();
            },
            onCancel: () => startPractice(),
          });
        } else {
          startPractice();
        }
      });
    };

    $('btn-home-settings').onclick = () => {
      // Phase 1: settings is just a button to reset / re-onboard
      if (confirm('Reset profile and start over?')) {
        SRF.Store.reset();
        location.reload();
      }
    };
  }

  function startPractice() {
    SRF.Router.show('practice-continuous');
    SRF.Modes.enter('continuous', {});
  }

  document.addEventListener('DOMContentLoaded', () => {
    SRF.Router.register('home', { onEnter });
  });
})();
