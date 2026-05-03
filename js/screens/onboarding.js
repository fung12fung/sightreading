/* ══════════════════════════════════════════════
   screens/onboarding.js — first-launch flow
   Phase 1: simplified to track picker + 1-question profile.
   Phase 3 will expand to full age/experience/goal questionnaire.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { $, $$, el } = SRF.Util;

  function onEnter() {
    const list = $('ob-track-list');
    list.innerHTML = '';
    SRF.Track.all().forEach(t => {
      const card = el('div', { class: 'ob-track-card' + (t.enabled ? '' : ' disabled') });
      card.appendChild(el('div', { class: 'ob-track-name' }, t.name));
      card.appendChild(el('div', { class: 'ob-track-aud'  }, t.audience));
      if (!t.enabled) {
        card.appendChild(el('div', { class: 'ob-track-soon' }, 'Coming soon'));
      } else {
        card.dataset.trackId = t.id;
        card.addEventListener('click', () => {
          $$('.ob-track-card', list).forEach(c => c.classList.remove('sel'));
          card.classList.add('sel');
          $('btn-ob-continue').disabled = false;
        });
      }
      list.appendChild(card);
    });

    $('btn-ob-continue').disabled = true;
    $('btn-ob-continue').onclick = () => {
      const sel = list.querySelector('.ob-track-card.sel');
      if (!sel) return;
      const trackId = sel.dataset.trackId;

      // Update profile + apply track defaults
      const profile  = SRF.Store.get(SRF.Store.DOMAINS.PROFILE);
      const settings = SRF.Store.get(SRF.Store.DOMAINS.SETTINGS);
      const gating   = SRF.Store.get(SRF.Store.DOMAINS.GATING);

      profile.trackId = trackId;
      profile.trackHistory = (profile.trackHistory || []).concat([{ trackId, switchedAt: Date.now() }]);
      profile.ageBand = profile.ageBand || 'adult';
      profile.experience = profile.experience || 'some';
      profile.goal = profile.goal || 'read-at-sight';
      profile.onboarded = true;

      SRF.Track.applyDefaults(settings, trackId);
      gating.unlocked = ['continuous'];   // Phase 1 only enables continuous

      SRF.Store.set(SRF.Store.DOMAINS.PROFILE,  profile);
      SRF.Store.set(SRF.Store.DOMAINS.SETTINGS, settings);
      SRF.Store.set(SRF.Store.DOMAINS.GATING,   gating);

      SRF.Router.show('home');
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    SRF.Router.register('onboarding', { onEnter });
  });
})();
