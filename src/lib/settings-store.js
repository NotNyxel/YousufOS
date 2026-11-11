import { createContext, useContext } from "react";

export const ACCENTS = {
  theme: null, // follow the theme's own accent
  gold: "#d9b45a",
  blue: "#4ea8ff",
  green: "#3ecf8e",
  red: "#ff5d5d",
};

export const DEFAULTS = {
  theme: "dark", // see src/lib/themes.js
  accent: "gold", // theme | gold | blue | green | red | custom
  panelOpacity: 46, // card opacity %, 5 (glass) .. 100 (solid)
  blur: 28, // card background blur, px
  wallDim: 0, // extra wallpaper dimming %
  uiScale: 100, // % of the 10-foot default size
  clockWeight: 200, // 200 light | 400 regular | 700 bold
  effects: "balanced", // full | balanced | performance
  language: "en", // see src/i18n/languages.js
  uiFont: "manrope", // see src/lib/fonts.js
  arabicFont: "amiri", // hadith & Qur'an text
  homeLayout: "row", // row (app cards) | focus (one card + Qur'an) | quran (no apps, wide Qur'an card)
  ambient: { sound: "off", volume: 35, onlyHome: true }, // see src/lib/ambient.js
  showHadith: true,
  customAccent: "#c79bff",
  clock24: false,
  location: {
    mode: "manual", // manual | auto
    country: "AE",
    city: "Sharjah",
    lat: 25.3463,
    lng: 55.4209,
    label: "Sharjah, UAE",
  },
  prayer: {
    method: "uae",
    madhab: "shafi",
    hijriOffset: 0,
    adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  },
  adhan: {
    enabled: true,
    voice: "makkah", // makkah | madinah | mishary | dubai | sheikhzayed | custom
    customPath: "",
    volume: 0.8,
    muteMedia: true,
    useFajrFile: true,
  },
  reminders: {
    istighfar: false,
    istighfarEvery: 60, // minutes
    quietAtNight: true, // none between Isha + 1h and Fajr
    chime: false,
    takbir: false, // during Eid days only
    takbirEvery: 30,
    takbirSound: true,
  },
  screensaver: { timeout: 5, mode: "clock" }, // minutes (0 = never); clock | prayer | photos
  // local: wallpapers of the country / city set under Location (internet photos).
  backgrounds: { collection: "all", customDir: "", interval: 60, local: false },
  news: {
    enabled: true,
    feeds: [
      { name: "الجزيرة", label: "Breaking", url: "https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9" },
      { name: "سكاي نيوز عربية", label: "Regional", url: "https://www.skynewsarabia.com/rss.xml" },
      { name: "الاتحاد", label: "UAE", url: "https://news.google.com/rss/search?q=when:24h+site:aletihad.ae&hl=ar&gl=AE&ceid=AE:ar" },
    ],
  },
  // player: auto (built-in, then mpv if a channel won't play) | builtin | mpv
  iptv: { source: "official", favorites: [], playlists: [], player: "auto" }, // playlists: [{ label, url }] extra .m3u lists
  // Apps: open inside YousufOS (auto) or always in Chrome; chromeApps = ids that always use Chrome.
  appView: { mode: "auto", chromeApps: [] },
  appUrls: {}, // e.g. { jellyfin: "http://192.168.1.20:8096" }
  // Jellyfin: native = YousufOS's own Jellyfin app (off = the server's web page).
  // auth: { server, userId, userName, token, serverName } once signed in.
  // homeRow: Continue watching on the home screen. wol: wake the PC when it's asleep
  // (mac learnt automatically). accounts: profiles signed in on this TV.
  jellyfin: { native: true, auth: null, accounts: [], askProfile: true, homeRow: true, wol: { enabled: true, mac: "" } },
  // Admin panel / phone remote on the home network (port 8686).
  admin: { enabled: false, pin: "", devices: [] },
  // Phone notifications through ntfy (adhan, morning, recordings).
  notify: { enabled: false, server: "https://ntfy.sh", topic: "", adhan: true, recordings: true },
  // Morning screen: days 0 = Sunday.
  morning: { enabled: false, time: "07:00", days: [0, 1, 2, 3, 4, 5, 6], minutes: 10, chime: true },
  // Picture-in-picture Live TV window.
  pip: { corner: "br", size: 480, muted: false },
  recordings: { schedule: [] },
  // New versions from a GitHub repository (owner/name; token for a private one).
  updates: { repo: "", token: "", auto: true, lastCheck: 0, skip: "" },
  // Qur'an: reciter / texts are alquran.cloud edition names; last = verse index (0–6235) last read.
  quran: { reciter: "ar.alafasy", translation: "en.sahih", showTranslation: true, tafsir: "ar.muyassar", view: "verses", size: 100, last: null, bookmarks: [] },
  // Ramadan mode: "auto" during Ramadan, "on" (always, e.g. to try it), "off". Trackers by Hijri year.
  ramadan: { mode: "auto", suhoorAlarm: true, suhoorMinutes: 30, iftarDua: true, qadr: true, notify: true, taraweeh: {}, khatm: {} },
  // Kids profile: allowed app ids, Live TV (kids & Qur'an channels), games, Qur'an,
  // a Jellyfin account (userId, "" = no Jellyfin), minutes a day (0 = no limit), bedtime.
  kids: { active: false, pin: "", apps: ["youtubekids", "quran", "nasaplus"], tv: true, games: true, quran: true, jellyfin: "", limit: 120, bedtime: "20:30", wake: "06:30", usage: {}, unlockUntil: 0 },
  // Cameras: [{ id, name, url }] or Home Assistant [{ id, name, entity }]. Doorbell: which
  // camera pops up, the ring entity in Home Assistant and the key for /api/doorbell.
  cameras: { list: [], haToken: "", doorbell: { enabled: true, camera: "", entity: "", key: "", seconds: 45, chime: true, notify: true } },
  sleepAction: "screen",
  osk: true, // on-screen keyboard inside apps when the controller selects a text box
  dpad: true, // D-pad / remote arrows jump between buttons and links inside web apps
  showWeather: true,
  games: { best: {} },
  apps: null, // null = built-in list (see src/lib/apps.js)
  browser: "", // "" = auto-detect (google-chrome, chromium, ...)
  autostart: false,
};

export const SettingsCtx = createContext(null);
export const useSettings = () => useContext(SettingsCtx);
// t(), lang, dir and locale for the current interface language.
export const useI18n = () => useContext(SettingsCtx).i18n;
