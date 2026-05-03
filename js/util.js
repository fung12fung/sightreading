/* ══════════════════════════════════════════════
   util.js — shared constants, music helpers, DOM helpers
   Carry-over from v1 monolith. No app state in here.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});

  /* ── Music constants ── */
  const BPM_MIN = 40, BPM_MAX = 200;
  const DUR_BEATS = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 };

  const SEMI      = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const SEMI_NAME = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  // White-key range covering common piano sight-reading territory
  const RANGE_KEYS = [
    'c/2','d/2','e/2','f/2','g/2','a/2','b/2',
    'c/3','d/3','e/3','f/3','g/3','a/3','b/3',
    'c/4','d/4','e/4','f/4','g/4','a/4','b/4',
    'c/5','d/5','e/5','f/5','g/5','a/5','b/5',
    'c/6',
  ];

  /* ── Music helpers ── */
  function vexToMidi(key) {
    const [n, o] = key.split('/');
    const s = SEMI[n.toLowerCase()];
    return s !== undefined ? s + (parseInt(o) + 1) * 12 : -1;
  }
  function freqToMidi(hz) {
    if (hz <= 0 || !isFinite(hz)) return -1;
    return Math.round(12 * Math.log2(hz / 440) + 69);
  }
  function midiToLabel(m) {
    if (m < 0) return '?';
    return SEMI_NAME[m % 12] + (Math.floor(m / 12) - 1);
  }
  function midiToVexKey(m) {
    if (m < 0) return null;
    const pc = m % 12;
    const oct = Math.floor(m / 12) - 1;
    // Map sharps to flat-friendly natural-or-sharp Vex keys
    const tbl = ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'];
    return `${tbl[pc]}/${oct}`;
  }
  function noteMatch(a, b) { return Math.abs(a - b) < 0.5; }   // ±½ semitone

  /**
   * rhythmMatch — relies on caller-supplied inputDelay rather than reaching into global state.
   * @param {number} tsMs — wall-clock ms from play-start when note detected
   * @param {number} expectedBeat — beat position (0-indexed, can be fractional)
   * @param {number} bpm
   * @param {number} inputDelayMs — calibration offset to subtract from tsMs
   */
  function rhythmMatch(tsMs, expectedBeat, bpm, inputDelayMs) {
    const beatMs = 60000 / bpm;
    const adj = tsMs - (inputDelayMs || 0);
    return Math.abs(adj / beatMs - expectedBeat) < 0.30;       // ±0.3 beat tolerance
  }

  function cardBeatPositions(notes) {
    let pos = 0;
    return notes.map(n => { const p = pos; pos += DUR_BEATS[n.d] ?? 1; return p; });
  }
  function totalCardBeats(notes) {
    return notes.reduce((s, n) => s + (DUR_BEATS[n.d] ?? 1), 0);
  }

  /* ── DOM helpers ── */
  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'style' && typeof props[k] === 'object') Object.assign(e.style, props[k]);
        else if (k.startsWith('on') && typeof props[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), props[k]);
        else if (k === 'html') e.innerHTML = props[k];
        else if (k in e) e[k] = props[k];
        else e.setAttribute(k, props[k]);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /* ── exports ── */
  SRF.Util = {
    // constants
    BPM_MIN, BPM_MAX, DUR_BEATS, SEMI, SEMI_NAME, RANGE_KEYS,
    // music
    vexToMidi, freqToMidi, midiToLabel, midiToVexKey,
    noteMatch, rhythmMatch, cardBeatPositions, totalCardBeats,
    // dom
    $, $$, el, clamp, uuid,
  };
})();
