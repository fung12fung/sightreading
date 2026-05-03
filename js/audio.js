/* ══════════════════════════════════════════════
   audio.js — mic capture, pitch polling, click track, recording stub
   Carry-over from v1 monolith with added MediaRecorder hook.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});
  const { detectPitch } = SRF.Pitch;

  let actx, analyser, src, stream;
  let pollId = null;
  let lastMidi = -1, stableCount = 0;
  const STABLE = 2;
  let clickIds = [];

  // Recording state
  let recorder = null;
  let recordedChunks = [];

  /* ── init mic ── */
  async function init() {
    if (actx) return !!analyser;
    try {
      stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      actx     = new (window.AudioContext || window.webkitAudioContext)();
      analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.4;
      src = actx.createMediaStreamSource(stream);
      src.connect(analyser);
      return true;
    } catch (e) {
      console.warn('[audio] init failed', e);
      return false;
    }
  }

  function isReady() { return !!analyser; }
  function ctxTime() { return actx ? actx.currentTime : 0; }

  /* ── pitch polling ──
     onNote(midi, midiRaw) fires when stable pitch detected; also re-fires on
     re-attack of the same note (energy dip then surge >200ms apart).
  */
  function start(onNote) {
    stop();
    if (!analyser) return;
    lastMidi = -1; stableCount = 0;

    let noteFired = false, fireRms = 0, minRms = Infinity, lastFireTime = 0;
    const buf = new Float32Array(analyser.fftSize);

    function doPoll() {
      analyser.getFloatTimeDomainData(buf);

      let sq = 0;
      for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i];
      const rms = Math.sqrt(sq / buf.length);

      const hz      = detectPitch(buf, actx.sampleRate);
      const midiRaw = hz > 0 ? (12 * Math.log2(hz / 440) + 69) : -1;
      const midi    = midiRaw > 0 ? Math.round(midiRaw) : -1;

      if (midi > 0 && midi === lastMidi) {
        if (!noteFired) {
          stableCount++;
          if (stableCount >= STABLE) {
            noteFired = true; fireRms = rms; minRms = rms; lastFireTime = Date.now();
            onNote(midi, midiRaw);
          }
        } else {
          minRms = Math.min(minRms, rms);
          if (minRms < fireRms * 0.75 && rms > minRms * 1.5 && Date.now() - lastFireTime > 200) {
            fireRms = rms; minRms = rms; lastFireTime = Date.now();
            onNote(midi, midiRaw);
          }
        }
      } else {
        lastMidi = midi; stableCount = 0; noteFired = false; minRms = Infinity;
      }
    }
    pollId = setInterval(doPoll, 60);
  }

  function stop() {
    if (pollId) { clearInterval(pollId); pollId = null; }
  }

  /* ── metronome click ── */
  function scheduleClick(t, accent) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.connect(env); env.connect(actx.destination);
    osc.type = 'sine';
    osc.frequency.value = accent ? 1400 : 900;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(accent ? 0.55 : 0.35, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    osc.start(t); osc.stop(t + 0.08);
  }

  /* ── start click track, returns wall-clock ms of play-phase start ── */
  function startClickTrack(bpm, preBeats, listenMs, onBeat) {
    stopClickTrack();
    if (!actx) return Date.now();

    const beatSec   = 60 / bpm;
    const playBeats = Math.ceil(listenMs / 1000 / beatSec) + 2;
    const total     = preBeats + playBeats;
    const t0        = actx.currentTime + 0.08;

    for (let i = 0; i < total; i++) {
      const t = t0 + i * beatSec;
      scheduleClick(t, i % 4 === 0);
      const delayMs = (t - actx.currentTime) * 1000;
      clickIds.push(setTimeout(() => onBeat(i, i < preBeats), delayMs));
    }

    const playStartAudio = t0 + preBeats * beatSec;
    return Date.now() + (playStartAudio - actx.currentTime) * 1000;
  }

  function stopClickTrack() {
    clickIds.forEach(id => clearTimeout(id));
    clickIds = [];
  }

  /* ── reference tone (for audiation mode, also useful as ear-prime) ── */
  function playTone(midi, durSec) {
    if (!actx || midi < 0) return;
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    const t  = actx.currentTime + 0.02;
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.connect(env); env.connect(actx.destination);
    osc.type = 'triangle';
    osc.frequency.value = hz;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.25, t + 0.02);
    env.gain.linearRampToValueAtTime(0.18, t + durSec - 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, t + durSec);
    osc.start(t); osc.stop(t + durSec + 0.02);
  }

  /* ── Recording stub for future use (Phase-4 hook) ── */
  function startRecording() {
    if (!stream) return false;
    if (typeof MediaRecorder === 'undefined') return false;
    try {
      recordedChunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
      recorder.start();
      return true;
    } catch { return false; }
  }
  async function stopRecording() {
    if (!recorder) return null;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: recorder.mimeType || 'audio/webm' });
        recorder = null;
        resolve(blob);
      };
      recorder.stop();
    });
  }

  SRF.Audio = {
    init, isReady, ctxTime,
    start, stop,
    startClickTrack, stopClickTrack,
    playTone,
    startRecording, stopRecording,
  };
})();
