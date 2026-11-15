import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Baby, Cctv, Palette, MapPin, MonitorPlay, House, AppWindow, Tv, Pencil, BellRing, Languages, Music, Gamepad2, Image as ImageIcon, Newspaper, Cpu, Play, LocateFixed, Globe, RefreshCw, LogOut, Power, RotateCcw, Moon, Smartphone } from "lucide-react";
import { OptionRow, ToggleRow, SliderRow, ActionRow, SectionTitle } from "../components/controls";
import { BackupRows, MorningRows, PhoneSection, PipRows, UpdatesRows } from "./SettingsExtra";
import { CamerasSection, KidsSection, RamadanRows } from "./SettingsMore";
import TextEntry from "../components/TextEntry";
import CountryPicker from "../components/CountryPicker";
import { MosqueIcon } from "../components/icons";
import { ACCENTS, useI18n, useSettings } from "../lib/settings-store";
import { LANGUAGES } from "../i18n/languages";
import { UI_FONTS, ARABIC_FONTS } from "../lib/fonts";
import { AMBIENT } from "../lib/ambient";
import { findCountry } from "../lib/locations";
import { METHODS } from "../lib/prayer";
import { COLLECTIONS } from "../lib/wallpapers";
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from "../lib/color";
import { system, setAutostart, isTauri, isAndroid } from "../lib/platform";
import { AndroidRows } from "./SettingsAndroid";
import { THEMES } from "../lib/themes";
import { DEFAULT_APPS } from "../lib/apps";
import { focusEl } from "../lib/nav";

const SECTIONS = [
  { id: "language", label: "Language", Icon: Languages },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "home", label: "Home Screen", Icon: House },
  { id: "apps", label: "Apps", Icon: AppWindow },
  { id: "livetv", label: "Live TV", Icon: Tv },
  { id: "location", label: "Location", Icon: MapPin },
  { id: "prayer", label: "Prayer & Adhan", Icon: MosqueIcon },
  { id: "reminders", label: "Reminders", Icon: BellRing },
  { id: "sound", label: "Ambient Sound", Icon: Music },
  { id: "screensaver", label: "Screensaver", Icon: MonitorPlay },
  { id: "backgrounds", label: "Backgrounds", Icon: ImageIcon },
  { id: "news", label: "News", Icon: Newspaper },
  { id: "kids", label: "Kids profile", Icon: Baby },
  { id: "cameras", label: "Cameras", Icon: Cctv },
  { id: "phone", label: "Phone & Remote", Icon: Smartphone },
  { id: "system", label: "System", Icon: Cpu },
];

const VOICE_HINTS = {
  makkah: "Masjid al-Haram, Makkah",
  madinah: "Masjid an-Nabawi, Madinah",
  mishary: "Sheikh Mishary Rashid Alafasy",
  dubai: "Sheikh Abdulrahman Al Hindi",
  sheikhzayed: "Plays ~/Music/Adhan/sheikhzayed.mp3. Until you add it, the Dubai adhan plays",
};

const sign = (v) => (v > 0 ? `+${v}` : `${v}`);

function ColorWheel({ hex }) {
  const { t } = useI18n();
  const { h, s } = rgbToHsl(hexToRgb(hex));
  const r = (s / 100) * 46;
  const x = 50 + r * Math.cos(((h - 90) * Math.PI) / 180);
  const y = 50 + r * Math.sin(((h - 90) * Math.PI) / 180);
  return (
    <div className="flex items-center gap-[2rem] px-[1.5rem] py-[1rem]">
      <div
        className="relative h-[11rem] w-[11rem] rounded-full shadow-2xl"
        style={{ background: "radial-gradient(circle, white 0%, transparent 70%), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
      >
        <div
          className="absolute h-[1.6rem] w-[1.6rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.25rem] border-white shadow-lg"
          style={{ left: `${x}%`, top: `${y}%`, background: hex }}
        />
      </div>
      <div>
        <div className="h-[4rem] w-[9rem] rounded-[1rem] shadow-lg" style={{ background: hex }} />
        <div className="tabular mt-[0.6rem] text-[1.2rem] font-semibold uppercase">{hex}</div>
        <div className="text-[0.95rem] text-ink-faint">{t("Use the sliders below")}</div>
      </div>
    </div>
  );
}

const every = (t, v) => (v < 60 ? t("Every {n} min", { n: v }) : t("Every {n} hr", { n: v / 60 }));

function Settings({ settings, update, section, setSection, actions, customCount }) {
  const { t, lang } = useI18n();
  const { replace: replaceSettings } = useSettings();
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(""), 4000);
    return () => clearTimeout(t);
  }, [status]);

  // Back from a setting returns to its section in the list.
  const panel = useRef(null);
  const sectionTimer = useRef();
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onBack = (e) => {
      e.preventDefault();
      focusEl(document.querySelector(`[data-settings-section="${section}"]`));
    };
    el.addEventListener("nav-back", onBack);
    return () => el.removeEventListener("nav-back", onBack);
  });

  // Server addresses (Jellyfin on your PC, Home Assistant, …).
  const [editing, setEditing] = useState(null);
  const appUrl = (id) => settings.appUrls?.[id] || DEFAULT_APPS.find((a) => a.id === id)?.url || "";
  const SERVER_PORTS = { jellyfin: 8096, homeassistant: 8123 };
  const saveUrl = (id, raw) => {
    let v = raw.trim().replace(/\/+$/, "");
    if (v && !/^https?:\/\//i.test(v)) v = "http://" + v;
    // No port given: add the app's usual one.
    if (v && SERVER_PORTS[id] && !/^https?:\/\/[^/]+:\d+/i.test(v)) v = v.replace(/^(https?:\/\/[^/]+)/i, `$1:${SERVER_PORTS[id]}`);
    update("appUrls", (cur = {}) => {
      const next = { ...cur };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });
    setEditing(null);
    setStatus(v ? t("Saved: {url}", { url: v }) : t("Back to the default address"));
  };
  const showApps = settings.showApps ?? settings.homeLayout !== "quran";
  const showQuran = settings.showQuran ?? settings.homeLayout !== "row";
  const country = findCountry(settings.location.country);
  const [pickingCountry, setPickingCountry] = useState(false);
  const placeName = settings.location.city || (lang === "ar" && country.ar) || country.short;
  const worldHint = t("Photos of {place} and the rest of {country} from Wikimedia Commons, changing through the day (needs internet)", {
    place: placeName,
    country: (lang === "ar" && country.ar) || country.short,
  });
  const rgb = hexToRgb(settings.customAccent);
  const hsl = rgbToHsl(rgb);
  const setHsl = (k, v) => update("customAccent", rgbToHex(hslToRgb({ ...hsl, [k]: v })));
  const setRgb = (k, v) => update("customAccent", rgbToHex({ ...rgb, [k]: v }));

  const content = {
    language: (
      <>
        <SectionTitle>Language</SectionTitle>
        <OptionRow isDefault label="Language" hint="Interface language · لغة الواجهة" value={settings.language} onChange={(v) => update("language", v)}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} />
        <div className="px-[1.5rem] pt-[1rem] text-[1rem] leading-relaxed text-ink-faint">
          {t("Arabic, Urdu and Persian switch the whole screen to right-to-left. Qur'an and hadith always show in Arabic with an English translation.")}
        </div>
      </>
    ),
    appearance: (
      <>
        <SectionTitle>Theme</SectionTitle>
        <OptionRow isDefault label="Theme" value={settings.theme === "amoled" ? "onyx" : settings.theme} onChange={(v) => update("theme", v)}
          options={Object.entries(THEMES).map(([value, t]) => ({ value, label: t.label }))} />
        <OptionRow label="Accent colour" value={settings.accent} onChange={(v) => update("accent", v)}
          options={[{ value: "theme", label: "Match theme" }, ...Object.keys(ACCENTS).filter((k) => k !== "theme").map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })), { value: "custom", label: "Custom" }]} />
        <SectionTitle>Cards & background</SectionTitle>
        <SliderRow label="Card opacity" hint="Lower = more see-through glass" value={settings.panelOpacity} min={5} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => update("panelOpacity", v)} />
        <SliderRow label="Card blur" hint="Blur behind cards (off in Performance mode)" value={settings.blur} min={0} max={48} step={4} format={(v) => (v ? `${v}px` : "Off")} onChange={(v) => update("blur", v)} />
        <SliderRow label="Wallpaper dimming" value={settings.wallDim} min={0} max={70} step={5} format={(v) => `${v}%`} onChange={(v) => update("wallDim", v)} />
        <OptionRow label="Visual effects" hint={{ full: "Moving wallpapers and blurred pages (needs a good GPU)", balanced: "Recommended for most TVs", performance: "No blur at all: smoothest on slower laptops" }[settings.effects]}
          value={settings.effects} onChange={(v) => update("effects", v)}
          options={[{ value: "full", label: "Full" }, { value: "balanced", label: "Balanced" }, { value: "performance", label: "Performance" }]} />
        <SectionTitle>Text & clock</SectionTitle>
        <OptionRow label="Interface font" value={settings.uiFont} onChange={(v) => update("uiFont", v)}
          options={Object.entries(UI_FONTS).map(([value, f]) => ({ value, label: f.label }))} />
        <OptionRow label="Qur'an & hadith font" value={settings.arabicFont} onChange={(v) => update("arabicFont", v)}
          options={Object.entries(ARABIC_FONTS).map(([value, f]) => ({ value, label: f.label }))} />
        <SliderRow label="Interface size" hint="Scales everything, like zoom" value={settings.uiScale} min={80} max={130} step={5} format={(v) => `${v}%`} onChange={(v) => update("uiScale", v)} />
        <OptionRow label="Clock style" value={settings.clockWeight} onChange={(v) => update("clockWeight", v)}
          options={[{ value: 200, label: "Light" }, { value: 400, label: "Regular" }, { value: 700, label: "Bold" }]} />
        <OptionRow label="Clock format" value={settings.clock24} onChange={(v) => update("clock24", v)}
          options={[{ value: false, label: "12-hour" }, { value: true, label: "24-hour" }]} />
        {settings.accent === "custom" && (
          <>
            <SectionTitle>Custom colour</SectionTitle>
            <ColorWheel hex={settings.customAccent} />
            <SliderRow label="Hue" value={hsl.h} min={0} max={359} step={5} format={(v) => `${v}°`} onChange={(v) => setHsl("h", v)}
              track="linear-gradient(90deg, red, yellow, lime, cyan, blue, magenta, red)" />
            <SliderRow label="Saturation" value={hsl.s} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => setHsl("s", v)} />
            <SliderRow label="Brightness" value={hsl.l} min={10} max={90} step={5} format={(v) => `${v}%`} onChange={(v) => setHsl("l", v)} />
            <SliderRow label="Red" value={rgb.r} min={0} max={255} step={5} onChange={(v) => setRgb("r", v)} track={`linear-gradient(90deg, ${rgbToHex({ ...rgb, r: 0 })}, ${rgbToHex({ ...rgb, r: 255 })})`} />
            <SliderRow label="Green" value={rgb.g} min={0} max={255} step={5} onChange={(v) => setRgb("g", v)} track={`linear-gradient(90deg, ${rgbToHex({ ...rgb, g: 0 })}, ${rgbToHex({ ...rgb, g: 255 })})`} />
            <SliderRow label="Blue" value={rgb.b} min={0} max={255} step={5} onChange={(v) => setRgb("b", v)} track={`linear-gradient(90deg, ${rgbToHex({ ...rgb, b: 0 })}, ${rgbToHex({ ...rgb, b: 255 })})`} />
          </>
        )}
      </>
    ),
    home: (
      <>
        <SectionTitle>Home screen</SectionTitle>
        <ToggleRow isDefault label="Show app cards" hint={showQuran && showApps ? "One large app card (← → to switch) next to the Ayah of the day" : "Your pinned apps"} value={showApps} onChange={(v) => update("showApps", v)} />
        <ToggleRow label="Show the Ayah of the day" hint="Qur'an verse with translation and tafsir" value={showQuran} onChange={(v) => update("showQuran", v)} />
        <ToggleRow label="Show today's hadith" hint="A short authentic hadith that changes daily" value={settings.showHadith} onChange={(v) => update("showHadith", v)} />
        <ToggleRow label="Show news ticker" value={settings.news.enabled} onChange={(v) => update("news.enabled", v)} />
        <ToggleRow label="Show weather" hint="Today's temperature for your location, under the clock" value={settings.showWeather !== false} onChange={(v) => update("showWeather", v)} />
      </>
    ),
    reminders: (
      <>
        <SectionTitle>Istighfar · أستغفر الله</SectionTitle>
        <ToggleRow isDefault label="Istighfar reminders" hint="A gentle reminder now and then to say Astaghfirullah" value={settings.reminders.istighfar} onChange={(v) => update("reminders.istighfar", v)} />
        <OptionRow label="How often" value={settings.reminders.istighfarEvery} onChange={(v) => update("reminders.istighfarEvery", v)}
          options={[5, 10, 15, 20, 30, 45, 60, 90, 120, 180].map((v) => ({ value: v, label: every(t, v) }))} />
        <ToggleRow label="Quiet at night" hint="None from an hour after Isha until Fajr" value={settings.reminders.quietAtNight} onChange={(v) => update("reminders.quietAtNight", v)} />
        <ToggleRow label="Soft chime" value={settings.reminders.chime} onChange={(v) => update("reminders.chime", v)} />
        <ActionRow label="Preview reminder" Icon={Play} onAction={actions.previewIstighfar} />
        <SectionTitle>Eid takbir · تكبيرات العيد</SectionTitle>
        <ToggleRow label="Eid takbir" hint="Eve of Eid al-Fitr until Dhuhr · Day of Arafah until Asr on 13 Dhul-Hijjah" value={settings.reminders.takbir} onChange={(v) => update("reminders.takbir", v)} />
        <OptionRow label="How often" value={settings.reminders.takbirEvery} onChange={(v) => update("reminders.takbirEvery", v)}
          options={[5, 10, 15, 20, 30, 45, 60, 120].map((v) => ({ value: v, label: every(t, v) }))} />
        <ToggleRow label="Play takbir audio" hint="Sheikh Ali Mullah, Masjid al-Haram" value={settings.reminders.takbirSound} onChange={(v) => update("reminders.takbirSound", v)} />
        <ActionRow label="Preview takbir" Icon={Play} onAction={actions.previewTakbir} />
        <div className="px-[1.5rem] pt-[1rem] text-[1rem] text-ink-faint">{t("Reminders never interrupt an open app or the Adhan.")}</div>
      </>
    ),
    sound: (
      <>
        <SectionTitle>Ambient sound</SectionTitle>
        <OptionRow isDefault label="Sound" hint={settings.ambient.sound.startsWith("quran") ? "Streams from quranicaudio.com" : "Created live on the device, never repeats"}
          value={settings.ambient.sound} onChange={(v) => update("ambient.sound", v)}
          options={AMBIENT.map((a) => ({ value: a.id, label: a.label }))} />
        <SliderRow label="Volume" value={settings.ambient.volume} min={5} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => update("ambient.volume", v)} />
        <OptionRow label="Play on" value={settings.ambient.onlyHome} onChange={(v) => update("ambient.onlyHome", v)}
          options={[{ value: true, label: "Home & screensaver" }, { value: false, label: "All YousufOS screens" }]} />
        <div className="px-[1.5rem] pt-[1rem] text-[1rem] text-ink-faint">{t("Ambient sound pauses for the Adhan, takbir, Live TV and apps.")}</div>
      </>
    ),
    location: (
      <>
        <SectionTitle>Location</SectionTitle>
        <OptionRow isDefault label="Mode" hint={settings.location.mode === "auto" ? "Detected from your internet connection" : "Pick a country and city below"}
          value={settings.location.mode}
          onChange={(v) => (v === "auto" ? actions.detectLocation().then(setStatus) : update("location.mode", "manual"))}
          options={[{ value: "auto", label: "Auto Detect" }, { value: "manual", label: "Manual" }]} />
        {settings.location.mode === "manual" ? (
          <>
            <ActionRow label="Country" hint={(lang === "ar" && country.ar) || country.short} Icon={Globe} onAction={() => setPickingCountry(true)} />
            <OptionRow label="City" value={settings.location.city}
              onChange={(name) => {
                const city = country.cities.find((c) => c.name === name);
                update({ location: { city: name, lat: city.lat, lng: city.lng, label: `${name}, ${country.short}` } });
              }}
              options={country.cities.map((c) => ({ value: c.name, label: (lang === "ar" && c.ar) || c.name }))} />
          </>
        ) : (
          <ActionRow label="Detect again" hint={`Currently ${settings.location.label}`} Icon={LocateFixed} onAction={() => actions.detectLocation().then(setStatus)} />
        )}
        <SectionTitle>Wallpapers</SectionTitle>
        <ToggleRow label="Wallpapers from your location" hint={worldHint} value={!!settings.backgrounds.local} onChange={(v) => update("backgrounds.local", v)} />
        <div className="px-[1.5rem] pt-[1rem] text-[1rem] text-ink-faint">
          {t("Coordinates")} {settings.location.lat.toFixed(4)}, {settings.location.lng.toFixed(4)}
        </div>
      </>
    ),
    prayer: (
      <>
        <SectionTitle>Calculation</SectionTitle>
        <OptionRow isDefault label="Calculation method" value={settings.prayer.method} onChange={(v) => update("prayer.method", v)}
          options={Object.entries(METHODS).map(([value, m]) => ({ value, label: m.label }))} />
        <OptionRow label="Asr time" value={settings.prayer.madhab} onChange={(v) => update("prayer.madhab", v)}
          options={[{ value: "shafi", label: "Standard" }, { value: "hanafi", label: "Hanafi" }]} />
        <OptionRow label="Hijri date adjustment" hint="Match local moon sighting" value={settings.prayer.hijriOffset}
          onChange={(v) => update("prayer.hijriOffset", v)}
          options={[-2, -1, 0, 1, 2].map((v) => ({ value: v, label: v === 0 ? t("None") : t("{n} day", { n: sign(v) }) }))} />
        <SectionTitle>Adhan</SectionTitle>
        <ToggleRow label="Play Adhan at prayer times" value={settings.adhan.enabled} onChange={(v) => update("adhan.enabled", v)} />
        <OptionRow label="Adhan voice" hint={VOICE_HINTS[settings.adhan.voice] || (settings.adhan.customPath || "Set adhan.customPath in config.json")}
          value={settings.adhan.voice} onChange={(v) => update("adhan.voice", v)}
          options={[{ value: "makkah", label: "Makkah" }, { value: "madinah", label: "Madinah" }, { value: "sheikhzayed", label: "Sheikh Zayed Mosque" }, { value: "dubai", label: "Dubai" }, { value: "mishary", label: "Mishary Alafasy" }, { value: "custom", label: "Custom" }]} />
        <SliderRow label="Volume" value={Math.round(settings.adhan.volume * 100)} min={0} max={100} step={5} format={(v) => `${v}%`}
          onChange={(v) => update("adhan.volume", v / 100)} />
        <ToggleRow label="Pause other media during Adhan" hint="Pauses YouTube, Netflix etc. and brings YousufOS to the front" value={settings.adhan.muteMedia} onChange={(v) => update("adhan.muteMedia", v)} />
        <ToggleRow label="Special Fajr Adhan" hint="Mishary Alafasy, maqam Hijaz, with “prayer is better than sleep”" value={settings.adhan.useFajrFile} onChange={(v) => update("adhan.useFajrFile", v)} />
        <ActionRow label="Test Adhan" hint="Shows the fullscreen notification now" Icon={Play} onAction={actions.testAdhan} />
        <RamadanRows settings={settings} update={update} actions={actions} />
      </>
    ),
    screensaver: (
      <>
        <SectionTitle>Screensaver</SectionTitle>
        <OptionRow isDefault label="Start after" value={settings.screensaver.timeout} onChange={(v) => update("screensaver.timeout", v)}
          options={[1, 2, 5, 10, 15, 30, 60].map((v) => ({ value: v, label: v < 60 ? t("{n} min", { n: v }) : t("1 hour") })).concat([{ value: 0, label: "Never" }])} />
        <OptionRow label="Style" value={settings.screensaver.mode} onChange={(v) => update("screensaver.mode", v)}
          options={[{ value: "clock", label: "Clock" }, { value: "prayer", label: "Prayer Focus" }, { value: "photos", label: "UAE Photography" }]} />
        <ActionRow label="Preview" hint="Press any key to exit" Icon={Play} onAction={actions.previewScreensaver} />
        <div className="px-[1.5rem] pt-[1rem] text-[1rem] text-ink-faint">{t("OLED protection is always on: the screensaver content drifts slightly every minute.")}</div>
        <MorningRows settings={settings} update={update} preview={actions.previewMorning} />
      </>
    ),
    backgrounds: (
      <>
        <SectionTitle>Wallpapers</SectionTitle>
        <ToggleRow isDefault label="Wallpapers from your location" hint={worldHint} value={!!settings.backgrounds.local} onChange={(v) => update("backgrounds.local", v)} />
        <OptionRow label="Collection" hint={settings.backgrounds.local ? "Used when your location's photos can't be loaded" : undefined} value={settings.backgrounds.collection} onChange={(v) => update("backgrounds.collection", v)} options={COLLECTIONS} />
        <OptionRow label="Change every" value={settings.backgrounds.interval} onChange={(v) => update("backgrounds.interval", v)}
          options={[30, 60, 120, 300, 600].map((v) => ({ value: v, label: v < 60 ? t("{n} sec", { n: v }) : t("{n} min", { n: v / 60 }) }))} />
        <ActionRow label="Custom images folder" hint={`${settings.backgrounds.customDir || "~/Pictures/YousufOS"} · ${t("{n} found", { n: customCount })}`} Icon={RefreshCw}
          onAction={() => actions.rescanImages().then((n) => setStatus(t("Found {n} custom images", { n })))} />
        <div className="px-[1.5rem] pt-[1rem] text-[1rem] leading-relaxed text-ink-faint">
          {t("Night photos (file names containing “night”) are shown after Maghrib, daytime photos after sunrise.")}
        </div>
      </>
    ),
    news: (
      <>
        <SectionTitle>News ticker</SectionTitle>
        <ToggleRow label="Show news ticker on Home" value={settings.news.enabled} onChange={(v) => update("news.enabled", v)} />
        {settings.news.feeds.map((f) => (
          <div key={f.url} className="flex items-center justify-between px-[1.5rem] py-[0.8rem]">
            <span className="text-[1.15rem] font-semibold">{f.label}</span>
            <span className="arabic text-[1.15rem] text-ink-dim">{f.name}</span>
          </div>
        ))}
        <div className="px-[1.5rem] pt-[0.6rem] text-[1rem] text-ink-faint">{t("Feeds can be changed in config.json under news.feeds.")}</div>
      </>
    ),
    apps: (
      <>
        {!isAndroid() && (<>
        <SectionTitle>Opening apps</SectionTitle>
        <OptionRow isDefault label="Open apps" hint={settings.appView.mode === "chrome" ? "Every app opens in Google Chrome" : "Inside YousufOS, no extra windows. Netflix, Shahid and other protected services always use Chrome"}
          value={settings.appView.mode} onChange={(v) => update("appView.mode", v)}
          options={[{ value: "auto", label: "Inside YousufOS" }, { value: "chrome", label: "Always in Chrome" }]} />
        <div className="px-[1.5rem] pb-[0.6rem] pt-[0.4rem] text-[1rem] leading-relaxed text-ink-faint">
          {t("Cookie pop-ups are accepted automatically and links stay in the same screen. If an app doesn't work well inside YousufOS, set it to Chrome below (or press Y on its tile).")}
        </div>
        <ToggleRow label="On-screen keyboard in apps" hint="Opens when the controller selects a text box (X also opens it)" value={settings.osk !== false} onChange={(v) => update("osk", v)} />
        <ToggleRow
          label="Remote navigation in apps"
          hint="The D-pad and remote arrows jump between buttons, posters and links on web apps like Netflix, with a highlight. The left stick still moves a pointer."
          value={settings.dpad !== false}
          onChange={(v) => update("dpad", v)}
        />
        </>)}
        <SectionTitle>Servers on your network</SectionTitle>
        <ActionRow label="Jellyfin server" hint={appUrl("jellyfin")} Icon={Pencil} onAction={() => setEditing("jellyfin")} />
        <ToggleRow
          label="YousufOS Jellyfin app"
          hint="Jellyfin in the YousufOS style, made for the remote and controller. Off: Jellyfin's own web page (Y on the tile also opens it)."
          value={settings.jellyfin?.native !== false}
          onChange={(v) => update("jellyfin", (cur = {}) => ({ ...cur, native: v }))}
        />
        {settings.jellyfin?.auth && (
          <ActionRow
            label="Sign out of Jellyfin"
            hint={t("Signed in as {name}", { name: settings.jellyfin.auth.userName || "?" })}
            Icon={LogOut}
            onAction={() => update("jellyfin", (cur = {}) => ({ ...cur, auth: null }))}
          />
        )}
        <ActionRow label="Home Assistant address" hint={appUrl("homeassistant")} Icon={Pencil} onAction={() => setEditing("homeassistant")} />
        {settings.appView.mode !== "chrome" && (
          <>
            <SectionTitle>Per app</SectionTitle>
            {(settings.apps || DEFAULT_APPS).filter((a) => !a.drm && !a.chrome).map((a) => {
              const chrome = (settings.appView.chromeApps || []).includes(a.id);
              return (
                <ToggleRow key={a.id} label={a.name} hint={chrome ? "Opens in Chrome" : "Opens inside YousufOS"} value={!chrome}
                  onChange={(inside) => update("appView.chromeApps", (list = []) => (inside ? list.filter((x) => x !== a.id) : [...new Set([...list, a.id])]))} />
              );
            })}
          </>
        )}
      </>
    ),
    livetv: (
      <>
        <SectionTitle>Live TV</SectionTitle>
        {!isAndroid() && <OptionRow isDefault label="Player" hint={{ auto: "The built-in player first; if a channel won't play, mpv takes over", builtin: "Only the built-in player", mpv: "mpv plays almost every stream (installed with YousufOS)" }[settings.iptv.player || "auto"]}
          value={settings.iptv.player || "auto"} onChange={(v) => update("iptv.player", v)}
          options={[{ value: "auto", label: "Automatic" }, { value: "builtin", label: "Built-in" }, { value: "mpv", label: "mpv" }]} />}
        <div className="px-[1.5rem] pt-[0.6rem] text-[1rem] leading-relaxed text-ink-faint">
          {t("“Official channels” are the broadcasters' own live streams. Other lists are free streams collected by iptv-org; some are blocked outside their home country.")}
        </div>
        <div className="px-[1.5rem] pt-[0.8rem] text-[1rem] leading-relaxed text-ink-faint">
          {t("Add your own playlists in config.json under iptv.playlists, e.g. [{ \"label\": \"My list\", \"url\": \"https://…/list.m3u\" }].")}
        </div>
        <PipRows settings={settings} update={update} />
      </>
    ),
    phone: <PhoneSection settings={settings} update={update} setStatus={setStatus} />,
    cameras: <CamerasSection settings={settings} update={update} actions={actions} />,
    kids: <KidsSection settings={settings} update={update} setStatus={setStatus} actions={actions} />,
    system: (
      <>
        {isAndroid() ? <AndroidRows /> : (<>
        <SectionTitle>Startup</SectionTitle>
        <ToggleRow label="Launch YousufOS at login" value={settings.autostart}
          onChange={(v) => {
            update("autostart", v);
            setAutostart(v).catch((e) => setStatus(String(e)));
          }} />
        <OptionRow label="Browser for protected apps" hint="Google Chrome is needed for Netflix and Prime Video (DRM)" value={settings.browser} onChange={(v) => update("browser", v)}
          options={[{ value: "", label: "Automatic" }, { value: "google-chrome", label: "Google Chrome" }, { value: "chromium", label: "Chromium" }, { value: "microsoft-edge", label: "Edge" }]} />
        </>)}
        {isTauri() && <UpdatesRows settings={settings} update={update} setStatus={setStatus} />}
        {isTauri() && <BackupRows settings={settings} replace={replaceSettings} setStatus={setStatus} />}
        {!isAndroid() && (<>
        <SectionTitle>Controller</SectionTitle>
        <div className="flex items-start gap-[1.2rem] px-[1.5rem] py-[0.6rem] text-[1.05rem] leading-relaxed text-ink-dim">
          <Gamepad2 className="mt-[0.2rem] h-[1.8rem] w-[1.8rem] shrink-0 text-accent" />
          <div>
            <div>{t("D-pad / left stick: move · A: select · B: back · LB / RB: switch pages · LT / RT: volume · Menu: sidebar · View: Home")}</div>
            <div>{t("Y on an app: open it in Chrome · Y on a channel: favourite")}</div>
            <div>{t("Inside apps: left stick pointer · A click · right stick scroll · X play/pause · Y fullscreen · LB / RB −10 s / +10 s · Menu: help")}</div>
            <div>{t("Live TV: ▲ ▼ change channel · A channel info · B channel list")}</div>
            <div>{t("Xbox button, or View + Menu together: back to YousufOS from any app")}</div>
          </div>
        </div>
        </>)}
        <SectionTitle>Power</SectionTitle>
        {!isAndroid() && <ActionRow label="Exit to Ubuntu desktop" hint="Closes the launcher" Icon={LogOut} confirm onAction={() => system("exit")} />}
        <ActionRow label="Reload YousufOS" Icon={RotateCcw} onAction={() => location.reload()} />
        {!isAndroid() && (<>
        <ActionRow label="Sleep" Icon={Moon} confirm onAction={() => system("suspend")} />
        <ActionRow label="Restart computer" Icon={RotateCcw} confirm danger onAction={() => system("reboot")} />
        <ActionRow label="Shut down" Icon={Power} confirm danger onAction={() => system("poweroff")} />
        </>)}
        <div className="px-[1.5rem] pt-[1.2rem] text-[1rem] text-ink-faint">
          YousufOS {__APP_VERSION__} · {isAndroid() ? t("Android TV") : isTauri() ? t("Desktop runtime") : t("Browser preview")}
        </div>
      </>
    ),
  };

  return (
    <div className="flex h-full gap-[2.5rem] pb-[3rem] ps-[9rem] pe-[4rem] pt-[4rem]">
      <div className="w-[20rem] shrink-0">
        <h1 className="mb-[1.2rem] text-[2.6rem] font-bold tracking-tight">{t("Settings")}</h1>
        <div className="space-y-[0.2rem]" data-nav-trap="y">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              data-nav
              data-nav-default={id === section || undefined}
              data-settings-section={id}
              onFocus={() => {
                // Show the section once you stop on it, so moving down the list stays quick.
                clearTimeout(sectionTimer.current);
                sectionTimer.current = setTimeout(() => setSection(id), 160);
              }}
              className={`focus-row flex w-full items-center gap-[1rem] rounded-[1rem] px-[1.2rem] py-[0.62rem] text-left text-[1.15rem] font-semibold ${
                section === id ? "bg-ink/10 text-ink" : "text-ink-dim"
              }`}
            >
              <Icon className="h-[1.5rem] w-[1.5rem]" strokeWidth={1.8} />
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      <div ref={panel} data-nav-enter className="glass min-w-0 flex-1 overflow-y-auto rounded-[1.8rem] p-[1.2rem]" key={section}>
        <div className="fade-up">{content[section]}</div>
        {status && <div className="mx-[1.5rem] mt-[1rem] rounded-[0.8rem] bg-accent/15 px-[1rem] py-[0.7rem] text-[1rem] text-accent">{status}</div>}
        {pickingCountry && (
          <CountryPicker
            value={country.code}
            onClose={() => setPickingCountry(false)}
            onPick={(c) => {
              const city = c.cities[0];
              update({ location: { country: c.code, city: city.name, lat: city.lat, lng: city.lng, label: `${city.name}, ${c.short}` }, prayer: { method: c.method } });
              setPickingCountry(false);
              setStatus(t("Location set to {place}. Prayer times use the {method} method.", { place: `${city.name}, ${(lang === "ar" && c.ar) || c.short}`, method: t(METHODS[c.method]?.label || c.method) }));
            }}
          />
        )}
        {editing && (
          <TextEntry
            title={editing === "jellyfin" ? t("Jellyfin server") : t("Home Assistant address")}
            hint={editing === "jellyfin" ? t("The address of the PC running Jellyfin, e.g. 192.168.1.20 (Jellyfin on that PC: Dashboard → Networking)") : t("e.g. homeassistant.local or 192.168.1.30")}
            value={appUrl(editing)}
            port={SERVER_PORTS[editing]}
            onSave={(v) => saveUrl(editing, v)}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}

export default memo(Settings);
