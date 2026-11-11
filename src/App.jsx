import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Background from "./components/Background";
import Sidebar from "./components/Sidebar";
import NewsTicker from "./components/NewsTicker";
import Screensaver from "./components/Screensaver";
import AdhanOverlay from "./components/AdhanOverlay";
import LaunchSplash from "./components/LaunchSplash";
import Home from "./pages/Home";
import Apps from "./pages/Apps";
import Prayer from "./pages/Prayer";
import News from "./pages/News";
import Settings from "./pages/Settings";
import LiveTV from "./pages/LiveTV";
import Games from "./pages/Games";
import Search from "./pages/Search";
import JellyfinApp from "./jellyfin/JellyfinApp";
import { normalizeServer } from "./jellyfin/api";
import CastPhoto from "./components/CastPhoto";
import MorningScreen from "./components/MorningScreen";
import { useAdminBridge, useAdminServer, useRecordingScheduler } from "./lib/admin-bridge";
import { notifyPhones } from "./lib/notify";
import { checkUpdate } from "./lib/updates";
import { useSettings } from "./lib/settings-store";
import { applyFonts } from "./lib/fonts";
import { startAmbient, stopAmbient, setAmbientVolume } from "./lib/ambient";
import { formatCountdown, formatTime } from "./lib/prayer";
import { useNow } from "./lib/useNow";
import { ADHAN_PRAYERS, prayerSchedule } from "./lib/prayer";
import { pickWallpapers } from "./lib/wallpapers";
import { loadWorldCatalog, worldPhotos } from "./lib/worldWallpapers";
import { focusDefault, focusEl, pressKey, restoreMain, useGamepad, useSpatialNav } from "./lib/nav";
import { closeApp, fileSrc, isTauri, launchApp, listImages, listen, playExternal } from "./lib/platform";
import { appOpensInside } from "./lib/apps";
import VolumeHud from "./components/VolumeHud";
import { detectLocation } from "./lib/location";
import { onColor } from "./lib/color";
import { applyTheme } from "./lib/themes";
import ReminderBanner from "./components/ReminderBanner";
import { ISTIGHFAR, TAKBIR, eidToday, isQuietTime, playChime, takbirPeriod } from "./lib/reminders";

const DEFAULT_IMAGE_DIR = "~/Pictures/YousufOS";

export default function App() {
  const { settings, update, replace, accent, apps, loaded, i18n } = useSettings();
  const { t } = i18n;
  // Checks run every 5 s; pages only re-render when the minute changes.
  const now = useNow(5000);
  const [page, setPage] = useState("home");
  const [section, setSection] = useState("appearance");
  const [screensaver, setScreensaver] = useState(null);
  const [adhan, setAdhan] = useState(null);
  const [launching, setLaunching] = useState(null);
  const [appOpen, setAppOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState(null);
  const [custom, setCustom] = useState([]);
  const [toast, setToast] = useState("");
  const [reminder, setReminder] = useState(null);
  const [liveTvPlaying, setTvPlaying] = useState(false);
  // Built-in Jellyfin app: the server address while it's open.
  const [jellyfin, setJellyfin] = useState(null);
  const [jfPlaying, setJfPlaying] = useState(false);
  // Opening Jellyfin at an item (home row, search): { item, play }.
  const [jfStart, setJfStart] = useState(null);
  const [castPhoto, setCastPhoto] = useState(null);
  const [morning, setMorning] = useState(false);
  const [lastApp, setLastApp] = useState(null);
  // Something is playing (Live TV, a film, music): no screensaver or reminders.
  const tvPlaying = liveTvPlaying || jfPlaying;
  const [gamePlaying, setGamePlaying] = useState(false);
  const [volume, setVolume] = useState(null);
  const lastIstighfar = useRef(0);
  const lastTakbir = useRef(0);
  const istighfarIndex = useRef(0);
  const lastInput = useRef(0);
  const fired = useRef(new Set());
  const pendingFocus = useRef(true);

  // ---- Theme ------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;
    applyTheme(root, settings, accent);
    applyFonts(root, settings);
    root.style.setProperty("--on-accent", onColor(accent));
  }, [settings, accent]);

  // ---- Language ------------------------------------------------------------
  useEffect(() => {
    // The browser start page (same origin) reads this.
    try {
      localStorage.setItem("yousufos.lang", i18n.lang);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = i18n.lang;
    document.documentElement.dir = i18n.dir;
  }, [i18n.lang, i18n.dir]);

  // ---- Prayer schedule & wallpapers --------------------------------------
  // Prayer maths once a minute, not every second.
  const minute = Math.floor(now.getTime() / 60000);
  const minuteNow = useMemo(() => new Date(minute * 60000), [minute]);
  const schedule = useMemo(
    () => prayerSchedule(new Date(minute * 60000 + 500), settings.location, settings.prayer),
    [minute, settings.location, settings.prayer],
  );
  const hour = Math.floor(minute / 60);
  const eid = useMemo(() => eidToday(new Date(hour * 3600000), settings.prayer.hijriOffset), [hour, settings.prayer.hijriOffset]);
  // "Wallpapers from my location": photos of the country / city in Settings.
  const localWalls = !!settings.backgrounds.local && settings.backgrounds.collection !== "custom";
  const [world, setWorld] = useState(null);
  useEffect(() => {
    if (localWalls && !world) loadWorldCatalog().then(setWorld);
  }, [localWalls, world]);
  const day = Math.floor(minute / 1440);
  const builtIn = useMemo(
    () => pickWallpapers(settings.backgrounds.collection, custom, schedule.isNight),
    [settings.backgrounds.collection, custom, schedule.isNight],
  );
  const wallpapers = useMemo(() => {
    if (!localWalls || !world) return builtIn;
    const here = worldPhotos(world, settings.location.country, settings.location.city, schedule.isNight, day);
    // In the UAE the built-in 4K photos join the mix.
    const pool = settings.location.country === "AE" ? [...here, ...builtIn] : here;
    return pool.length ? pool : builtIn;
  }, [localWalls, world, builtIn, settings.location.country, settings.location.city, schedule.isNight, day]);

  const imageDir = settings.backgrounds.customDir || DEFAULT_IMAGE_DIR;
  const rescanImages = useCallback(async () => {
    const list = await listImages(imageDir);
    setCustom(list);
    return list.length;
  }, [imageDir]);
  useEffect(() => {
    listImages(imageDir).then(setCustom);
  }, [imageDir]);

  const runDetect = useCallback(async () => {
    try {
      const loc = await detectLocation();
      update({ location: loc });
      return `Location set to ${loc.label}`;
    } catch (e) {
      return `Could not detect location (${e.message || e}). Using ${settings.location.label}.`;
    }
  }, [update, settings.location.label]);

  useEffect(() => {
    if (loaded && settings.location.mode === "auto") runDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // ---- Navigation --------------------------------------------------------
  const previewTimer = useRef();
  const pageRef = useRef(page);
  useLayoutEffect(() => {
    pageRef.current = page;
  });
  const go = useCallback((p, sec) => {
    clearTimeout(previewTimer.current);
    if (sec) setSection(sec);
    if (p === pageRef.current) {
      restoreMain();
      return;
    }
    pendingFocus.current = true;
    setPage(p);
  }, []);
  // Moving through the sidebar previews pages after a short pause, so
  // scrolling past entries doesn't build every page on the way.
  const preview = useCallback((p) => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPage(p), 260);
  }, []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const id = requestAnimationFrame(() => {
      pendingFocus.current = false;
      focusDefault(document.querySelector("[data-main]"));
    });
    return () => cancelAnimationFrame(id);
  }, [page, loaded]);

  // Coming back from an app (or any window switch): make sure something is focused.
  useEffect(() => {
    const onWindowFocus = () => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.matches?.("[data-nav]")) focusDefault(document.querySelector("[data-main]"));
    };
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, []);

  // Back: page content -> its sidebar entry -> Home. On Home, Back from the
  // sidebar returns to the page. (Pages handle their own sub-views first
  // through the "nav-back" event.)
  const onBack = useCallback(() => {
    if (adhan) return setAdhan(null);
    // Back while an app is still loading cancels it.
    if (launching) {
      setLaunching(null);
      closeApp();
      return;
    }
    const inSidebar = document.activeElement?.closest("[data-sidebar]");
    if (inSidebar) {
      if (page !== "home") return go("home");
      return restoreMain();
    }
    if (page !== "home") return focusEl(document.querySelector(`[data-sidebar] [data-page="${page}"]`));
    const def = document.querySelector("[data-main] [data-nav-default]");
    if (def && document.activeElement !== def) focusEl(def);
    else focusEl(document.querySelector(`[data-sidebar] [data-page="home"]`));
  }, [adhan, page, go, launching]);

  useSpatialNav({ onBack, enabled: !screensaver });
  // In the desktop app controllers are read natively (works inside apps too);
  // the browser preview uses the web Gamepad API.
  useGamepad(!isTauri());
  useEffect(() => {
    const off = listen("gamepad-key", (key) => pressKey(key));
    return () => {
      off.then((f) => f());
    };
  }, []);

  // LB / RB (PageUp / PageDown) switch sidebar pages; Menu jumps to the sidebar.
  useEffect(() => {
    const ORDER = ["search", "home", "livetv", "apps", "games", "prayer", "news", "settings"];
    const onKey = (e) => {
      if (e.defaultPrevented || document.querySelector("[data-nav-scope]")) return;
      if (e.key === "PageUp" || e.key === "PageDown") {
        const i = ORDER.indexOf(page);
        const next = ORDER[(i + (e.key === "PageDown" ? 1 : ORDER.length - 1)) % ORDER.length];
        e.preventDefault();
        go(next);
      } else if (e.key === "ContextMenu") {
        e.preventDefault();
        focusEl(document.querySelector(`[data-sidebar] [data-page="${page}"]`));
      } else if (e.key === "Home" || e.key === "BrowserHome") {
        e.preventDefault();
        go("home");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, go]);

  // ---- Idle detection & screensaver -------------------------------------
  useEffect(() => {
    lastInput.current = Date.now();
    let cursorTimer;
    const activity = (e) => {
      lastInput.current = Date.now();
      if (e.type === "mousemove") {
        document.body.classList.add("show-cursor");
        clearTimeout(cursorTimer);
        cursorTimer = setTimeout(() => document.body.classList.remove("show-cursor"), 3000);
      } else if (e.type === "keydown") {
        // Using the remote: a resting mouse pointer must not grab focus as lists scroll under it.
        document.body.classList.remove("show-cursor");
      }
    };
    const hover = (e) => {
      const el = e.target.closest?.("[data-nav]");
      if (el && el !== document.activeElement && document.body.classList.contains("show-cursor")) el.focus({ preventScroll: true });
    };
    const evs = ["keydown", "mousemove", "pointerdown", "wheel"];
    evs.forEach((ev) => window.addEventListener(ev, activity, true));
    window.addEventListener("mouseover", hover);
    return () => {
      evs.forEach((ev) => window.removeEventListener(ev, activity, true));
      window.removeEventListener("mouseover", hover);
      clearTimeout(cursorTimer);
    };
  }, []);

  // Any key wakes the screen without triggering anything else.
  useEffect(() => {
    if (!screensaver) return;
    const wake = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      setScreensaver(null);
    };
    const t = setTimeout(() => {
      window.addEventListener("keydown", wake, true);
      window.addEventListener("pointerdown", wake, true);
      window.addEventListener("mousemove", wake, true);
    }, 600);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", wake, true);
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("mousemove", wake, true);
    };
  }, [screensaver]);

  useEffect(() => {
    const timeout = settings.screensaver.timeout;
    if (!timeout || screensaver || adhan || appOpen || launching || tvPlaying || gamePlaying) return;
    if (Date.now() - lastInput.current > timeout * 60000 && document.hasFocus()) {
      setScreensaver(settings.screensaver.mode);
    }
  }, [now, settings.screensaver, screensaver, adhan, appOpen, launching, tvPlaying, gamePlaying]);

  // ---- Ambient sound ----------------------------------------------------
  const amb = settings.ambient;
  const ambientOn =
    amb.sound !== "off" &&
    loaded &&
    !appOpen &&
    !jellyfin &&
    !adhan &&
    !tvPlaying &&
    !(reminder?.kind === "takbir" && reminder.sound) &&
    (amb.onlyHome ? page === "home" || !!screensaver : true);
  useEffect(() => {
    if (ambientOn) startAmbient(amb.sound, amb.volume / 100);
    else stopAmbient();
  }, [ambientOn, amb.sound, amb.volume]);
  useEffect(() => {
    setAmbientVolume(amb.volume / 100);
  }, [amb.volume]);
  useEffect(() => () => stopAmbient(), []);

  // ---- Adhan -------------------------------------------------------------
  useEffect(() => {
    if (!settings.adhan.enabled || adhan) return;
    for (const p of schedule.list) {
      if (!ADHAN_PRAYERS.includes(p.key)) continue;
      const diff = now - p.time;
      const id = `${p.time.toDateString()}-${p.key}`;
      if (diff >= 0 && diff < 90000 && !fired.current.has(id)) {
        fired.current.add(id);
        setScreensaver(null);
        setAdhan(p);
        if (settings.notify?.adhan !== false) notifyPhones(settings.notify, t("Adhan · {prayer}", { prayer: t(p.en) }), t("It's time for {prayer}.", { prayer: t(p.en) }), "mosque");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, schedule, settings.adhan.enabled, adhan]);

  // ---- Istighfar reminders & Eid takbir -----------------------------------
  useEffect(() => {
    const r = settings.reminders;
    if (adhan || reminder || launching) return;
    const t = Date.now();
    if (!lastIstighfar.current) lastIstighfar.current = t;
    if (!lastTakbir.current) lastTakbir.current = t - 10 * 60000; // first takbir soon after Eid begins
    const period = r.takbir ? takbirPeriod(now, settings.prayer.hijriOffset, schedule.today) : null;
    if (period && !appOpen && !tvPlaying && t - lastTakbir.current >= r.takbirEvery * 60000) {
      lastTakbir.current = t;
      setReminder({ kind: "takbir", eid: period, sound: r.takbirSound, ...TAKBIR });
      return;
    }
    if (r.istighfar && t - lastIstighfar.current >= r.istighfarEvery * 60000) {
      lastIstighfar.current = t;
      if (appOpen || tvPlaying || (r.quietAtNight && isQuietTime(now, schedule.today))) return;
      const p = ISTIGHFAR[istighfarIndex.current++ % ISTIGHFAR.length];
      if (r.chime) playChime(settings.adhan.volume);
      setReminder({ kind: "istighfar", ...p });
    }
  }, [now, settings.reminders, settings.prayer.hijriOffset, settings.adhan.volume, schedule, adhan, reminder, launching, appOpen, tvPlaying]);

  const closeAdhan = useCallback(() => {
    setAdhan(null);
    lastInput.current = Date.now();
    go("home");
  }, [go]);

  // ---- Apps --------------------------------------------------------------
  useEffect(() => {
    const offs = [
      listen("app-closed", () => {
        setAppOpen(false);
        setLaunching(null);
        lastInput.current = Date.now();
        requestAnimationFrame(() => focusDefault(document.querySelector("[data-main]")));
      }),
      listen("go-home", () => {
        setScreensaver(null);
        setJellyfin(null);
        go("home");
      }),
      listen("app-shown", () => setLaunching(null)),
      listen("volume", (level) => setVolume({ level, at: Date.now() })),
      listen("gamepad-connected", (name) => setToast(t("Controller connected: {name}", { name }))),
      listen("app-moved-to-chrome", () => setToast(t("This video is protected, so it opened in Chrome"))),
      listen("app-error", (msg) => setToast(String(msg))),
    ];
    return () => offs.forEach((p) => p.then((off) => off()));
  }, [go, t]);

  // opts.chrome: open in Chrome even if the app normally opens inside.
  const onLaunch = useCallback(
    async (app, opts = {}) => {
      // Jellyfin opens in YousufOS's own Jellyfin app (Y on the tile: its web page).
      if (app.id === "jellyfin" && settings.jellyfin?.native !== false && !opts.chrome && !opts.web) {
        setJfStart(opts.jfStart || null);
        setJellyfin(app.url || "http://localhost:8096");
        return;
      }
      const inside = !opts.chrome && appOpensInside(app, settings.appView);
      setLaunching(app);
      setLastApp(app);
      try {
        await launchApp(app, { browser: settings.browser, embed: inside, t, osk: settings.osk !== false, dpad: settings.dpad !== false, lang: i18n.lang, ...opts });
        if (isTauri()) setAppOpen(true);
      } catch (e) {
        setToast(t("Couldn't open {name}: {error}", { name: app.name, error: String(e) }));
      }
      // Apps inside YousufOS stay behind this loading screen until their page
      // has loaded ("app-shown"); Chrome apps cover it after a few seconds.
      setTimeout(() => setLaunching(null), isTauri() ? (inside ? 12000 : 4000) : 1200);
    },
    [settings.browser, settings.appView, settings.osk, settings.dpad, settings.jellyfin?.native, i18n.lang, t],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const actions = useMemo(() => ({
    testAdhan: () => setAdhan({ ...schedule.next, time: new Date() }),
    previewIstighfar: () => {
      const p = ISTIGHFAR[istighfarIndex.current++ % ISTIGHFAR.length];
      if (settings.reminders.chime) playChime(settings.adhan.volume);
      setReminder({ kind: "istighfar", ...p });
    },
    previewTakbir: () => setReminder({ kind: "takbir", eid: "Eid al-Adha", sound: settings.reminders.takbirSound, ...TAKBIR }),
    previewScreensaver: () => setTimeout(() => setScreensaver(settings.screensaver.mode), 300),
    previewMorning: () => setTimeout(() => setMorning(true), 200),
    detectLocation: runDetect,
    rescanImages,
  }), [schedule.next, settings.reminders, settings.adhan.volume, settings.screensaver.mode, runDetect, rescanImages]);

  // ---- Phone remote / admin panel ----------------------------------------
  useAdminServer(settings.admin);
  useRecordingScheduler(settings, update, now);
  const screen = useCallback(() => {
    if (jfPlaying) return { title: "Jellyfin", detail: t("Playing") };
    if (jellyfin) return { title: "Jellyfin" };
    if (appOpen && lastApp) return { title: lastApp.name };
    if (liveTvPlaying) return { title: t("Live TV") };
    return { title: t({ home: "Home", livetv: "Live TV", apps: "Apps", games: "Games", prayer: "Prayer", news: "News", settings: "Settings", search: "Search" }[page] || "Home") };
  }, [jfPlaying, jellyfin, appOpen, lastApp, liveTvPlaying, page, t]);
  const cast = useCallback(
    async (raw) => {
      let url = raw.trim();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      let u;
      try {
        u = new URL(url);
      } catch {
        return { error: "That isn't a link." };
      }
      const yt = (() => {
        if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split("/")[0];
        if (/(^|\.)youtube\.com$/.test(u.hostname)) return u.searchParams.get("v") || u.pathname.match(/\/(shorts|live|embed)\/([^/?]+)/)?.[2];
        return null;
      })();
      setScreensaver(null);
      setJellyfin(null);
      if (yt) {
        const app = apps.find((a) => a.id === "youtube");
        if (app) onLaunch({ ...app, url: `https://www.youtube.com/tv#/watch?v=${encodeURIComponent(yt)}` });
        return { ok: true, opened: "youtube" };
      }
      if (/\.(m3u8|mp4|mkv|webm|mov|mp3|m4a|ts|mpd)(\?|$)/i.test(u.pathname)) {
        await playExternal([{ name: u.hostname, url: u.href }], 0);
        return { ok: true, opened: "player" };
      }
      onLaunch({ id: "cast", name: u.hostname.replace(/^www\./, ""), url: u.href, inside: true, bg: "#1b1d24" });
      return { ok: true, opened: "web" };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apps],
  );
  useAdminBridge({
    settings,
    update,
    apps,
    t,
    screen,
    cast,
    onLaunch: (app) => onLaunch(app),
    toast: setToast,
    showPhoto: (path) => {
      if (appOpen) closeApp();
      setScreensaver(null);
      setCastPhoto(fileSrc(path));
    },
    restore: (cfg) => {
      replace(cfg);
      setToast(t("Settings restored from the backup"));
    },
  });

  // Phones hear when a recording is done.
  const jobStates = useRef({});
  useEffect(() => {
    const off = listen("media-jobs", (list) => {
      for (const j of list || []) {
        const before = jobStates.current[j.id];
        jobStates.current[j.id] = j.state;
        if (before === "running" && j.state !== "running" && j.kind === "record") {
          const msg = j.state === "done" ? t("Recording finished: {name}", { name: j.name }) : t("Recording stopped: {name}", { name: j.name });
          setToast(msg);
          if (settings.notify?.recordings !== false) notifyPhones(settings.notify, "YousufOS", msg, "red_circle");
        }
      }
    });
    return () => off.then((f) => f());
  }, [settings.notify, t]);

  // ---- Morning screen -----------------------------------------------------
  const morningShown = useRef("");
  useEffect(() => {
    const m = settings.morning;
    if (!m?.enabled || !loaded) return;
    const d = new Date(minute * 60000);
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const day = d.toDateString();
    if (hhmm === m.time && (m.days || [0, 1, 2, 3, 4, 5, 6]).includes(d.getDay()) && morningShown.current !== day && !jfPlaying && !liveTvPlaying && !adhan) {
      morningShown.current = day;
      setScreensaver(null);
      setMorning(true);
      if (m.chime) playChime(settings.adhan.volume);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, settings.morning, loaded]);

  // ---- Daily update check -------------------------------------------------
  useEffect(() => {
    const u = settings.updates;
    if (!isTauri() || !loaded || !u?.auto || !u.repo || Date.now() - (u.lastCheck || 0) < 20 * 3600000) return;
    update("updates.lastCheck", Date.now());
    checkUpdate(u).then((r) => {
      if (r.available && r.latest !== u.skip) setToast(t("YousufOS {version} is available: Settings → System → Updates", { version: r.latest }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, loaded]);

  const common = { now: minuteNow, settings, schedule, go };
  const pages = {
    home: (
      <Home
        {...common}
        apps={apps}
        wallpaper={wallpaper}
        onLaunch={onLaunch}
        eid={eid}
        onJellyfin={(item) => {
          setJfStart({ item, play: true });
          setJellyfin(normalizeServer(settings.appUrls?.jellyfin || "http://localhost:8096"));
        }}
      />
    ),
    apps: <Apps apps={apps} onLaunch={onLaunch} />,
    search: (
      <Search
        settings={settings}
        apps={apps}
        onLaunch={onLaunch}
        onJellyfin={(item) => {
          setJfStart({ item, play: false });
          setJellyfin(normalizeServer(settings.appUrls?.jellyfin || "http://localhost:8096"));
        }}
      />
    ),
    livetv: <LiveTV settings={settings} update={update} paused={!!adhan} onPlayingChange={setTvPlaying} />,
    games: <Games settings={settings} update={update} onPlayingChange={setGamePlaying} />,
    prayer: <Prayer {...common} />,
    news: <News settings={settings} onOpen={onLaunch} />,
    settings: (
      <Settings settings={settings} update={update} section={section} setSection={setSection} actions={actions} customCount={custom.length} />
    ),
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Background images={wallpapers} fallback={builtIn} interval={settings.backgrounds.interval} onChange={setWallpaper} />
      {page !== "home" && <div className="page-veil pointer-events-none absolute inset-0" style={{ animation: "page-in 300ms ease both" }} />}

      <Sidebar
        page={page}
        onPreview={preview}
        onChoose={go}
        clock={formatTime(new Date(minute * 60000), settings.clock24)}
        nextPrayer={t(schedule.next.en)}
        now={t("in {time}", { time: formatCountdown(schedule.next.time - minute * 60000, t) })}
      />

      <main data-main className="relative z-10 flex h-full flex-col">
        <div key={page} className="page-in min-h-0 flex-1">
          {pages[page]}
        </div>
        {page === "home" && settings.news.enabled && <NewsTicker />}
      </main>

      {toast && (
        <div className="glass-strong fixed bottom-[5rem] start-1/2 z-[90] -translate-x-1/2 rtl:translate-x-1/2 rounded-full px-[1.8rem] py-[0.9rem] text-[1.1rem] shadow-2xl fade-up">
          {toast}
        </div>
      )}
      {jellyfin && (
        <JellyfinApp
          server={jellyfin}
          start={jfStart}
          settings={settings}
          update={update}
          timeLabel={formatTime(new Date(minute * 60000), settings.clock24)}
          onPlayingChange={setJfPlaying}
          onClose={() => {
            setJellyfin(null);
            setJfStart(null);
            lastInput.current = Date.now();
            requestAnimationFrame(() => restoreMain());
          }}
          onOpenWeb={() => {
            const app = apps.find((a) => a.id === "jellyfin") || { id: "jellyfin", name: "Jellyfin", url: jellyfin };
            setJellyfin(null);
            onLaunch({ ...app, url: jellyfin }, { web: true });
          }}
        />
      )}
      {castPhoto && <CastPhoto src={castPhoto} onClose={() => setCastPhoto(null)} />}
      {morning && <MorningScreen now={now} settings={settings} schedule={schedule} onClose={() => setMorning(false)} />}
      {launching && <LaunchSplash app={launching} />}
      {volume && <VolumeHud key={volume.at} level={volume.level} onDone={() => setVolume(null)} />}
      {screensaver && <Screensaver mode={screensaver} fallback={builtIn} settings={settings} schedule={schedule} wallpapers={wallpapers} />}
      {reminder && !adhan && <ReminderBanner reminder={reminder} volume={settings.adhan.volume} onDone={() => setReminder(null)} />}
      {adhan && <AdhanOverlay prayer={adhan} settings={settings} onClose={closeAdhan} />}
    </div>
  );
}
