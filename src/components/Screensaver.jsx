import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import Background from "./Background";
import { MosqueIcon } from "./icons";
import { formatHijri, toHijri } from "../lib/hijri";
import { formatCountdownClock, formatTime } from "../lib/prayer";
import { useI18n } from "../lib/settings-store";
import { useNow } from "../lib/useNow";

// OLED protection: the content drifts to a new position every minute.
function useDrift(range = 4) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      setPos({ x: (Math.random() * 2 - 1) * range, y: (Math.random() * 2 - 1) * range });
    }, 60000);
    return () => clearInterval(id);
  }, [range]);
  return { transform: `translate(${pos.x}vw, ${pos.y}vh)`, transition: "transform 8s ease-in-out" };
}

export default function Screensaver({ mode, settings, schedule, wallpapers, fallback }) {
  const now = useNow(1000);
  const { t, lang, locale } = useI18n();
  const drift = useDrift(mode === "photos" ? 1.5 : 5);
  const [caption, setCaption] = useState(null);
  const hijri = toHijri(now, settings.prayer.hijriOffset);
  const clock24 = settings.clock24;
  const time = formatTime(now, clock24).replace(/\s?[AP]M$/, "");

  return (
    <div className="fixed inset-0 z-[60] cursor-none overflow-hidden bg-black text-white">
      <div className="h-full w-full" style={{ animation: "fade-up 1.2s ease both" }}>
      {mode === "photos" && (
        <>
          <Background images={wallpapers} fallback={fallback} interval={25} onChange={setCaption} scrim={false} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
          <div className="absolute bottom-[4rem] start-[4.5rem] end-[4.5rem] flex items-end justify-between" style={drift}>
            <div>
              <div className="text-[1rem] font-semibold uppercase tracking-[0.2em] text-white/60">{t("United Arab Emirates")}</div>
              <div className="mt-[0.4rem] text-[2.6rem] font-semibold tracking-tight">{caption?.title}</div>
            </div>
            <div className="text-end">
              <div className="tabular text-[5rem] font-extralight leading-none">{time}</div>
              <div className="mt-[0.5rem] text-[1.2rem] text-white/70">{formatHijri(hijri, lang)}</div>
            </div>
          </div>
        </>
      )}

      {mode === "clock" && (
        <div className="flex h-full flex-col items-center justify-center" style={drift}>
          <div className="tabular text-[13rem] font-extralight leading-none tracking-[-0.04em] text-white/90">{time}</div>
          <div className="mt-[1.5rem] flex items-center gap-[0.5rem] text-[1.6rem] text-white/60">
            <MapPin className="h-[1.4rem] w-[1.4rem]" />
            {t(settings.location.label.split(",")[0])}
          </div>
          <div className="mt-[0.6rem] text-[1.6rem] font-medium" style={{ color: "color-mix(in srgb, var(--accent) 80%, black)" }}>
            {formatHijri(hijri, lang).replace(" AH", "")}
          </div>
        </div>
      )}

      {mode === "prayer" && (
        <div className="flex h-full flex-col items-center justify-center" style={drift}>
          <div className="flex items-center gap-[0.8rem] text-[1.3rem] font-semibold uppercase tracking-[0.25em] text-white/55">
            <MosqueIcon className="h-[1.8rem] w-[1.8rem]" />
            {t("Next prayer")}
          </div>
          <div className="mt-[1.2rem] text-[7rem] font-bold leading-none tracking-tight" style={{ color: "color-mix(in srgb, var(--accent) 85%, white)" }}>
            {t(schedule.next.en)}
          </div>
          <div className="arabic mt-[0.8rem] text-[2.4rem] text-white/70">{schedule.next.ar}</div>
          <div className="tabular mt-[2rem] text-[5.5rem] font-extralight leading-none text-white/90">
            {formatCountdownClock(schedule.next.time - now)}
          </div>
          <div className="mt-[0.8rem] text-[1.4rem] text-white/50">
            {t("Remaining")} · {formatTime(schedule.next.time, clock24, locale)} · {time}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
