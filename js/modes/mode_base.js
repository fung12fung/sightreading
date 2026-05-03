/* ══════════════════════════════════════════════
   modes/mode_base.js — base lifecycle for all training modes
   Each mode registers an object via SRF.Modes.register(id, modeDef)
   where modeDef implements: enter(cfg), exit(), tick(dt) [optional],
   recordAttempt(payload) [optional], summarize() -> SessionSummary.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});

  const registry = new Map();
  let active = null;
  let activeCfg = null;

  function register(id, def) {
    if (!def || typeof def.enter !== 'function') {
      console.warn('[modes] register: missing enter()', id);
      return;
    }
    registry.set(id, def);
  }

  function get(id) { return registry.get(id) || null; }
  function ids()   { return Array.from(registry.keys()); }

  function enter(id, cfg) {
    if (active) exit();
    const def = registry.get(id);
    if (!def) { console.warn('[modes] unknown mode', id); return false; }
    active = def;
    activeCfg = cfg;
    try { def.enter(cfg || {}); } catch (e) { console.error('[mode] enter error', id, e); }
    return true;
  }

  function exit() {
    if (!active) return null;
    let summary = null;
    try { if (active.summarize) summary = active.summarize(); } catch (e) { console.warn(e); }
    try { if (active.exit) active.exit(); } catch (e) { console.warn(e); }
    active = null; activeCfg = null;
    return summary;
  }

  function activeMode() { return active; }

  SRF.Modes = { register, get, ids, enter, exit, active: activeMode };
})();
