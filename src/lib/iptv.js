import { convertFileSrc } from "@tauri-apps/api/core";
import { fetchText, isTauri } from "./platform";

// Free, publicly available channels collected by the iptv-org project
// (https://github.com/iptv-org/iptv). Streams come and go; dead ones just
// show "not available".
const BASE = "https://iptv-org.github.io/iptv";

const logos = import.meta.glob("../assets/channels/*.png", { eager: true, import: "default" });
const logo = (id) => logos[`../assets/channels/${id}.png`];

// The broadcasters' own public live streams (their websites and apps use
// the same links). They play in YousufOS's player, with mpv as a fallback.
export const OFFICIAL = [
  { name: "Makkah · Qur'an TV", group: "Islamic", url: "http://m.live.net.sa:1935/live/quran/gmswf.m3u8", logo: logo("quran") },
  { name: "Madinah · Sunnah TV", group: "Islamic", url: "http://m.live.net.sa:1935/live/sunnah/gmswf.m3u8", logo: logo("sunnah") },
  { name: "Sharjah TV", group: "UAE", url: "https://live.kwikmotion.com/smc1live/smc1tv.smil/playlist.m3u8", logo: logo("sharjah") },
  { name: "Sharjah 2", group: "UAE", url: "https://svs.itworkscdn.net/smc2live/smc2tv.smil/playlist.m3u8", logo: logo("sharjah2") },
  { name: "Al Saudiya", group: "Saudi Arabia", url: "https://shd-gcp-live.edgenextcdn.net/live/bitmovin-saudi-tv/2ad66056b51fd8c1b624854623112e43/index.m3u8", logo: logo("saudiya") },
  { name: "Al Jazeera", group: "News · Arabic", url: "https://live-hls-apps-aja-fa.getaj.net/AJA/01.m3u8", logo: logo("aljazeera") },
  { name: "Al Jazeera Mubasher", group: "News · Arabic", url: "https://live-hls-apps-ajm-fa.getaj.net/AJM/index.m3u8", logo: logo("ajmubasher") },
  { name: "Al Arabiya", group: "News · Arabic", url: "https://live.alarabiya.net/alarabiapublish/alarabiya.smil/playlist.m3u8", logo: logo("alarabiya") },
  { name: "Al Hadath", group: "News · Arabic", url: "https://shd-gcp-live.edgenextcdn.net/live/bitmovin-hadath/2ff87ec4c2f3ede35295a20637d9f8fd/index.m3u8", logo: logo("alhadath") },
  { name: "Al Ekhbariya", group: "News · Arabic", url: "https://shd-gcp-live.edgenextcdn.net/live/bitmovin-al-ekhbaria/297b3ef1cd0633ad9cfba7473a686a06/index.m3u8", logo: logo("ekhbariya"), light: true },
  { name: "Sky News Arabia", group: "News · Arabic", url: "https://live-stream.skynewsarabia.com/c-horizontal-channel/horizontal-stream/index.m3u8", logo: logo("skynewsarabia") },
  { name: "Asharq News", group: "News · Arabic", url: "https://live-news.asharq.com/asharq.m3u8", logo: logo("asharq") },
  { name: "CNBC Arabia", group: "News · Arabic", url: "https://cnbc-live.akamaized.net/cnbc/master.m3u8", logo: logo("cnbcarabia"), light: true },
  { name: "France 24 Arabic", group: "News · Arabic", url: "https://live.france24.com/hls/live/2037222-b/F24_AR_HI_HLS/master_5000.m3u8", logo: logo("france24") },
  { name: "DW Arabic", group: "News · Arabic", url: "https://dwamdstream103.akamaized.net/hls/live/2015526/dwstream103/master.m3u8", logo: logo("dw"), light: true },
  { name: "TRT Arabi", group: "News · Arabic", url: "https://tv-trtarabi.medya.trt.com.tr/master.m3u8", logo: logo("trtarabi") },
  { name: "Al Jazeera English", group: "News · English", url: "https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8", logo: logo("aljazeera") },
  { name: "France 24 English", group: "News · English", url: "https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_5000.m3u8", logo: logo("france24") },
  { name: "DW News", group: "News · English", url: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8", logo: logo("dw"), light: true },
  { name: "TRT World", group: "News · English", url: "https://tv-trtworld.medya.trt.com.tr/master.m3u8", logo: logo("trtworld") },
];

export const SOURCES = [
  { id: "official", label: "Official channels", channels: OFFICIAL },
  { id: "ae", label: "UAE", url: `${BASE}/countries/ae.m3u` },
  { id: "sa", label: "Saudi Arabia", url: `${BASE}/countries/sa.m3u` },
  { id: "ara", label: "Arabic", url: `${BASE}/languages/ara.m3u` },
  { id: "religious", label: "Religious", url: `${BASE}/categories/religious.m3u` },
  { id: "news", label: "News", url: `${BASE}/categories/news.m3u` },
  { id: "kids", label: "Kids", url: `${BASE}/categories/kids.m3u` },
  { id: "documentary", label: "Documentary", url: `${BASE}/categories/documentary.m3u` },
  { id: "sports", label: "Sports", url: `${BASE}/categories/sports.m3u` },
];

const MAX_CHANNELS = 400;
const cache = new Map();

export function parseM3U(text) {
  const out = [];
  const seen = new Set();
  let cur = null;
  let opts = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const attrs = {};
      line.replace(/([\w-]+)="([^"]*)"/g, (m, k, v) => (attrs[k] = v));
      const title = line.slice(line.lastIndexOf(",") + 1).trim();
      cur = {
        name: title.replace(/\s*\(\d+p\)|\s*\[[^\]]*\]/gi, "").trim() || title,
        notAlways: /not 24\/7/i.test(title),
        geo: /geo-blocked/i.test(title),
        logo: attrs["tvg-logo"] || "",
        group: (attrs["group-title"] || "").split(";")[0],
      };
      opts = {};
    } else if (line.startsWith("#EXTVLCOPT:")) {
      const [k, ...v] = line.slice(11).split("=");
      if (k === "http-user-agent") opts.ua = v.join("=");
      if (k === "http-referrer") opts.ref = v.join("=");
    } else if (!line.startsWith("#") && cur) {
      if (!seen.has(line)) {
        seen.add(line);
        out.push({ ...cur, ...opts, url: line });
      }
      cur = null;
    }
  }
  // Channels that are always on and not geo-blocked first.
  return out.sort((a, b) => a.geo - b.geo || a.notAlways - b.notAlways).slice(0, MAX_CHANNELS);
}

export async function loadSource(source) {
  if (source.channels) return source.channels;
  return loadPlaylist(source.url);
}

export async function loadPlaylist(url) {
  if (cache.has(url)) return cache.get(url);
  const list = parseM3U(await fetchText(url));
  cache.set(url, list);
  return list;
}

// In the desktop app every request goes through the Rust relay (no CORS limits,
// custom user agent / referrer when the playlist asks for one).
export function relayUrl(url, ch = {}) {
  if (!isTauri()) return url;
  const base = relayBase();
  // Pieces listed with relative links were resolved against a relay address
  // already: pass them through untouched.
  if (url.startsWith(base)) return url;
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!/^https?:$/.test(u.protocol)) return url;
  // ch.headers: extra request headers (e.g. a media server's Authorization).
  const opts = ch.ua || ch.ref || ch.headers ? hex(JSON.stringify({ ua: ch.ua || undefined, ref: ch.ref || undefined, h: ch.headers || undefined })) : "-";
  return `${base}${opts}/${u.protocol.slice(0, -1)}/${u.host}${u.pathname}${u.search}`;
}

let cachedBase = null;
// "iptv://localhost/" on Linux, "http://iptv.localhost/" on Windows.
function relayBase() {
  if (!cachedBase) cachedBase = convertFileSrc("x", "iptv").slice(0, -1);
  return cachedBase;
}
const hex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
