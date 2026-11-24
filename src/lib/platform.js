// Thin bridge to the Rust side. Every call has a browser fallback so
// `npm run dev` in a normal browser still works for UI development.
import { invoke as tauriInvoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

export const isTauri = () =>
  typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

// ---------------------------------------------------------------- Android
// On Android TV the same interface runs inside the YousufOS Android app,
// which adds window.YousufAndroid (installed apps, the video player, the
// remote's extra buttons, updates). See src-tauri/gen/android/.../Bridge.kt.
export const isAndroid = () => typeof window !== "undefined" && !!window.YousufAndroid;
// The Windows version (a PC plugged into the TV).
export const isWindows = () => typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) && !isAndroid();
export const android = () => window.YousufAndroid;

// Events from the Android side: window.__yaEmit(name, payload).
const androidListeners = new Map();
if (typeof window !== "undefined") {
  window.__yaEmit = (name, payload) => {
    for (const cb of androidListeners.get(name) || []) {
      try {
        cb(payload);
      } catch (e) {
        console.warn(name, e);
      }
    }
  };
}

const headerObject = (list) =>
  Object.fromEntries(
    (list || [])
      .map((h) => {
        const i = String(h).indexOf(":");
        return i > 0 ? [h.slice(0, i).trim(), h.slice(i + 1).trim()] : null;
      })
      .filter(Boolean),
  );

const NOT_ON_ANDROID = "This isn't available on the Android TV version yet.";

// Live TV proxy in use right now ("" = direct); see lib/live-proxy.js.
let streamProxy = "";
export function setStreamProxy(url) {
  streamProxy = url || "";
  if (isTauri()) tauriInvoke("set_stream_proxy", { url: streamProxy || null }).catch((e) => console.warn("proxy", e));
}
export const currentStreamProxy = () => streamProxy;
// Laptop commands that work differently on Android.
const ANDROID_COMMANDS = {
  play_media: ({ entries, headers, audioOnly, sync }) =>
    // okToApp: Jellyfin decides what OK does (skip the intro or pause).
    android().play(JSON.stringify({ kind: "media", entries, headers: headerObject(headers), audioOnly: !!audioOnly, okToApp: sync !== undefined })),
  play_external: ({ channels, index }) => android().play(JSON.stringify({ kind: "live", entries: channels, index: index || 0, proxy: streamProxy })),
  player_command: ({ args }) => android().playerCommand(JSON.stringify(args || [])),
  pip_start: ({ url, title, corner, size, muted, userAgent, headers, live }) => {
    const r = android().pipStart(JSON.stringify({ url, title, corner, size, muted, userAgent: userAgent || "", headers: headerObject(headers), proxy: live ? streamProxy : "" }));
    if (r === "overlay") {
      android().openSettings("overlay");
      throw new Error("Allow YousufOS to display over other apps, then try again.");
    }
  },
  pip_stop: () => android().pipStop(),
  pip_running: () => android().pipRunning(),
  change_volume: ({ step }) => android().volume(step > 0 ? 1 : step < 0 ? -1 : 0),
  close_app: () => null,
  launch_app: () => {
    throw new Error(NOT_ON_ANDROID);
  },
  record_start: () => {
    throw new Error(NOT_ON_ANDROID);
  },
  download_start: () => {
    throw new Error(NOT_ON_ANDROID);
  },
  update_install: ({ path }) => {
    const r = android().installApk(path);
    if (r === "permission") throw new Error("Allow YousufOS to install apps (the setting just opened), then press Install again.");
    if (r) throw new Error(r);
  },
  system_action: ({ action }) => {
    if (action === "screen-off" || action === "screen-on" || action === "exit") return null;
    if (action === "settings") return android().openSettings("");
    throw new Error(NOT_ON_ANDROID);
  },
};

export async function invoke(cmd, args) {
  if (!isTauri()) throw new Error(`"${cmd}" needs the YousufOS desktop runtime`);
  if (isAndroid() && ANDROID_COMMANDS[cmd]) return ANDROID_COMMANDS[cmd](args || {});
  return tauriInvoke(cmd, args);
}

export async function listen(event, cb) {
  if (!isTauri()) return () => {};
  const off = await tauriListen(event, (e) => cb(e.payload));
  if (!isAndroid()) return off;
  const set = androidListeners.get(event) || new Set();
  set.add(cb);
  androidListeners.set(event, set);
  return () => {
    off();
    set.delete(cb);
  };
}

export async function fetchText(url) {
  if (isTauri()) return invoke("fetch_text", { url });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Controller help shown inside apps (Menu button), in the interface language.
function controllerHelp(t, tv) {
  const rows = tv
    ? [
        ["D-pad / left stick", t("Move")],
        ["A", t("Select")],
        ["B", t("Back")],
        ["X", t("Play / pause")],
        ["Y", t("Fullscreen")],
        ["LT / RT", t("Volume")],
        ["Xbox", t("Back to YousufOS")],
      ]
    : [
        ["D-pad", t("Move between buttons")],
        [t("Left stick"), t("Move the pointer")],
        ["A", t("Click / select")],
        [t("Right stick"), t("Scroll")],
        ["B", t("Back")],
        ["X", t("Play / pause")],
        ["Y", t("Fullscreen")],
        ["LB / RB", t("Rewind / forward 10 s")],
        ["LT / RT", t("Volume")],
        ["View", t("Reload the page")],
        ["Xbox", t("Back to YousufOS")],
      ];
  return rows;
}

// opts: { browser, embed, t, videoFull, channelKeys }
export async function launchApp(app, opts = {}) {
  if (!isTauri()) {
    window.open(app.url, "_blank");
    return;
  }
  const t = opts.t || ((s) => s);
  const tv = !!app.tv;
  return invoke("launch_app", {
    opts: {
      url: app.url,
      userAgent: app.userAgent || null,
      browser: opts.browser || null,
      embed: !!opts.embed,
      tv,
      hint: t("Xbox button or F12: back to YousufOS · Menu: controller help"),
      help: controllerHelp(t, tv),
      videoFull: !!opts.videoFull,
      channelKeys: !!opts.channelKeys,
      osk: opts.osk !== false,
      lang: opts.lang || "en",
      webBrowser: !!app.webBrowser,
      barLabels: { back: t("Back"), fwd: t("Forward"), reload: t("Reload"), start: t("Start page"), help: t("Help"), exit: t("Exit") },
      dpad: opts.dpad !== false,
    },
  });
}

export const changeVolume = (step) => (isTauri() ? invoke("change_volume", { step }) : Promise.resolve(null));

// Live TV in mpv (plays nearly every stream).
export const playExternal = (channels, index) =>
  invoke("play_external", { channels: channels.map((c) => ({ name: c.name, url: c.url })), index });
export const playerCommand = (...args) => invoke("player_command", { args });

export const closeApp = () => (isTauri() ? invoke("close_app") : Promise.resolve());

const LS_KEY = "yousufos.config";

export async function loadConfig() {
  if (isTauri()) {
    try {
      const raw = await invoke("load_config");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("load_config failed", e);
      return null;
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveConfig(cfg) {
  const raw = JSON.stringify(cfg, null, 2);
  if (isTauri()) return invoke("save_config", { contents: raw });
  try {
    localStorage.setItem(LS_KEY, raw);
  } catch {
    /* private mode etc. */
  }
}

export async function listImages(dir) {
  if (!isTauri() || !dir) return [];
  try {
    const paths = await invoke("list_images", { dir });
    return paths.map((p) => ({
      url: convertFileSrc(p),
      title: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      category: "custom",
      night: /night/i.test(p),
    }));
  } catch (e) {
    console.warn("list_images failed", e);
    return [];
  }
}

export const fileSrc = (path) => (isTauri() ? convertFileSrc(path) : path);

// Any audio path -> something the webview can actually play.
// Linux WebKitGTK's media player can't read the app's internal tauri://
// protocol, so bundled files ("/adhan/x.mp3") are fetched into memory and
// played from a blob: URL. http(s) URLs and the browser preview play as-is.
export async function playableUrl(src) {
  if (!isTauri() || !src.startsWith("/")) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${src}`);
  return URL.createObjectURL(await res.blob());
}

// Local audio file -> blob: URL (WebKitGTK can't stream asset:// media).
// Throws if the file doesn't exist.
const MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac" };
export async function localAudioUrl(path) {
  if (!isTauri()) throw new Error("local files need the desktop runtime");
  const buf = await invoke("read_media", { path });
  const ext = path.split(".").pop().toLowerCase();
  return URL.createObjectURL(new Blob([buf], { type: MIME[ext] || "audio/mpeg" }));
}

// "~/Pictures/x.jpg" -> URL usable in <img>
export async function localFileUrl(path) {
  if (!isTauri()) return path;
  const abs = path.startsWith("~") ? await invoke("expand_path", { path }) : path;
  return convertFileSrc(abs);
}

export async function system(action) {
  if (!isTauri()) {
    console.info("system action (browser preview):", action);
    return;
  }
  return invoke("system_action", { action });
}

export async function adhanBegin(muteMedia) {
  if (isAndroid()) {
    android().playerCommand('["quit"]');
    android().toFront();
  }
  if (isTauri()) return invoke("adhan_begin", { muteMedia }).catch(console.warn);
}
export async function adhanEnd() {
  if (isTauri()) return invoke("adhan_end").catch(console.warn);
}

export async function setAutostart(enabled) {
  if (!isTauri() || isAndroid()) return;
  const m = await import("@tauri-apps/plugin-autostart");
  return enabled ? m.enable() : m.disable();
}
