/* ══════════════════════════════════════════════
   store.js — localStorage v2 schema and API
   Namespace: srf_v2:<domain>
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { uuid } = SRF.Util;

  const NS = 'srf_v2:';
  const SCHEMA_VERSION = 2;
  const SESSION_CAP = 200;

  const DOMAINS = {
    META:     NS + 'meta',
    PROFILE:  NS + 'profile',
    SETTINGS: NS + 'settings',
    MASTERY:  NS + 'mastery',
    SRS:      NS + 'srs',
    SESSIONS: NS + 'sessions',
    GATING:   NS + 'gating',
  };

  /* ── default factories ── */
  function defaultMeta() {
    return { version: SCHEMA_VERSION, createdAt: Date.now(), lastOpenedAt: Date.now(), schemaMigratedFrom: null };
  }
  function defaultProfile() {
    return {
      id: uuid(),
      ageBand: null,                  // 'under-12' | 'teen' | 'adult'
      experience: null,               // 'none' | 'some' | 'intermediate' | 'advanced'
      goal: null,                     // 'read-at-sight' | 'sing-read' | 'theory' | 'general'
      trackId: null,                  // null until onboarding picks one
      trackHistory: [],               // [{ trackId, switchedAt }]
      inputDelayMs: 0,                // measured by calibration
      micGranted: false,
      onboarded: false,
    };
  }
  function defaultSettings() {
    return {
      bpm: 70,
      clefMask: ['treble'],
      keySet: ['C', 'G', 'F'],
      phraseBars: 4,
      colorCoding: false,
      referenceToneOnAudiate: true,
      showSpanIndicator: true,
      soundOn: true,
      sessionLengthBars: 32,
    };
  }
  function defaultMastery()  { return {}; }
  function defaultSrs()      { return { due: [], buried: [], leitner: {} }; }
  function defaultSessions() { return []; }
  function defaultGating()   { return { unlocked: ['continuous'], unlockHistory: [] }; }

  const DEFAULTS = {
    [DOMAINS.META]:     defaultMeta,
    [DOMAINS.PROFILE]:  defaultProfile,
    [DOMAINS.SETTINGS]: defaultSettings,
    [DOMAINS.MASTERY]:  defaultMastery,
    [DOMAINS.SRS]:      defaultSrs,
    [DOMAINS.SESSIONS]: defaultSessions,
    [DOMAINS.GATING]:   defaultGating,
  };

  /* ── core read/write ── */
  function safeParse(raw) {
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function readKey(key) {
    return safeParse(localStorage.getItem(key));
  }
  function writeKey(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      // Quota exceeded — drop oldest sessions then retry once
      if (key === DOMAINS.SESSIONS) return false;
      try {
        const sessions = readKey(DOMAINS.SESSIONS) || [];
        const trimmed = sessions.slice(-Math.floor(sessions.length / 2));
        localStorage.setItem(DOMAINS.SESSIONS, JSON.stringify(trimmed));
        localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch {
        console.warn('[store] quota exceeded, write failed:', key);
        return false;
      }
    }
  }

  function get(domain) {
    const v = readKey(domain);
    if (v != null) return v;
    const factory = DEFAULTS[domain];
    if (!factory) return null;
    const fresh = factory();
    writeKey(domain, fresh);
    return fresh;
  }
  function set(domain, val) { return writeKey(domain, val); }
  function patch(domain, partial) {
    const cur = get(domain) || {};
    const next = Array.isArray(cur) ? cur.slice() : { ...cur, ...partial };
    return set(domain, next);
  }

  /* ── sessions ── */
  function appendSession(session) {
    const list = get(DOMAINS.SESSIONS) || [];
    list.push(session);
    while (list.length > SESSION_CAP) list.shift();
    return set(DOMAINS.SESSIONS, list);
  }

  /* ── mastery (Phase-1 stub; Elo update added in Phase-2 mastery.js) ── */
  function bumpMastery(patternId, correct, latencyMs) {
    const m = get(DOMAINS.MASTERY) || {};
    const cur = m[patternId] || { rating: 1000, attempts: 0, correct: 0, lastSeen: 0, due: 0 };
    cur.attempts++;
    if (correct) cur.correct++;
    cur.lastSeen = Date.now();
    m[patternId] = cur;
    set(DOMAINS.MASTERY, m);
    return cur;
  }

  /* ── export / import ── */
  function exportJSON() {
    const out = { schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), data: {} };
    for (const k of Object.values(DOMAINS)) {
      out.data[k] = readKey(k);
    }
    return JSON.stringify(out, null, 2);
  }
  function importJSON(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !parsed.data) return false;
      for (const k of Object.keys(parsed.data)) {
        if (Object.values(DOMAINS).includes(k)) {
          writeKey(k, parsed.data[k]);
        }
      }
      return true;
    } catch (e) {
      console.warn('[store] import failed', e);
      return false;
    }
  }

  /* ── migrate from older schemas ── */
  function migrate() {
    const meta = readKey(DOMAINS.META);
    // v1 had no namespace prefix; clear any leftover legacy keys silently
    const legacyKeys = ['ST', 'sightread.profile'];
    for (const k of legacyKeys) {
      try { localStorage.removeItem(k); } catch {}
    }
    if (!meta) {
      // First-run init
      get(DOMAINS.META);
      get(DOMAINS.PROFILE);
      get(DOMAINS.SETTINGS);
      get(DOMAINS.MASTERY);
      get(DOMAINS.SRS);
      get(DOMAINS.SESSIONS);
      get(DOMAINS.GATING);
      return;
    }
    if (meta.version < SCHEMA_VERSION) {
      // Future migrations slot in here
      meta.schemaMigratedFrom = meta.version;
      meta.version = SCHEMA_VERSION;
      writeKey(DOMAINS.META, meta);
    }
  }

  function reset() {
    for (const k of Object.values(DOMAINS)) {
      try { localStorage.removeItem(k); } catch {}
    }
  }

  function bumpLastOpened() {
    const meta = get(DOMAINS.META);
    meta.lastOpenedAt = Date.now();
    set(DOMAINS.META, meta);
  }

  SRF.Store = {
    DOMAINS,
    get, set, patch,
    appendSession, bumpMastery,
    exportJSON, importJSON,
    migrate, reset, bumpLastOpened,
  };
})();
