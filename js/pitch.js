/* ══════════════════════════════════════════════
   pitch.js — autocorrelation pitch detection
   Carry-over from v1 monolith. Single function, no state.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});

  /**
   * detectPitch
   * @param {Float32Array} buf — time-domain audio buffer (mono, -1..1)
   * @param {number} sr — sample rate (Hz)
   * @returns {number} fundamental frequency in Hz, or -1 if unvoiced/silence
   */
  function detectPitch(buf, sr) {
    const n = buf.length;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.018) return -1;                       // silence gate

    const minP = Math.max(1, Math.floor(sr / 2100));   // ~C7
    const maxP = Math.min(n - 1, Math.floor(sr / 60)); // ~B1
    const cmp  = Math.min(n - maxP, 1024);

    let bestCorr = -Infinity, bestP = -1;
    for (let p = minP; p <= maxP; p++) {
      let c = 0;
      for (let i = 0; i < cmp; i++) c += buf[i] * buf[i + p];
      if (c > bestCorr) { bestCorr = c; bestP = p; }
    }
    if (bestP < 0 || bestCorr < 0.005) return -1;

    // Parabolic interpolation around peak for sub-sample precision
    const c0    = bestP > 0    ? autocorrAt(buf, bestP - 1, cmp) : bestCorr;
    const c2    = bestP < maxP ? autocorrAt(buf, bestP + 1, cmp) : bestCorr;
    const denom = c0 - 2 * bestCorr + c2;
    const ref   = denom !== 0 ? bestP - (c2 - c0) / (2 * denom) : bestP;
    return sr / ref;
  }

  function autocorrAt(buf, p, cmp) {
    let c = 0;
    for (let i = 0; i < cmp; i++) c += buf[i] * buf[i + p];
    return c;
  }

  SRF.Pitch = { detectPitch };
})();
