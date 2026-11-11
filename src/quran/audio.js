// Qur'an recitation, verse by verse, so the reader can highlight the verse
// being recited. One player for the whole launcher: it keeps going when you
// leave the Qur'an page (a small "now reciting" chip shows on other pages).
import { useSyncExternalStore } from "react";
import { invoke, isTauri, localAudioUrl } from "../lib/platform";
import { reciter as findReciter, streamUrl } from "./reciters";
import { loadQuran } from "./data";

const IDLE = { active: false, playing: false, index: -1, from: 0, to: 0, reciter: "", error: "", loading: false, repeat: 1, loopRange: false, basmala: false };
let state = IDLE;
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
export const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const getState = () => state;
export const useRecitation = () => useSyncExternalStore(subscribe, getState);

// ---- downloaded verses ------------------------------------------------------
let dir = "";
const have = new Map(); // reciter -> Set of verse numbers (1–6236)
export async function refreshDownloads(reciterId) {
  if (!isTauri()) return new Set();
  if (!dir) dir = await invoke("quran_dir").catch(() => "");
  const list = await invoke("quran_audio_have", { reciter: reciterId }).catch(() => []);
  const s = new Set(list);
  have.set(reciterId, s);
  return s;
}
const isLocal = (r, n) => !!dir && !!have.get(r.id)?.has(n);
// Downloaded verses play from memory (WebKitGTK can't stream app files).
let blobUrl = null;
async function urlFor(r, n) {
  if (!isLocal(r, n)) return streamUrl(r, n);
  try {
    const url = await localAudioUrl(`${dir}/audio/${r.id}/${n}.mp3`);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = url;
    return url;
  } catch {
    return streamUrl(r, n);
  }
}

// ---- playback ---------------------------------------------------------------
let audio = null;
let preload = null;
let volume = 1;
let played = 0; // times the current verse has been recited (for repeat)
// First verses of surahs that start with the basmala (all but Al-Fatihah,
// where it is verse 1, and At-Tawbah). The basmala is recited before them.
let basmalaBefore = new Set();

function element() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("playing", () => set({ playing: true, loading: false, error: "" }));
    audio.addEventListener("pause", () => set({ playing: false }));
    audio.addEventListener("waiting", () => set({ loading: true }));
    audio.addEventListener("error", () => {
      if (!state.active) return;
      set({ playing: false, loading: false, error: navigator.onLine === false ? "offline" : "failed" });
    });
    preload = new Audio();
    preload.preload = "auto";
  }
  return audio;
}

let loadSeq = 0;
async function load(index, { skipBasmala = false } = {}) {
  const seq = ++loadSeq;
  const r = findReciter(state.reciter);
  const a = element();
  const basmala = !skipBasmala && played === 0 && basmalaBefore.has(index);
  set({ index, basmala, loading: true, error: "" });
  // Verse 1:1 is the basmala.
  const src = await urlFor(r, basmala ? 1 : index + 1);
  if (seq !== loadSeq || !state.active) return; // something newer was asked for
  a.src = src;
  a.volume = volume;
  a.play().catch(() => {});
  // Fetch the next streamed verse in the background so verses follow without a gap.
  const next = basmala ? index + 1 : index + 2;
  if (next <= state.to + 1 && !isLocal(r, next)) preload.src = streamUrl(r, next);
}

function onEnded() {
  if (!state.active) return;
  if (state.basmala) return load(state.index, { skipBasmala: true });
  played += 1;
  if (played < state.repeat) return load(state.index);
  played = 0;
  if (state.index < state.to) return load(state.index + 1);
  // End of the range: stop, or start again when the whole range repeats.
  if (state.loopRange) return load(state.from);
  stop();
}

// from / to: global verse indexes (0–6235), inclusive.
export async function play({ from, to = from, at = from, reciter, repeat = 1, loopRange = false }) {
  const q = await loadQuran();
  basmalaBefore = new Set(q.surahs.filter((s) => s.n !== 1 && s.n !== 9).map((s) => s.start));
  await refreshDownloads(reciter);
  played = 0;
  set({ active: true, from, to, reciter, repeat, loopRange });
  load(at);
}
export function pause() {
  audio?.pause();
}
export function resume() {
  if (!state.active) return;
  if (state.error) return load(state.index);
  audio?.play().catch(() => {});
}
export const toggle = () => (state.playing ? pause() : resume());
export function stop() {
  loadSeq++;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  set({ ...IDLE });
}
export function step(delta) {
  if (!state.active) return;
  const i = Math.min(state.to, Math.max(state.from, state.index + delta));
  played = 0;
  load(i);
}
export function setRepeat(n, loopRange = state.loopRange) {
  set({ repeat: n, loopRange });
}
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (audio) audio.volume = volume;
}
