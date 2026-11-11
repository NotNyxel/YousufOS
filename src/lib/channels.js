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

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ًͯ-ٟ]/g, "");
export function matchChannels(list, q, limit = 60) {
  const n = norm(q).trim();
  if (!n) return list.slice(0, limit);
  return list.filter((c) => norm(c.name).includes(n) || norm(c.group).includes(n)).slice(0, limit);
}
