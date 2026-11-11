import { memo } from "react";
import { Moon, Sun, Sunrise, Sunset, CloudSun, MoonStar, CalendarDays, MapPin, Calculator } from "lucide-react";
import { METHODS, formatCountdown, formatTime } from "../lib/prayer";
import { formatHijri, toHijri, upcomingEvents, HIJRI_MONTHS_AR } from "../lib/hijri";
import { useI18n } from "../lib/settings-store";
import RamadanTrackers from "../components/RamadanTrackers";

const ICONS = { fajr: MoonStar, sunrise: Sunrise, dhuhr: Sun, asr: CloudSun, maghrib: Sunset, isha: Moon };

function Prayer({ now, settings, schedule, go, ramadan, update, onReadJuz }) {
  const { t, lang, locale, dir } = useI18n();
  const { list, current, next } = schedule;
  const hijri = toHijri(now, settings.prayer.hijriOffset);
  const events = upcomingEvents(now, settings.prayer.hijriOffset).slice(0, 4);
  const clock24 = settings.clock24;

  return (
    <div className="h-full overflow-y-auto pb-[4rem] ps-[9rem] pe-[4rem] pt-[4rem]">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[1rem] font-semibold uppercase tracking-[0.2em] text-accent">{t("Prayer times")}</div>
          <h1 className="mt-[0.4rem] text-[2.8rem] font-bold tracking-tight">{formatHijri(hijri, lang)}</h1>
          <div className="mt-[0.3rem] flex items-center gap-[1.4rem] text-[1.2rem] text-ink-dim">
            <span>{now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            <span className="arabic">{`${hijri.day} ${HIJRI_MONTHS_AR[hijri.month - 1]} ${hijri.year} هـ`}</span>
          </div>
        </div>
        <div className="flex gap-[1rem]">
          <button data-nav onClick={() => go("settings", "location")} className="focus-row glass flex items-center gap-[0.6rem] rounded-full px-[1.4rem] py-[0.8rem] text-[1.05rem] font-semibold">
            <MapPin className="h-[1.2rem] w-[1.2rem]" />
            {settings.location.label.split(", ").map((x) => t(x)).join(dir === "rtl" ? "، " : ", ")}
          </button>
          <button data-nav onClick={() => go("settings", "prayer")} className="focus-row glass flex items-center gap-[0.6rem] rounded-full px-[1.4rem] py-[0.8rem] text-[1.05rem] font-semibold">
            <Calculator className="h-[1.2rem] w-[1.2rem]" />
            {t(METHODS[settings.prayer.method]?.label)}
          </button>
        </div>
      </div>

      <div className="mt-[2.5rem] grid grid-cols-6 gap-[1.2rem]">
        {list.map((p, i) => {
          const Icon = ICONS[p.key];
          const isCurrent = p.key === current;
          const isNext = p.key === next.key && !next.tomorrow;
          const passed = p.time < now && !isCurrent;
          return (
            <div
              key={p.key}
              data-nav
              tabIndex={-1}
              data-nav-default={isNext || undefined}
              className={`relative flex flex-col rounded-[1.6rem] p-[1.6rem] transition-all duration-200 focus:scale-[1.05] focus:ring-[0.2rem] focus:ring-ink ${
                isCurrent ? "bg-accent text-on-accent shadow-[0_1.5rem_3rem_rgb(0_0_0/0.4)]" : "glass"
              } ${passed ? "opacity-60" : ""}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-[2rem] w-[2rem]" strokeWidth={1.6} />
                {isCurrent && <span className="rounded-full bg-on-accent/15 px-[0.7rem] py-[0.2rem] text-[0.8rem] font-bold uppercase tracking-widest">{t("Now")}</span>}
                {isNext && <span className="rounded-full bg-accent/20 px-[0.7rem] py-[0.2rem] text-[0.8rem] font-bold uppercase tracking-widest text-accent">{t("Next")}</span>}
              </div>
              <div className="mt-[2.4rem] text-[1.6rem] font-bold">{t(p.en)}</div>
              <div className={`arabic text-[1.2rem] ${isCurrent ? "opacity-75" : "text-ink-dim"}`}>{p.ar}</div>
              <div className="tabular mt-[1rem] text-[2.4rem] font-semibold leading-none tracking-tight">{formatTime(p.time, clock24, locale)}</div>
              <div className={`mt-[0.6rem] h-[1.4rem] text-[0.95rem] ${isCurrent ? "opacity-75" : "text-ink-dim"}`}>
                {isNext ? t("in {time}", { time: formatCountdown(p.time - now, t) }) : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-[3rem] flex items-center gap-[0.6rem] text-[1.1rem] font-semibold text-ink-dim">
        <CalendarDays className="h-[1.3rem] w-[1.3rem]" />
        {t("Upcoming Islamic dates")}
      </div>
      <div className="mt-[1rem] grid grid-cols-4 gap-[1.2rem]">
        {events.map((e) => (
          <div key={e.key} data-nav tabIndex={-1} className="glass rounded-[1.4rem] p-[1.4rem] transition-transform duration-200 focus:scale-[1.04] focus:ring-[0.2rem] focus:ring-ink">
            <div className="flex items-baseline justify-between">
              <div className="text-[1.3rem] font-bold">{t(e.en)}</div>
              <div className="arabic text-[1.05rem] text-ink-dim">{e.ar}</div>
            </div>
            <div className="mt-[0.9rem] flex items-baseline gap-[0.5rem]">
              <span className="tabular text-[2.6rem] font-semibold leading-none text-accent">{e.days}</span>
              <span className="text-[1.1rem] text-ink-dim">{e.days === 1 ? t("day") : t("days")}</span>
            </div>
            <div className="mt-[0.5rem] text-[0.95rem] text-ink-faint">
              {e.date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {formatHijri(e.hijri, lang)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-[1.2rem] text-[0.95rem] text-ink-faint">
        {t("Dates follow the Umm al-Qura calendar and may shift by a day with local moon sighting. Adjust in Settings → Prayer.")}
      </p>
      {ramadan && <RamadanTrackers info={ramadan} settings={settings} update={update} onReadJuz={onReadJuz} />}
    </div>
  );
}

export default memo(Prayer);
