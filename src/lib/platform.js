// Thin bridge to the Rust side. Every call has a browser fallback so
// `npm run dev` in a normal browser still works for UI development.
import { invoke as tauriInvoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

export const isTauri = () =>
  typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

export async function invoke(cmd, args) {
  if (!isTauri()) throw new Error(`"${cmd}" needs the YousufOS desktop runtime`);
  return tauriInvoke(cmd, args);
}

export async function listen(event, cb) {
  if (!isTauri()) return () => {};
  return tauriListen(event, (e) => cb(e.payload));
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
  if (isTauri()) return invoke("adhan_begin", { muteMedia }).catch(console.warn);
}
export async function adhanEnd() {
  if (isTauri()) return invoke("adhan_end").catch(console.warn);
}

export async function setAutostart(enabled) {
  if (!isTauri()) return;
  const m = await import("@tauri-apps/plugin-autostart");
  return enabled ? m.enable() : m.disable();
}
