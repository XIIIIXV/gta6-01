// save.js — NEON BAY save / load (round 6).
// Persists money, the next mission to play, kills and total time to
// localStorage. Best times live separately (BEST_TIMES_KEY in render.js).
// Every function is guarded: storage may be unavailable (private mode,
// judge sandbox) and the game must never break over a save.

import { SAVE_KEY } from './config.js';

// The save shape: { money, missionIndex, kills, totalTime, savedAt }.
// missionIndex is the NEXT mission to play (0-based). A save with
// missionIndex >= MISSIONS.length means the story is done — the caller
// treats that as "no continue" and starts a new game instead.
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    if (typeof d.money !== 'number' || typeof d.missionIndex !== 'number') return null;
    return {
      money: Math.max(0, Math.floor(d.money)),
      missionIndex: Math.max(0, Math.floor(d.missionIndex)),
      kills: typeof d.kills === 'number' ? Math.max(0, Math.floor(d.kills)) : 0,
      totalTime: typeof d.totalTime === 'number' ? Math.max(0, d.totalTime) : 0,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    };
  } catch (e) {
    return null;
  }
}

export function saveGame(world) {
  try {
    // missionIndex is the NEXT mission to play. When the current mission is
    // done, the next one is missionIndex + 1 (the cooldown that starts it
    // has not fired yet at save time).
    const nextMission = (world.mission && world.mission.done) ? world.missionIndex + 1 : world.missionIndex;
    const d = {
      money: Math.max(0, Math.floor(world.player?.money || 0)),
      missionIndex: Math.max(0, Math.floor(nextMission || 0)),
      kills: Math.max(0, Math.floor(world.stats?.kills || 0)),
      totalTime: Math.max(0, world.totalTime || 0),
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // Storage is best-effort.
  }
}
