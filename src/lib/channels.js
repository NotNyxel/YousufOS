// Live TV channels for the phone remote and the universal search: the
// official channels, favourites, your own playlists and (for search) the
// big free lists, loaded once and kept.
import { OFFICIAL, SOURCES, loadPlaylist, loadSource } from "./iptv";

export function quickChannels(settings) {
  const fav = (settings.iptv?.favorites || []).filter((c) => !c.web);
  const seen = new Set();
  return [...fav, ...OFFICIAL].filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
}

let wide = null;
export async function allChannels(settings) {
  const base = quickChannels(settings);
  if (!wide) {
    const lists = [SOURCES.find((s) => s.id === "ae"), SOURCES.find((s) => s.id === "ara"), ...(settings.iptv?.playlists || [])].filter(Boolean);
    wide = Promise.all(lists.map((s) => (s.url ? loadPlaylist(s.url) : loadSource(s)).catch(() => []))).then((l) => l.flat());
  }
  const more = await wide;
  const seen = new Set();
  return [...base, ...more].filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
}

// Forgiving search: ignores case, accents, Arabic spelling variants (أ/إ/آ → ا,
// ة → ه, ى → ي, harakat), spaces and small typos, so "aljazera", "al jazeera"
// and "jazeera" all find Al Jazeera, and "mbc 4" finds MBC4.
export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function edits(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const subsequence = (q, s) => {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
};

/** How well a channel matches the search (0: not at all). */
export function score(c, q) {
  const name = normalize(c.name);
  const all = name + " " + normalize(c.group);
  const compact = name.replace(/ /g, "");
  const qn = normalize(q);
  const qc = qn.replace(/ /g, "");
  if (!qc) return 1;
  if (name === qn || compact === qc) return 100;
  if (compact.startsWith(qc)) return 90;
  if (compact.includes(qc)) return 80;
  const words = all.split(" ");
  let total = 0;
  for (const tok of qn.split(" ")) {
    if (words.some((w) => w.startsWith(tok))) total += 10;
    else if (all.replace(/ /g, "").includes(tok)) total += 8;
    else {
      const max = tok.length >= 6 ? 2 : tok.length >= 3 ? 1 : 0;
      // A typo in a word ("jazera"), or the word written without "al" ("aljazera").
      if (max && words.some((w) => edits(tok, w, max) <= max || (w.length > 3 && edits(tok, w.replace(/^al/, ""), max) <= max))) total += 6;
      else if (max && edits(qc, compact.slice(0, qc.length + 1), max) <= max) total += 5;
      else if (tok.length >= 2 && subsequence(tok, compact)) total += 2;
      else return 0;
    }
  }
  return total;
}

export function matchChannels(list, q, limit = 60) {
  if (!normalize(q)) return list.slice(0, limit);
  return list
    .map((c, i) => ({ c, i, s: score(c, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}
