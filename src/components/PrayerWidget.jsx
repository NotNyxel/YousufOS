import { MosqueIcon } from "./icons";
import { formatCountdown, formatTime } from "../lib/prayer";
import { useI18n } from "../lib/settings-store";

export default function PrayerWidget({ schedule, now, clock24, onOpen }) {
  const { t, locale } = useI18n();
  const { next, progress } = schedule;
  const remaining = next.time - now;
  const soon = remaining < 15 * 60 * 1000;
  return (
    <button
      data-nav
      onClick={onOpen}
      className="glass group relative w-[23rem] overflow-hidden rounded-[1.75rem] p-[1.5rem] text-start shadow-2xl transition-transform duration-200 focus:scale-[1.04] focus:ring-[0.2rem] focus:ring-ink"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[0.55rem] text-[0.95rem] font-semibold uppercase tracking-[0.14em] text-accent">
          <MosqueIcon className="h-[1.35rem] w-[1.35rem]" strokeWidth={2} />
          {t("Next prayer")}
        </div>
        <div className="arabic text-[1.15rem] text-ink-dim">{next.ar}</div>
      </div>
      <div className="mt-[0.7rem] flex items-baseline justify-between">
        <div className="text-[2.6rem] font-bold leading-none tracking-tight text-ink">{t(next.en)}</div>
        <div className="tabular text-[1.6rem] font-semibold text-ink">{formatTime(next.time, clock24, locale)}</div>
      </div>
      <div className="mt-[1.1rem] h-[0.3rem] overflow-hidden rounded-full bg-ink/15">
        <div className="h-full rounded-full bg-accent transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className={`mt-[0.6rem] text-[1.05rem] font-medium ${soon ? "text-accent" : "text-ink-dim"}`}>
        {t("{time} remaining", { time: formatCountdown(remaining, t) })}
        {next.tomorrow ? ` · ${t("tomorrow")}` : ""}
      </div>
    </button>
  );
}
