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
import Quran from "./pages/Quran";
import NowReciting from "./quran/NowReciting";
import { pause as pauseRecitation, useRecitation } from "./quran/audio";
import { loadQuran } from "./quran/data";
import { ramadanInfo, IFTAR_DUA, QADR_DUA, SUHOOR_HADITH } from "./lib/ramadan";
import { KIDS_PAGES, kidsAllowsApp, kidsLock, today as todayKey } from "./lib/kids";
import KidsLock from "./components/KidsLock";
import PinPad from "./components/PinPad";
import { SleepMenu, SleepScreen, SleepWarning } from "./components/SleepTimer";
import Cameras from "./pages/Cameras";
import DoorbellBanner from "./components/DoorbellBanner";
import { popupCamera, snapshot as cameraSnapshot, useDoorbell, watchCamera } from "./lib/cameras";
import JellyfinApp from "./jellyfin/JellyfinApp";
import { normalizeServer } from "./jellyfin/api";
import CastPhoto from "./components/CastPhoto";
import MorningScreen from "./components/MorningScreen";
import { useAdminBridge, useAdminServer, useRecordingScheduler } from "./lib/admin-bridge";
import { notifyPhones } from "./lib/notify";
import { checkUpdate, installUpdate } from "./lib/updates";
import { useSettings } from "./lib/settings-store";
import { applyFonts } from "./lib/fonts";
import { startAmbient, stopAmbient, setAmbientVolume } from "./lib/ambient";
import { formatCountdown, formatTime } from "./lib/prayer";
import { useNow } from "./lib/useNow";
import { ADHAN_PRAYERS, prayerSchedule } from "./lib/prayer";
import { pickWallpapers } from "./lib/wallpapers";
import { loadWorldCatalog, mixedPhotos, worldPhotos } from "./lib/worldWallpapers";
import { focusDefault, focusEl, pressKey, restoreMain, useGamepad, useSpatialNav } from "./lib/nav";
import { android, closeApp, fileSrc, invoke, isAndroid, isTauri, launchApp, listImages, listen, playExternal, playerCommand, system } from "./lib/platform";
import { androidAppList, openAndroidApp, useAndroidApps } from "./lib/android-apps";
import { appOpensInside } from "./lib/apps";
import VolumeHud from "./components/VolumeHud";
import { detectLocation } from "./lib/location";
import { onColor } from "./lib/color";
import { applyTheme } from "./lib/themes";
import ReminderBanner from "./components/ReminderBanner";
import { ISTIGHFAR, TAKBIR, eidToday, isQuietTime, playChime, takbirPeriod } from "./lib/reminders";

const DEFAULT_IMAGE_DIR = "~/Pictures/YousufOS";
// Red, green, yellow and blue on the TV remote.
const COLOR_PAGES = { ColorRed: "livetv", ColorGreen: "quran", ColorYellow: "prayer", ColorBlue: "apps" };

export default function App() {
  const { settings, update, replace, accent, apps: catalogApps, loaded, i18n } = useSettings();
  // Android TV: the TV's own apps (known ones keep YousufOS's logos).
  const androidInstalled = useAndroidApps();
  const { apps: allApps, more: moreApps } = useMemo(
    () => (isAndroid() ? androidAppList(catalogApps, androidInstalled) : { apps: catalogApps, more: [] }),
    [catalogApps, androidInstalled],
  );
  // ---- Kids profile: only the apps, pages and time a parent allowed --------
  const kids = settings.kids || {};
  const kidsOn = !!kids.active;
  const kidsAccount = kidsOn && kids.jellyfin ? (settings.jellyfin?.accounts || []).find((a) => a.userId === kids.jellyfin) || null : null;
  const kidsMay = useCallback((a) => kidsAllowsApp(kids, a) || (a.id === "jellyfin" && !!kidsAccount), [kids, kidsAccount]);
  const apps = useMemo(() => (kidsOn ? allApps.filter(kidsMay) : allApps), [kidsOn, allApps, kidsMay]);
  const kidsPages = useMemo(
    () => KIDS_PAGES.filter((p) => (p === "livetv" ? kids.tv !== false : p === "games" ? kids.games !== false : p === "quran" ? kids.quran !== false : true)),
    [kids.tv, kids.games, kids.quran],
  );
  const [kidsPin, setKidsPin] = useState(false);
  // Jellyfin in the Kids profile signs in as the child's account only.
  const jfSettings = useMemo(
    () => (kidsOn ? { ...settings, jellyfin: { ...settings.jellyfin, auth: kidsAccount, accounts: kidsAccount ? [kidsAccount] : [], askProfile: false } } : settings),
    [kidsOn, kidsAccount, settings],
  );
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
  // Opening the Qur'an reader from elsewhere: { index, play }.
  const [quranOpen, setQuranOpen] = useState(null);
  const recitation = useRecitation();
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
  const ramadan = useMemo(() => ramadanInfo(new Date(minute * 60000), schedule, settings), [minute, schedule, settings]);
  const hour = Math.floor(minute / 60);
  const eid = useMemo(() => eidToday(new Date(hour * 3600000), settings.prayer.hijriOffset), [hour, settings.prayer.hijriOffset]);
  // Where the wallpapers come from (Settings → Wallpapers):
  //   builtin: the built-in UAE photos (collection) · local: photos of your country
  //   world: from around the world · country: one chosen country
  //   countries: a chosen group · custom: your own folder
  const bg = settings.backgrounds;
  const wallSource = bg.source || (bg.collection === "custom" ? "custom" : bg.local ? "local" : "builtin");
  const usesWorld = ["local", "world", "country", "countries"].includes(wallSource);
  const [world, setWorld] = useState(null);
  useEffect(() => {
    if (usesWorld && !world) loadWorldCatalog().then(setWorld);
  }, [usesWorld, world]);
  const day = Math.floor(minute / 1440);
  const builtIn = useMemo(
    () => pickWallpapers(wallSource === "custom" ? "custom" : bg.collection === "custom" ? "all" : bg.collection, custom, schedule.isNight),
    [wallSource, bg.collection, custom, schedule.isNight],
  );
  const wallpapers = useMemo(() => {
    if (!usesWorld || !world) return builtIn;
    let here;
    let country = null;
    if (wallSource === "local") {
      country = settings.location.country;
      here = worldPhotos(world, country, settings.location.city, schedule.isNight, day);
    } else if (wallSource === "country") {
      country = bg.country || settings.location.country;
      here = worldPhotos(world, country, "", schedule.isNight, day);
    } else here = mixedPhotos(world, wallSource === "countries" ? bg.countries || [] : null, schedule.isNight, day);
    // UAE: the built-in 4K photos join the mix.
    const pool = country === "AE" ? [...here, ...builtIn] : here;
    return pool.length ? pool : builtIn;
  }, [usesWorld, world, builtIn, wallSource, bg.country, bg.countries, settings.location.country, settings.location.city, schedule.isNight, day]);

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
  const allowedRef = useRef(null);
  useLayoutEffect(() => {
    allowedRef.current = kidsOn ? kidsPages : null;
  });
  const go = useCallback((p, sec) => {
    clearTimeout(previewTimer.current);
    if (allowedRef.current && !allowedRef.current.includes(p)) p = "home";
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
    if (allowedRef.current && !allowedRef.current.includes(p)) return;
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
    const ORDER = kidsOn ? kidsPages : ["search", "home", "livetv", "apps", "games", "prayer", "quran", "cameras", "news", "settings"];
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
      } else if (COLOR_PAGES[e.key]) {
        // The TV remote's coloured buttons jump straight to a page.
        e.preventDefault();
        if (ORDER.includes(COLOR_PAGES[e.key])) go(COLOR_PAGES[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, go, kidsOn, kidsPages]);

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
    !recitation.active &&
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
        const iftar = ramadan && p.key === "maghrib";
        if (iftar && settings.ramadan?.notify !== false) notifyPhones(settings.notify, t("Iftar time"), `${IFTAR_DUA.ar}\n${t(IFTAR_DUA.en)}`, "crescent_moon");
        else if (settings.notify?.adhan !== false) notifyPhones(settings.notify, t("Adhan · {prayer}", { prayer: t(p.en) }), t("It's time for {prayer}.", { prayer: t(p.en) }), "mosque");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, schedule, settings.adhan.enabled, adhan]);

  // Android TV: come to the front at prayer time even when another app is open.
  const alarmKey = settings.adhan.enabled ? schedule.today.fajr.getTime() + "-" + schedule.tomorrow.fajr.getTime() : "off";
  useEffect(() => {
    if (!isAndroid()) return;
    const at = settings.adhan.enabled
      ? [schedule.today, schedule.tomorrow].flatMap((d) => ADHAN_PRAYERS.map((k) => d[k]?.getTime())).filter((x) => x > Date.now()).sort((a, b) => a - b)
      : [];
    try {
      android().setAlarms(JSON.stringify(at.slice(0, 12).map((x) => ({ at: x + 1000, kind: "adhan" }))));
    } catch (e) {
      console.warn("alarms", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmKey]);

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

  // ---- Ramadan: suhoor alarm, iftar (when the Adhan is off), Laylat al-Qadr ----
  useEffect(() => {
    if (!ramadan || !loaded) return;
    const r = settings.ramadan || {};
    const fire = (id, make) => {
      if (fired.current.has(id)) return false;
      fired.current.add(id);
      make();
      return true;
    };
    const within = (time) => now - time >= 0 && now - time < 90000;
    const day = schedule.today.fajr.toDateString();
    const alarmAt = new Date(ramadan.suhoorEnds - (r.suhoorMinutes ?? 30) * 60000);
    if (r.suhoorAlarm !== false && within(alarmAt))
      fire(`suhoor-${alarmAt.toDateString()}`, () => {
        const title = t("Suhoor ends in {m} min", { m: r.suhoorMinutes ?? 30 });
        setScreensaver(null);
        playChime(settings.adhan.volume);
        setReminder({ kind: "suhoor", title, ar: SUHOOR_HADITH.ar, en: SUHOOR_HADITH.en, duration: 60000 });
        if (r.notify !== false) notifyPhones(settings.notify, title, `${SUHOOR_HADITH.ar}\n${t(SUHOOR_HADITH.en)}`, "crescent_moon");
      });
    if (!settings.adhan.enabled && within(schedule.today.maghrib))
      fire(`iftar-${day}`, () => {
        playChime(settings.adhan.volume);
        setReminder({ kind: "iftar", title: t("Iftar time"), ar: IFTAR_DUA.ar, en: IFTAR_DUA.en, duration: 45000 });
        if (r.notify !== false) notifyPhones(settings.notify, t("Iftar time"), `${IFTAR_DUA.ar}\n${t(IFTAR_DUA.en)}`, "crescent_moon");
      });
    const qadrAt = new Date(schedule.today.isha.getTime() + 30 * 60000);
    if (r.qadr !== false && ramadan.oddNight && within(qadrAt))
      fire(`qadr-${day}`, () => {
        setReminder({ kind: "qadr", title: t("Tonight may be Laylat al-Qadr (night {n})", { n: ramadan.night }), ar: QADR_DUA.ar, en: QADR_DUA.en, duration: 30000 });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, ramadan, loaded]);

  // ---- Kids profile: daily minutes and bedtime ------------------------------
  const lockReason = useMemo(() => kidsLock(new Date(minute * 60000), kids), [minute, kids]);
  const counted = useRef(0);
  useEffect(() => {
    if (!kidsOn || !loaded || lockReason || screensaver || counted.current === minute) return;
    if (!counted.current) {
      counted.current = minute; // start counting from the next minute
      return;
    }
    counted.current = minute;
    const day = todayKey(new Date(minute * 60000));
    update("kids.usage", (u = {}) => ({ date: day, minutes: (u.date === day ? u.minutes || 0 : 0) + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, kidsOn, loaded, lockReason, screensaver]);
  // Locked: everything that's playing stops.
  useEffect(() => {
    if (!lockReason) return;
    closeApp();
    playerCommand("quit").catch(() => {});
    invoke("pip_stop").catch(() => {});
    pauseRecitation();
  }, [lockReason]);
  // A page the Kids profile doesn't have shows Home instead.
  const shownPage = kidsOn && !kidsPages.includes(page) ? "home" : page;
  const setKids = useCallback(
    (on) => {
      update("kids.active", on);
      setToast(on ? t("Kids profile is on") : t("Kids profile is off"));
      if (on) go("home");
    },
    [update, go, t],
  );
  const ringRef = useRef(null);
  const setKidsRef = useRef(setKids);
  useLayoutEffect(() => {
    setKidsRef.current = setKids;
  });

  // ---- Sleep timer ------------------------------------------------------------
  // sleep: { until } (a time) or { end: true } (when what's playing finishes).
  const [sleep, setSleep] = useState(null);
  const [sleepMenu, setSleepMenu] = useState(false);
  const [sleepDark, setSleepDark] = useState(false);
  const sleepAction = settings.sleepAction || "screen";
  const stopEverything = useCallback(() => {
    closeApp();
    playerCommand("quit").catch(() => {});
    invoke("pip_stop").catch(() => {});
    pauseRecitation();
    setJellyfin(null);
    go("home");
  }, [go]);
  const goToSleep = useCallback(() => {
    setSleep(null);
    stopEverything();
    if (sleepAction === "suspend") system("suspend").catch(() => {});
    else if (sleepAction === "screen") {
      setSleepDark(true);
      system("screen-off").catch(() => {});
      // Android TV: let the TV switch itself off as it normally would.
      if (isAndroid()) android().keepScreenOn(false);
    }
  }, [sleepAction, stopEverything]);
  const goToSleepRef = useRef(goToSleep);
  useLayoutEffect(() => {
    goToSleepRef.current = goToSleep;
  });
  useEffect(() => {
    if (!sleep?.until) return;
    const id = setTimeout(() => goToSleepRef.current(), Math.max(0, sleep.until - Date.now()));
    return () => clearTimeout(id);
  }, [sleep]);
  // "At the end of what's playing": the next film / episode starting, the
  // player closing, or the recitation finishing.
  useEffect(() => {
    if (!sleep?.end) return;
    let index = null;
    const offs = [
      listen("media-progress", (p) => {
        if (index === null) index = p.index;
        else if (p.index !== index) goToSleepRef.current();
      }),
      listen("media-closed", () => goToSleepRef.current()),
      listen("player-closed", () => goToSleepRef.current()),
    ];
    return () => offs.forEach((o) => o.then((f) => f()));
  }, [sleep]);
  const recWasActive = useRef(false);
  useEffect(() => {
    if (sleep?.end && recWasActive.current && !recitation.active) goToSleepRef.current();
    recWasActive.current = recitation.active;
  }, [recitation.active, sleep]);
  const setSleepTimer = useCallback(
    (choice) => {
      if (choice === "off") setSleep(null);
      else if (choice === "end") setSleep({ end: true });
      else setSleep({ until: Date.now() + choice * 60000, minutes: choice });
      setSleepMenu(false);
      setToast(choice === "off" ? t("Sleep timer off") : choice === "end" ? t("Sleep timer: at the end of what's playing") : t("Sleep timer: {n} min", { n: choice }));
    },
    [t],
  );
  const sleepLeft = sleep?.until ? sleep.until - now : null;
  const mediaPlaying = jfPlaying || liveTvPlaying || recitation.active;

  // ---- Doorbell -----------------------------------------------------------------
  const [doorbell, setDoorbell] = useState(null); // { name, seconds, at }
  const lastRing = useRef(0);
  useEffect(() => {
    if (loaded && !settings.cameras?.doorbell?.key) update("cameras.doorbell.key", Math.random().toString(36).slice(2, 12));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  const ringDoorbell = useCallback(
    (cameraId, test = false) => {
      const c = settings.cameras || {};
      const d = c.doorbell || {};
      if (d.enabled === false && !test) return;
      if (Date.now() - lastRing.current < 15000 && !test) return;
      lastRing.current = Date.now();
      const cam = (c.list || []).find((x) => x.id === (cameraId || d.camera));
      const seconds = d.seconds ?? 45;
      setScreensaver(null);
      if (sleepDark) {
        setSleepDark(false);
        if (isAndroid()) android().keepScreenOn(true);
        system("screen-on").catch(() => {});
      }
      if (d.chime !== false) {
        playChime(Math.max(0.5, settings.adhan.volume));
        setTimeout(() => playChime(Math.max(0.5, settings.adhan.volume)), 700);
      }
      setDoorbell({ name: cam?.name || "", seconds, at: Date.now() });
      if (cam && isTauri()) {
        popupCamera(cam, settings, "tr").catch((e) => setToast(String(e)));
        setTimeout(() => invoke("pip_stop").catch(() => {}), seconds * 1000);
      }
      if (d.notify !== false) notifyPhones(settings.notify, t("Doorbell"), t("Someone's at the door"), "bell");
    },
    [settings, sleepDark, t],
  );
  useDoorbell(settings, ringDoorbell);
  useLayoutEffect(() => {
    ringRef.current = ringDoorbell;
  });

  // The Adhan, Live TV and films pause a recitation.
  useEffect(() => {
    if (adhan || tvPlaying || appOpen) pauseRecitation();
  }, [adhan, tvPlaying, appOpen]);

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
      // Android TV: phone-remote buttons go to Android (YousufOS or its player),
      // and YousufOS comes to the front when asked (Adhan, Home on the phone).
      listen("remote-button", (b) => isAndroid() && android().key(String(b))),
      listen("bring-to-front", () => isAndroid() && android().toFront()),
      listen("android-alarm", () => setScreensaver(null)),
      listen("update-failed", (e) => setToast(t("The update didn't install: {error}", { error: e?.error || "" }))),
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
      if (kidsOn && app.id !== "cast" && !kidsMay(app)) {
        setToast(t("Ask a parent to allow {name}", { name: app.name }));
        return;
      }
      // Jellyfin opens in YousufOS's own Jellyfin app (Y on the tile: its web page).
      if (app.id === "jellyfin" && settings.jellyfin?.native !== false && !opts.chrome && !opts.web) {
        setJfStart(opts.jfStart || null);
        setJellyfin(app.url || "http://localhost:8096");
        return;
      }
      if (isAndroid()) {
        try {
          openAndroidApp(app);
        } catch (e) {
          setToast(t("Couldn't open {name}: {error}", { name: app.name, error: e.message || String(e) }));
        }
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
    [settings.browser, settings.appView, settings.osk, settings.dpad, settings.jellyfin?.native, i18n.lang, t, kidsOn, kidsMay],
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
    previewSuhoor: () => {
      playChime(settings.adhan.volume);
      setReminder({ kind: "suhoor", title: t("Suhoor ends in {m} min", { m: settings.ramadan?.suhoorMinutes ?? 30 }), ar: SUHOOR_HADITH.ar, en: SUHOOR_HADITH.en, duration: 20000 });
    },
    previewIftar: () => setAdhan({ ...schedule.list.find((p) => p.key === "maghrib"), time: new Date(), preview: "iftar" }),
    detectLocation: runDetect,
    rescanImages,
    setKids: (on) => setKidsRef.current(on),
    ringDoorbell: () => ringRef.current(null, true),
  }), [schedule.next, schedule.list, settings.reminders, settings.ramadan, settings.adhan.volume, settings.screensaver.mode, runDetect, rescanImages, t]);

  // ---- Phone remote / admin panel ----------------------------------------
  useAdminServer(settings.admin);
  useRecordingScheduler(settings, update, now);
  const screen = useCallback(() => {
    if (jfPlaying) return { title: "Jellyfin", detail: t("Playing") };
    if (jellyfin) return { title: "Jellyfin" };
    if (appOpen && lastApp) return { title: lastApp.name };
    if (liveTvPlaying) return { title: t("Live TV") };
    return { title: t({ home: "Home", livetv: "Live TV", apps: "Apps", games: "Games", prayer: "Prayer", quran: "Qur'an", cameras: "Cameras", news: "News", settings: "Settings", search: "Search" }[page] || "Home") };
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
    status: () => ({ kids: kidsOn, kidsLocked: lockReason || null, sleep: sleep ? (sleep.end ? "end" : Math.round((sleep.until - Date.now()) / 60000)) : null }),
    extra: {
      "cameras.list": () => ({ cameras: (settings.cameras?.list || []).map((c) => ({ id: c.id, name: c.name })), doorbell: settings.cameras?.doorbell?.camera || "" }),
      "camera.snapshot": async ({ id }) => {
        const cam = (settings.cameras?.list || []).find((c) => c.id === id);
        if (!cam) return { error: "No such camera" };
        const r = await cameraSnapshot(cam, settings);
        return { ok: true, at: r.at };
      },
      "camera.show": async ({ id }) => {
        const cam = (settings.cameras?.list || []).find((c) => c.id === id);
        if (!cam) return { error: "No such camera" };
        await watchCamera(cam, settings);
        return { ok: true };
      },
      "doorbell.test": () => {
        ringDoorbell(null, true);
        return { ok: true };
      },
      "sleep.set": ({ minutes }) => {
        setSleepTimer(minutes === "end" || minutes === "off" ? minutes : Math.max(1, Math.min(600, +minutes || 30)));
        return { ok: true };
      },
      "kids.set": ({ on }) => {
        if (on && !kids.pin) return { error: "Set a parent PIN on the TV first (Settings → Kids profile)." };
        setKids(!!on);
        return { ok: true };
      },
      "kids.more": ({ minutes = 30 }) => {
        update("kids.unlockUntil", Date.now() + Math.min(240, +minutes || 30) * 60000);
        return { ok: true };
      },
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
    // Android TV installs updates by itself, so it looks more often.
    const every = isAndroid() ? 6 : 20;
    if (!isTauri() || !loaded || !u?.auto || Date.now() - (u.lastCheck || 0) < every * 3600000) return;
    update("updates.lastCheck", Date.now());
    checkUpdate(u).then((r) => {
      if (!r.available || r.latest === u.skip) return;
      if (isAndroid() && u.autoInstall !== false) {
        // Not in the middle of a video or the Adhan; the next check tries again.
        if (android().playerOpen() || adhan) {
          update("updates.lastCheck", 0);
          return;
        }
        setToast(t("Updating YousufOS to {version}…", { version: r.latest }));
        installUpdate(u, r.release).catch((e) => setToast(t("The update didn't install: {error}", { error: String(e?.message || e) })));
        return;
      }
      setToast(t("YousufOS {version} is available: Settings → System → Updates", { version: r.latest }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, loaded]);

  const common = { now: minuteNow, settings, schedule, go };
  const pages = {
    home: (
      <Home
        {...common}
        settings={jfSettings}
        apps={apps}
        wallpaper={wallpaper}
        onLaunch={onLaunch}
        eid={eid}
        ramadan={ramadan}
        onJellyfin={kidsOn && !kidsAccount ? null : (item) => {
          setJfStart({ item, play: true });
          setJellyfin(normalizeServer(settings.appUrls?.jellyfin || "http://localhost:8096"));
        }}
      />
    ),
    apps: <Apps apps={apps} more={kidsOn ? [] : moreApps} onLaunch={onLaunch} />,
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
    livetv: <LiveTV settings={settings} update={update} paused={!!adhan} onPlayingChange={setTvPlaying} kids={kidsOn} />,
    games: <Games settings={settings} update={update} onPlayingChange={setGamePlaying} />,
    prayer: (
      <Prayer
        {...common}
        ramadan={ramadan}
        update={update}
        onReadJuz={async (j) => {
          const q = await loadQuran();
          setQuranOpen({ index: q.juzStart[j - 1] });
          go("quran");
        }}
      />
    ),
    quran: <Quran key={quranOpen ? "open" : "index"} settings={settings} update={update} open={quranOpen} onOpened={() => setQuranOpen(null)} />,
    news: <News settings={settings} onOpen={onLaunch} />,
    cameras: <Cameras settings={settings} go={go} />,
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
        kids={kidsOn ? kidsPages : null}
        onExitKids={() => setKidsPin(true)}
        sleepLabel={sleep ? (sleep.end ? t("At the end") : formatCountdown(Math.max(60000, sleepLeft), t)) : null}
        onSleep={() => setSleepMenu(true)}
        onPreview={preview}
        onChoose={go}
        clock={formatTime(new Date(minute * 60000), settings.clock24)}
        nextPrayer={t(schedule.next.en)}
        now={t("in {time}", { time: formatCountdown(schedule.next.time - minute * 60000, t) })}
      />

      <main data-main className="relative z-10 flex h-full flex-col">
        <div key={shownPage} className="page-in min-h-0 flex-1">
          {pages[shownPage]}
        </div>
        {shownPage === "home" && settings.news.enabled && !kidsOn && <NewsTicker />}
      </main>

      {toast && (
        <div className="glass-strong fixed bottom-[5rem] start-1/2 z-[90] -translate-x-1/2 rtl:translate-x-1/2 rounded-full px-[1.8rem] py-[0.9rem] text-[1.1rem] shadow-2xl fade-up">
          {toast}
        </div>
      )}
      {jellyfin && !lockReason && (
        <JellyfinApp
          server={jellyfin}
          start={jfStart}
          settings={jfSettings}
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
      {page !== "quran" && !jellyfin && <NowReciting onOpen={() => go("quran")} />}
      {castPhoto && <CastPhoto src={castPhoto} onClose={() => setCastPhoto(null)} />}
      {morning && <MorningScreen now={now} settings={settings} schedule={schedule} onClose={() => setMorning(false)} />}
      {launching && <LaunchSplash app={launching} />}
      {volume && <VolumeHud key={volume.at} level={volume.level} onDone={() => setVolume(null)} />}
      {screensaver && !lockReason && <Screensaver mode={screensaver} fallback={builtIn} settings={settings} schedule={schedule} wallpapers={wallpapers} />}
      {reminder && !adhan && <ReminderBanner reminder={reminder} volume={settings.adhan.volume} onDone={() => setReminder(null)} />}
      {doorbell && <DoorbellBanner key={doorbell.at} name={doorbell.name} seconds={doorbell.seconds} onDone={() => setDoorbell(null)} />}
      {sleepMenu && (
        <SleepMenu
          sleep={sleep}
          canEnd={mediaPlaying}
          action={sleepAction}
          onSet={setSleepTimer}
          onAction={(a) => update("sleepAction", a)}
          onClose={() => setSleepMenu(false)}
        />
      )}
      {sleep?.until && sleepLeft <= 60000 && !sleepMenu && (
        <SleepWarning
          seconds={Math.max(0, Math.round(sleepLeft / 1000))}
          onMore={() => setSleep({ until: Date.now() + 15 * 60000, minutes: 15 })}
          onCancel={() => setSleepTimer("off")}
        />
      )}
      {sleepDark && (
        <SleepScreen
          onWake={() => {
            setSleepDark(false);
            if (isAndroid()) android().keepScreenOn(true);
        if (isAndroid()) android().keepScreenOn(true);
            system("screen-on").catch(() => {});
          }}
        />
      )}
      {lockReason && (
        <KidsLock
          reason={lockReason}
          kids={kids}
          onMore={() => update("kids.unlockUntil", Date.now() + 30 * 60000)}
          onExit={() => setKids(false)}
        />
      )}
      {kidsPin && (
        <PinPad
          title={t("Parent PIN")}
          hint={t("Back to the full YousufOS")}
          onCancel={() => setKidsPin(false)}
          onSubmit={(pin) => {
            if (pin !== kids.pin) return false;
            setKidsPin(false);
            setKids(false);
            return true;
          }}
        />
      )}
      {adhan && <AdhanOverlay prayer={adhan} settings={settings} onClose={closeAdhan} iftar={adhan.preview === "iftar" || (!!ramadan && settings.ramadan?.iftarDua !== false && adhan.key === "maghrib")} />}
    </div>
  );
}
