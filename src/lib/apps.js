// Every app has a logo in src/assets/apps/<id>.png (refresh them with
// scripts/fetch-app-icons.py). `wordmark: true` = wide logo drawn large;
// otherwise the square app icon sits on a tile of its own colour.
const icons = import.meta.glob("../assets/apps/*.png", { eager: true, import: "default" });
export const LOGOS = Object.fromEntries(Object.entries(icons).map(([p, url]) => [p.match(/(\w+)\.png$/)[1], url]));

// youtube.com/tv is YouTube's remote-friendly TV interface; it only loads
// for TV user agents.
export const TV_UA =
  "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36";

export const CATEGORIES = [
  { id: "free", label: "Free to watch" },
  { id: "streaming", label: "Streaming" },
  { id: "arabic", label: "Arabic & Gulf" },
  { id: "music", label: "Music & Audio" },
  { id: "kids", label: "Kids & Anime" },
  { id: "faith", label: "Faith" },
  { id: "tools", label: "Web & tools" },
  { id: "home", label: "Media servers & Home" },
];

// Flags:
//   free   no subscription needed (some ask you to make a free account)
//   drm    protected video (Widevine) -> always opens in Chrome
//   chrome Google sign-in works best in Chrome
//   tv     remote-friendly TV interface (controller keys, no pointer)
// Everything else opens inside YousufOS; if a page turns out to play
// protected video it moves to Chrome by itself.
// `apps` in config.json overrides this list when present.
export const DEFAULT_APPS = [
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com/tv", userAgent: TV_UA, tv: true, pinned: true, bg: "#0f0f0f", wordmark: true, cat: "free", free: true },
  { id: "netflix", name: "Netflix", url: "https://www.netflix.com/browse", drm: true, pinned: true, bg: "#000000", wordmark: true, cat: "streaming" },
  { id: "primevideo", name: "Prime Video", url: "https://www.primevideo.com", drm: true, pinned: true, bg: "linear-gradient(135deg,#0f79af,#1a98ff)", wordmark: true, cat: "streaming" },
  { id: "shahid", name: "Shahid", url: "https://shahid.mbc.net", drm: true, pinned: true, bg: "linear-gradient(135deg,#5bd16a,#3fae8f 55%,#4a9ee8)", wordmark: true, cat: "arabic" },

  // Free, legal and from well-known publishers.
  { id: "tabii", name: "tabii", url: "https://www.tabii.com", bg: "#0b0b0b", cat: "free", free: true, desc: "TRT's Turkish series and films, Arabic dubbing and subtitles" },
  { id: "dubaiplus", name: "Dubai+ (Awaan)", url: "https://www.dubaiplus.net", bg: "#5b3a80", cat: "free", free: true, desc: "Dubai Media's shows, series and live channels" },
  { id: "aj360", name: "Al Jazeera 360", url: "https://www.aljazeera360.com", bg: "#1d2433", cat: "free", free: true, desc: "Documentaries and series from Al Jazeera" },
  { id: "weyyak", name: "Weyyak", url: "https://www.weyyak.com", bg: "#e5452a", cat: "free", free: true, desc: "Arabic series and films with ads" },
  { id: "plexfree", name: "Plex Free Movies", logo: "plex", url: "https://watch.plex.tv", drm: true, bg: "#1f1f1f", cat: "free", free: true, desc: "Free films and live channels with ads" },
  { id: "viki", name: "Viki", url: "https://www.viki.com", drm: true, bg: "#1e9cf0", cat: "free", free: true, desc: "Asian dramas and films, free with ads" },
  { id: "nasaplus", name: "NASA+", url: "https://plus.nasa.gov", bg: "#0b0f1a", cat: "free", free: true, desc: "Space documentaries and live missions" },
  { id: "redbulltv", name: "Red Bull TV", url: "https://www.redbull.com/int-en/tv", bg: "#0b1630", cat: "free", free: true, desc: "Sport, adventure and live events" },
  { id: "ted", name: "TED", url: "https://www.ted.com/talks", bg: "#111111", cat: "free", free: true, desc: "Talks on science, faith, ideas" },
  { id: "archive", name: "Classic Films", url: "https://archive.org/details/feature_films", bg: "#000000", cat: "free", free: true, desc: "Public-domain films from the Internet Archive" },

  { id: "disneyplus", name: "Disney+", url: "https://www.disneyplus.com", drm: true, bg: "#04293a", cat: "streaming" },
  { id: "osnplus", name: "OSN+", url: "https://osnplus.com", drm: true, bg: "#0a0a0a", cat: "arabic" },
  { id: "starzplay", name: "STARZPLAY", url: "https://starzplay.com", drm: true, bg: "#131b1d", cat: "arabic" },
  { id: "appletv", name: "Apple TV", url: "https://tv.apple.com", drm: true, bg: "#3a3a3c", cat: "streaming" },
  { id: "tod", name: "TOD", url: "https://www.tod.tv", drm: true, bg: "#0a0a0a", cat: "arabic" },
  { id: "twitch", name: "Twitch", url: "https://www.twitch.tv", bg: "#9146ff", cat: "streaming" },
  { id: "crunchyroll", name: "Crunchyroll", url: "https://www.crunchyroll.com", drm: true, bg: "#f47521", cat: "kids" },
  { id: "youtubekids", name: "YouTube Kids", url: "https://www.youtubekids.com", bg: "#2a1d1d", cat: "kids", free: true },
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com", drm: true, bg: "#121212", cat: "music" },
  { id: "anghami", name: "Anghami", url: "https://play.anghami.com", drm: true, bg: "#0b0b0b", cat: "music" },
  { id: "youtubemusic", name: "YouTube Music", url: "https://music.youtube.com", chrome: true, bg: "#2b1414", cat: "music" },
  { id: "browser", name: "Browser", url: "app:browser.html", inside: true, webBrowser: true, bg: "#123a4a", cat: "tools", desc: "Search and visit any website" },
  { id: "quran", name: "Quran.com", url: "https://quran.com", bg: "#2e3778", cat: "faith", free: true },
  { id: "plex", name: "Plex", url: "https://app.plex.tv", bg: "#1f1f1f", cat: "home" },
  { id: "jellyfin", name: "Jellyfin", url: "http://localhost:8096", bg: "#000c26", cat: "home" },
  { id: "googlephotos", name: "Google Photos", url: "https://photos.google.com", chrome: true, bg: "#1f2733", cat: "home" },
  { id: "homeassistant", name: "Home Assistant", url: "http://homeassistant.local:8123", bg: "#1a6f9a", cat: "home" },
];

// Inside YousufOS (embedded view) or Chrome?
export function appOpensInside(app, view = {}) {
  if (app.inside) return true;
  if (app.drm || app.chrome) return false;
  if (view?.mode === "chrome") return false;
  if ((view?.chromeApps || []).includes(app.id)) return false;
  return true;
}

export const logoOf = (app) => LOGOS[app.logo || app.id];

// Wide wordmarks fill the tile; square app icons sit in the middle.
export function logoClass(app) {
  if (app.id === "shahid") return "h-[38%]";
  if (app.wordmark || app.icon) return "max-h-[42%] max-w-[66%]";
  return "h-[56%] drop-shadow-[0_0.4rem_1rem_rgb(0_0_0/0.35)]";
}

