import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadConfig, saveConfig } from "./platform";
import { DEFAULT_APPS } from "./apps";
import { ACCENTS, DEFAULTS, SettingsCtx } from "./settings-store";
import { themeOf } from "./themes";
import { i18nFor } from "../i18n";

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef();

  useEffect(() => {
    loadConfig().then((cfg) => {
      if (cfg) setSettings(merge(DEFAULTS, cfg));
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveConfig(settings), 400);
  }, [settings, loaded]);

  // update("adhan.volume", 0.5) or update({ theme: "light" })
  const update = useCallback((path, value) => {
    setSettings((prev) => {
      if (typeof path === "object") return merge(prev, path);
      const keys = path.split(".");
      const next = { ...prev };
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys.at(-1)] = typeof value === "function" ? value(cur[keys.at(-1)]) : value;
      return next;
    });
  }, []);

  // Restoring a backup: everything replaced (the admin panel's pairing stays,
  // so the phone doing the restore isn't locked out).
  const replace = useCallback((cfg) => {
    setSettings((prev) => ({ ...merge(DEFAULTS, cfg), admin: prev.admin }));
  }, []);

  const value = useMemo(() => {
    const accent =
      settings.accent === "custom"
        ? settings.customAccent
        : settings.accent === "theme"
          ? themeOf(settings.theme).accent
          : ACCENTS[settings.accent] || ACCENTS.gold;
    const i18n = i18nFor(settings.language);
    // Server addresses set in Settings → Apps (Jellyfin on another PC, …).
    const urls = settings.appUrls || {};
    const apps = (settings.apps || DEFAULT_APPS).map((a) => (urls[a.id] ? { ...a, url: urls[a.id] } : a));
    return { settings, update, replace, loaded, accent, i18n, apps };
  }, [settings, update, replace, loaded]);

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

