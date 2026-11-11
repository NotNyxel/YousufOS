import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { focusDefault } from "../lib/nav";
import { MosqueIcon } from "./icons";
import { prayerWallpaper } from "../lib/wallpapers";
import { adhanBegin, adhanEnd, localAudioUrl, playableUrl } from "../lib/platform";
import { formatTime } from "../lib/prayer";
import { useI18n } from "../lib/settings-store";

// Bundled recordings live in public/adhan; a file with the same name in
// ~/Music/Adhan takes priority. "sheikhzayed" has no bundled recording (none
// with a clear source was found): add ~/Music/Adhan/sheikhzayed.mp3, until
// then the Dubai adhan plays.
const BUNDLED = { makkah: "makkah", madinah: "madinah", mishary: "mishary", dubai: "dubai", sheikhzayed: "dubai", custom: "makkah" };

async function adhanSource(adhan, prayerKey) {
  const voice = adhan.voice in BUNDLED ? adhan.voice : "makkah";
  const steps = [];
  if (voice === "custom" && adhan.customPath) steps.push({ local: adhan.customPath });
  if (prayerKey === "fajr" && adhan.useFajrFile) steps.push({ local: "~/Music/Adhan/fajr.mp3", bundled: "/adhan/fajr.mp3" });
  steps.push({ local: `~/Music/Adhan/${voice}.mp3`, bundled: `/adhan/${BUNDLED[voice]}.mp3` });
  const list = [];
  const blobs = [];
  for (const step of steps) {
    if (step.local) {
      const url = await localAudioUrl(step.local).catch(() => null);
      if (url) {
        list.push(url);
        blobs.push(url);
      }
    }
    if (step.bundled) list.push(step.bundled);
  }
  return { list, blobs };
}

// Fullscreen notification shown when a prayer time begins.
export default function AdhanOverlay({ prayer, settings, onClose }) {
  const { t, locale } = useI18n();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  const [bgReady, setBgReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    adhanBegin(settings.adhan.muteMedia);
    let sources = [];
    const audio = new Audio();
    audio.volume = settings.adhan.volume;
    audioRef.current = audio;
    let fallback;
    let i = 0;
    let cancelled = false;
    const blobs = [];
    const tryNext = async () => {
      if (cancelled) return;
      if (i >= sources.length) {
        // No audio file available: keep the notice up for a minute.
        fallback = setTimeout(() => closeRef.current(), 60000);
        return;
      }
      let src;
      try {
        src = await playableUrl(sources[i++]);
      } catch {
        return tryNext();
      }
      if (src.startsWith("blob:") && !blobs.includes(src)) blobs.push(src);
      if (cancelled) return;
      audio.src = src;
      audio.play().then(() => setPlaying(true), tryNext);
    };
    audio.onerror = () => tryNext();
    audio.onended = () => setTimeout(() => closeRef.current(), 4000);
    adhanSource(settings.adhan, prayer.key)
      .then((s) => {
        sources = s.list;
        blobs.push(...s.blobs);
      })
      .catch(() => (sources = ["/adhan/makkah.mp3"]))
      .then(() => !cancelled && tryNext());
    return () => {
      cancelled = true;
      blobs.forEach((u) => URL.revokeObjectURL(u));
      clearTimeout(fallback);
      audio.onerror = null;
      audio.pause();
      adhanEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bg = prayerWallpaper(["maghrib", "isha", "fajr"].includes(prayer.key));

  return (
    <div data-nav-scope className="fixed inset-0 z-[80] overflow-hidden bg-black text-white">
      {bg && (
        <div className="absolute inset-0 transition-opacity duration-[2000ms]" style={{ opacity: bgReady ? 0.75 : 0 }}>
          <img src={bg.url} alt="" onLoad={() => setBgReady(true)} className="kenburns h-full w-full object-cover" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/90" />
      <div className="relative flex h-full flex-col items-center justify-center text-center fade-up">
        <div className="breathe flex h-[7rem] w-[7rem] items-center justify-center rounded-full bg-accent/20 ring-1 ring-accent/50">
          <MosqueIcon className="h-[3.6rem] w-[3.6rem] text-accent" strokeWidth={1.5} />
        </div>
        <div className="mt-[2rem] text-[6.5rem] font-bold leading-none tracking-tight">{t(prayer.en)}</div>
        <div className="arabic mt-[1rem] text-[3rem] font-semibold text-accent">حان الآن موعد أذان {prayer.ar}</div>
        <div className="mt-[1.2rem] text-[1.8rem] text-white/75">{t("The Adhan has begun")} · {formatTime(prayer.time, settings.clock24, locale)}</div>
        <div className="mt-[0.4rem] text-[1.2rem] text-white/50">{settings.location.label}</div>

        {playing && (
          <div className="mt-[2.5rem] flex h-[2.2rem] items-end gap-[0.3rem]">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className="w-[0.35rem] rounded-full bg-accent"
                style={{ height: "100%", animation: `breathe ${1.2 + (i % 4) * 0.35}s ease-in-out ${i * 0.12}s infinite`, transformOrigin: "bottom" }}
              />
            ))}
          </div>
        )}

        <button
          data-nav
          data-nav-default
          onClick={onClose}
          className="focus-row mt-[3rem] rounded-full border border-white/25 bg-white/10 px-[2.4rem] py-[1rem] text-[1.25rem] font-semibold backdrop-blur"
        >
          {playing ? t("Stop Adhan") : t("Dismiss")}
        </button>
      </div>
    </div>
  );
}
