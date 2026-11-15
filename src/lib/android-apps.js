// Android TV: the Apps page shows the TV's own Android apps. Apps YousufOS
// knows keep their YousufOS logos; everything else installed is listed with
// its own TV banner. Known apps that aren't installed open in Google Play.
import { useEffect, useState } from "react";
import { android, isAndroid, listen } from "./platform";

// Android TV packages for the apps in lib/apps.js (the first installed one is used).
export const ANDROID_PACKAGES = {
  youtube: ["com.google.android.youtube.tv", "com.google.android.youtube"],
  netflix: ["com.netflix.ninja", "com.netflix.mediaclient"],
  primevideo: ["com.amazon.amazonvideo.livingroom", "com.amazon.avod.thirdpartyclient"],
  shahid: ["net.mbc.shahidTV", "net.mbc.shahid"],
  disneyplus: ["com.disney.disneyplus"],
  appletv: ["com.apple.atve.androidtv.appletv"],
  twitch: ["tv.twitch.android.app"],
  crunchyroll: ["com.crunchyroll.crunchyroid"],
  youtubekids: ["com.google.android.youtube.tvkids", "com.google.android.apps.youtube.kids"],
  youtubemusic: ["com.google.android.youtube.tvmusic", "com.google.android.apps.youtube.music"],
  spotify: ["com.spotify.tv.android", "com.spotify.music"],
  anghami: ["com.anghami"],
  plex: ["com.plexapp.android"],
  plexfree: ["com.plexapp.android"],
  viki: ["com.viki.android"],
  redbulltv: ["com.nousguide.android.rbtv"],
  ted: ["com.ted.android.tv", "com.ted.android"],
  googlephotos: ["com.google.android.apps.photos"],
  homeassistant: ["io.homeassistant.companion.android"],
};

// YousufOS's own pages: not Android apps.
const BUILT_IN = new Set(["jellyfin"]);

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, "");

/** The TV's installed apps: [{pkg, label, tv}] (refreshed when YousufOS comes back to the front). */
export function useAndroidApps() {
  const [list, setList] = useState(() => read());
  useEffect(() => {
    if (!isAndroid()) return;
    const off = listen("android-resume", () => setList(read()));
    return () => off.then((f) => f());
  }, []);
  return list;
}

function read() {
  if (!isAndroid()) return [];
  try {
    return JSON.parse(android().apps()) || [];
  } catch {
    return [];
  }
}

/**
 * The app list on Android: known apps that are installed (with `pkg`),
 * YousufOS's own Jellyfin, then every other installed app. `more` holds known
 * apps that aren't installed (to get from Google Play).
 */
export function androidAppList(catalog, installed) {
  const byPkg = new Map(installed.map((a) => [a.pkg, a]));
  const byLabel = new Map(installed.map((a) => [norm(a.label), a]));
  const used = new Set();
  const apps = [];
  const more = [];
  for (const app of catalog) {
    if (BUILT_IN.has(app.id)) {
      apps.push(app);
      continue;
    }
    if (app.pkg && byPkg.has(app.pkg)) {
      used.add(app.pkg);
      apps.push(app);
      continue;
    }
    const hit = (ANDROID_PACKAGES[app.id] || []).map((p) => byPkg.get(p)).find(Boolean) || byLabel.get(norm(app.name));
    if (hit && !used.has(hit.pkg)) {
      used.add(hit.pkg);
      apps.push({ ...app, pkg: hit.pkg });
    } else if (ANDROID_PACKAGES[app.id] || app.drm) {
      // Only apps that exist for Android TV (websites like NASA+ don't).
      more.push({ ...app, storePkg: (ANDROID_PACKAGES[app.id] || [])[0] || "" });
    }
  }
  for (const a of [...installed].sort((x, y) => (y.tv - x.tv) || x.label.localeCompare(y.label))) {
    if (used.has(a.pkg)) continue;
    apps.push({ id: `android:${a.pkg}`, name: a.label, pkg: a.pkg, android: true, cat: "android", bg: "#1b1d24" });
  }
  return { apps, more };
}

const images = new Map();
/** An installed app's TV banner or icon: { src, banner } or null. */
export function androidImage(pkg) {
  if (!isAndroid() || !pkg) return null;
  if (!images.has(pkg)) {
    let v = null;
    try {
      const s = android().appImage(pkg);
      if (s) v = { src: s.replace(/#(banner|icon)$/, ""), banner: s.endsWith("#banner") };
    } catch {
      v = null;
    }
    images.set(pkg, v);
  }
  return images.get(pkg);
}

/** Opens an Android app, or its Google Play page if it isn't installed. */
export function openAndroidApp(app) {
  const a = android();
  if (app.pkg && a.launch(app.pkg)) return;
  if (a.store(app.storePkg || (ANDROID_PACKAGES[app.id] || [])[0] || "", app.name)) return;
  if (app.url && /^https?:/.test(app.url) && a.openUrl(app.url)) return;
  throw new Error("It isn't installed on this TV, and Google Play didn't open.");
}
