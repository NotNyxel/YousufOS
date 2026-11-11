import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Sunrise } from "lucide-react";
import { formatHijri, toHijri } from "../lib/hijri";
import { formatTime } from "../lib/prayer";
import { hadithOfTheDay } from "../data/hadith";
import { useI18n } from "../lib/settings-store";
import Weather from "./Weather";

// Shown once a day at the time set in Settings → Morning screen: the date,
// weather, today's prayer times and the hadith of the day. Any key closes it.
export default function MorningScreen({ now, settings, schedule, onClose }) {
  const { t, lang } = useI18n();
  useEffect(() => {
    const close = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    const id = setTimeout(onClose, Math.max(1, settings.morning?.minutes ?? 10) * 60000);
    const arm = setTimeout(() => window.addEventListener("keydown", close, true), 600);
    return () => {
      clearTimeout(id);
      clearTimeout(arm);
      window.removeEventListener("keydown", close, true);
    };
  }, [onClose, settings.morning?.minutes]);
  const d = new Date(now);
  const hadith = hadithOfTheDay(d);
  const loc = settings.location || {};
  const greeting = d.getHours() < 12 ? t("Good morning") : d.getHours() < 17 ? t("Good afternoon") : t("Good evening");
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[93] flex flex-col bg-[radial-gradient(ellipse_at_top,#2a2416,#07080b_70%)] px-[6rem] py-[4.5rem] text-white" style={{ animation: "page-in 500ms ease both" }}>
      <div className="flex items-center gap-[1rem] text-accent">
        <Sunrise className="h-[2.6rem] w-[2.6rem]" />
        <span className="text-[1.5rem] font-semibold">{greeting}</span>
      </div>
      <div className="mt-[1rem] text-[7rem] font-extralight leading-none tabular">{formatTime(d, settings.clock24)}</div>
      <div className="mt-[1rem] text-[2rem] font-semibold">
        {d.toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </div>
      <div className="text-[1.5rem] text-accent">{formatHijri(toHijri(d, settings.prayer?.hijriOffset), lang)}</div>
      <div className="mt-[2.4rem] grid flex-1 grid-cols-[1fr_1.3fr] gap-[2.4rem]">
        <div className="space-y-[1.4rem]">
          {settings.showWeather !== false && (
            <div className="rounded-[1.6rem] bg-white/[0.06] p-[1.6rem] ring-1 ring-white/10">
              <Weather lat={loc.lat} lng={loc.lng} />
            </div>
          )}
          <div className="rounded-[1.6rem] bg-white/[0.06] p-[1.6rem] ring-1 ring-white/10">
            <div className="mb-[0.8rem] text-[1rem] font-bold uppercase tracking-[0.18em] text-white/50">{t("Prayer times today")}</div>
            <div className="grid grid-cols-3 gap-[0.8rem]">
              {schedule.list.map((p) => (
                <div key={p.key} className={`rounded-[1rem] px-[1rem] py-[0.7rem] ${schedule.next?.key === p.key ? "bg-accent text-on-accent" : "bg-white/[0.06]"}`}>
                  <div className="text-[1rem] font-semibold opacity-80">{t(p.en)}</div>
                  <div className="text-[1.6rem] font-bold tabular">{formatTime(p.time, settings.clock24)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-[1.6rem] bg-white/[0.06] p-[2.4rem] ring-1 ring-white/10">
          <div className="text-[1rem] font-bold uppercase tracking-[0.18em] text-white/50">{t("Today's hadith")}</div>
          <p dir="rtl" className="mt-[1.2rem] font-arabic text-[2.4rem] leading-[1.7]">{hadith.ar}</p>
          {lang !== "ar" && <p className="mt-[1rem] text-[1.35rem] leading-relaxed text-white/75">{hadith.en}</p>}
          <div className="mt-[1rem] text-[1.05rem] text-white/45">— {hadith.ref}</div>
        </div>
      </div>
      <div className="mt-[1.6rem] text-center text-[1.05rem] text-white/40">{t("Any button closes this")}</div>
    </div>,
    document.body,
  );
}
