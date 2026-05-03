/* ══════════════════════════════════════════════
   app.js — boot: migrate store, decide first screen, register practice screen.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { $ } = SRF.Util;

  function boot() {
    // HTTPS warning banner — same logic as v1
    if (!window.isSecureContext) {
      const banner = $('https-warn');
      if (banner) banner.style.display = 'block';
    }

    // Migrate store (creates default domains if first run)
    SRF.Store.migrate();
    SRF.Store.bumpLastOpened();

    // Register the practice-continuous host screen (the mode owns its content)
    SRF.Router.register('practice-continuous', {
      onEnter() { /* mode_base handles content via continuous.enter() */ },
      onExit()  { SRF.Modes.exit(); },
    });
    // Calibration screen registered statically (already shown via SRF.Calibrate.show)
    SRF.Router.register('cal', { onEnter() {} });

    // Initial route
    const profile = SRF.Store.get(SRF.Store.DOMAINS.PROFILE);
    if (!profile.onboarded || !profile.trackId) {
      SRF.Router.show('onboarding');
    } else {
      SRF.Router.show('home');
    }

    // Silent mic pre-init: auto-grants on revisit when served over HTTPS
    if (window.isSecureContext) {
      SRF.Audio.init().then(ok => {
        const p = SRF.Store.get(SRF.Store.DOMAINS.PROFILE);
        p.micGranted = !!ok;
        SRF.Store.set(SRF.Store.DOMAINS.PROFILE, p);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
