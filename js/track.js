/* ══════════════════════════════════════════════
   track.js — Track definitions, gating rules, defaults.
   Phase 1: only `adult-reader` is fully enabled. Others are listed
   in the picker so the architecture is visible, but greyed out.
══════════════════════════════════════════════ */
'use strict';

(function () {
  const SRF = (window.SRF = window.SRF || {});

  const TRACKS = [
    {
      id: 'adult-reader',
      name: 'Adult Sight-Reader',
      audience: 'Adult learner with prior music exposure',
      modes: ['continuous', 'pattern_spot', 'look_ahead', 'audiate', 'spaced_review'],
      defaults: {
        bpm: 70,
        clefMask: ['treble'],
        keySet: ['C', 'G', 'F'],
        phraseBars: 4,
        colorCoding: false,
        showSpanIndicator: true,
        sessionLengthBars: 32,
      },
      enabled: true,
    },
    {
      id: 'kid-rhythm-first',
      name: 'Kids: Rhythm & Patterns',
      audience: 'Children under 12, complete beginner',
      modes: ['rhythm_clap', 'pattern_spot', 'continuous'],
      defaults: {
        bpm: 80,
        clefMask: ['treble'],
        keySet: ['C'],
        phraseBars: 2,
        colorCoding: true,
        showSpanIndicator: false,
        sessionLengthBars: 16,
      },
      enabled: false,    // unlocks in Phase 3
    },
    {
      id: 'vocal-audiation',
      name: 'Singer / Audiator',
      audience: 'Any age, ear-training focus',
      modes: ['audiate', 'pattern_spot', 'continuous', 'spaced_review'],
      defaults: {
        bpm: 72,
        clefMask: ['treble'],
        keySet: ['C', 'G', 'D'],
        phraseBars: 4,
        colorCoding: false,
        showSpanIndicator: true,
        referenceToneOnAudiate: true,
        sessionLengthBars: 24,
      },
      enabled: false,
    },
    {
      id: 'theory-builder',
      name: 'Theory & Patterns',
      audience: 'Adult, intermediate+',
      modes: ['pattern_spot', 'look_ahead', 'spaced_review', 'continuous'],
      defaults: {
        bpm: 72,
        clefMask: ['treble', 'bass'],
        keySet: ['C', 'G', 'F', 'D', 'Bb'],
        phraseBars: 4,
        colorCoding: false,
        showSpanIndicator: true,
        sessionLengthBars: 32,
      },
      enabled: false,
    },
  ];

  function byId(id) { return TRACKS.find(t => t.id === id) || null; }
  function all()    { return TRACKS.slice(); }
  function enabled() { return TRACKS.filter(t => t.enabled); }

  /** Which modes are visible to this user right now? */
  function visibleModes(profile, gating) {
    const t = byId(profile?.trackId);
    if (!t) return ['continuous'];
    const unlocked = (gating && gating.unlocked) || ['continuous'];
    return t.modes.filter(m => unlocked.includes(m));
  }

  /** Switch the active track for this profile, preserving history. */
  function switchTrack(profile, settings, gating, newTrackId) {
    const t = byId(newTrackId);
    if (!t) return false;
    const now = Date.now();
    profile.trackId = newTrackId;
    profile.trackHistory = (profile.trackHistory || []).concat([{ trackId: newTrackId, switchedAt: now }]);
    Object.assign(settings, t.defaults);
    gating.unlocked = ['continuous'];   // reset gating on track switch
    gating.unlockHistory = (gating.unlockHistory || []).concat([{ at: now, reason: 'track-switch' }]);
    return true;
  }

  /** Apply a track's defaults onto the supplied settings object (in-place). */
  function applyDefaults(settings, trackId) {
    const t = byId(trackId);
    if (!t) return;
    Object.assign(settings, t.defaults);
  }

  SRF.Track = { all, enabled, byId, visibleModes, switchTrack, applyDefaults };
})();
