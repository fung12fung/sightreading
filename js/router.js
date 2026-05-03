/* ══════════════════════════════════════════════
   router.js — show/hide named screens, hash routing
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});

  // Each screen is registered with { id, onEnter(params), onExit() }
  const screens = new Map();
  let activeId = null;
  let activeExit = null;

  function register(id, hooks) {
    screens.set(id, hooks || {});
  }

  function show(id, params) {
    if (activeExit) {
      try { activeExit(); } catch (e) { console.warn('[router] exit error', e); }
      activeExit = null;
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const elem = document.getElementById('s-' + id);
    if (elem) elem.classList.add('active');

    const def = screens.get(id);
    if (def && typeof def.onEnter === 'function') {
      try {
        const exit = def.onEnter(params || {});
        if (typeof exit === 'function') activeExit = exit;
        else if (def.onExit) activeExit = def.onExit;
      } catch (e) {
        console.error('[router] enter error', id, e);
      }
    }
    activeId = id;

    // Update hash for shareable state (deep links during dev)
    const hash = '#' + id;
    if (location.hash !== hash) {
      try { history.replaceState(null, '', hash); } catch {}
    }
  }

  function current() { return activeId; }

  SRF.Router = { register, show, current };
})();
