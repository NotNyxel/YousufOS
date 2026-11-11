// The Qur'an text that ships with YousufOS (public/quran/, built by
// scripts/fetch-quran-full.py) plus translations and tafsir downloaded on the TV.
import { invoke, isTauri } from "../lib/platform";

export const TOTAL = 6236;
export const PAGES = 604;
const API = "https://api.alquran.cloud/v1";

let quranPromise = null;
// { surahs: [{ n, ar, en, meaning, medinan, count, start }], ayahs: [{ text, juz, page, hizb, sajda }],
//   pageStart: [global index of first verse on each page], juzStart, bismillah }
export function loadQuran() {
  if (!quranPromise) {
    quranPromise = fetch("/quran/quran.json")
      .then((r) => r.json())
      .then((d) => {
        let start = 0;
        const surahs = d.surahs.map(([n, ar, en, meaning, medinan, count]) => {
          const s = { n, ar, en, meaning, medinan: !!medinan, count, start };
          start += count;
          return s;
        });
        const ayahs = d.ayahs.map(([text, juz, page, hizb, sajda], i) => ({ i, text, juz, page, hizb, sajda: !!sajda }));
        const pageStart = [];
        const juzStart = [];
        ayahs.forEach((a, i) => {
          if (pageStart[a.page - 1] === undefined) pageStart[a.page - 1] = i;
          if (juzStart[a.juz - 1] === undefined) juzStart[a.juz - 1] = i;
        });
        // Which surah each verse belongs to.
        const surahOf = new Uint8Array(TOTAL);
        surahs.forEach((s) => surahOf.fill(s.n, s.start, s.start + s.count));
        return { surahs, ayahs, pageStart, juzStart, surahOf, bismillah: d.meta.bismillah };
      })
      .catch((e) => {
        quranPromise = null;
        throw e;
      });
  }
  return quranPromise;
}

// Global verse index (0–6235) ↔ surah:verse.
export const refOf = (q, i) => {
  const s = q.surahs[q.surahOf[i] - 1];
  return { surah: s, ayah: i - s.start + 1 };
};
export const indexOf = (q, surah, ayah) => q.surahs[surah - 1].start + ayah - 1;
export const pageRange = (q, page) => [q.pageStart[page - 1], page < PAGES ? q.pageStart[page] - 1 : TOTAL - 1];

export const arabicDigits = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

// ---------------------------------------------------------------- texts
// Translations / tafsir: one string per verse. en.sahih ships with YousufOS.
export const BUILT_IN_TEXT = "en.sahih";
const textCache = new Map();

export async function loadText(id) {
  if (!id) return null;
  if (textCache.has(id)) return textCache.get(id);
  let list = null;
  if (id === BUILT_IN_TEXT) list = await fetch("/quran/en.sahih.json").then((r) => r.json());
  else if (isTauri()) {
    const raw = await invoke("quran_text_read", { id });
    if (raw) list = JSON.parse(raw);
  }
  if (list) textCache.set(id, list);
  return list;
}

async function getJson(url) {
  if (isTauri()) return JSON.parse(await invoke("fetch_text", { url }));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Downloads a translation or tafsir to this TV.
export async function downloadText(id) {
  const d = await getJson(`${API}/quran/${encodeURIComponent(id)}`);
  const list = d.data.surahs.flatMap((s) => s.ayahs.map((a) => String(a.text || "").replace(/\uFEFF/g, "").trim()));
  if (list.length !== TOTAL) throw new Error("incomplete text");
  await invoke("quran_text_save", { id, contents: JSON.stringify(list) });
  textCache.set(id, list);
  return list;
}

export async function deleteText(id) {
  textCache.delete(id);
  await invoke("quran_text_delete", { id });
}

// Every translation and tafsir alquran.cloud offers (cached for a week).
export async function textCatalog() {
  const KEY = "yousufos.quran.catalog";
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    if (c && Date.now() - c.at < 7 * 86400000) return c.list;
  } catch {
    /* ignore */
  }
  const d = await getJson(`${API}/edition?format=text`);
  const list = d.data
    .filter((e) => e.type === "translation" || e.type === "tafsir")
    .map((e) => ({ id: e.identifier, lang: e.language, name: e.name, en: e.englishName, type: e.type }));
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* ignore */
  }
  return list;
}

// Shown before the catalog has loaded (and offline).
export const SUGGESTED_TEXTS = [
  { id: "en.sahih", lang: "en", en: "Sahih International", type: "translation", builtIn: true },
  { id: "ar.muyassar", lang: "ar", en: "Tafsir al-Muyassar", name: "التفسير الميسر", type: "tafsir" },
  { id: "ar.jalalayn", lang: "ar", en: "Tafsir al-Jalalayn", name: "تفسير الجلالين", type: "tafsir" },
  { id: "en.pickthall", lang: "en", en: "Pickthall", type: "translation" },
  { id: "ur.jalandhry", lang: "ur", en: "Jalandhry", type: "translation" },
  { id: "id.indonesian", lang: "id", en: "Bahasa Indonesia", type: "translation" },
  { id: "fr.hamidullah", lang: "fr", en: "Hamidullah", type: "translation" },
  { id: "tr.diyanet", lang: "tr", en: "Diyanet İşleri", type: "translation" },
];
