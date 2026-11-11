import { MapPin } from "lucide-react";
import { formatHijri, toHijri } from "../lib/hijri";
import { useI18n } from "../lib/settings-store";

export default function HeroClock({ now, settings, size = "xl" }) {
  const { t, locale, lang, dir } = useI18n();
  const h24 = settings.clock24;
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? t("PM") : t("AM");
  if (!h24) hours = hours % 12 || 12;
  const time = `${h24 ? String(hours).padStart(2, "0") : hours}:${minutes}`;
  const date = now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const hijri = toHijri(now, settings.prayer.hijriOffset);
  const big = size === "xl";

  return (
    <div className="relative flex flex-col items-center text-center" style={{ textShadow: "0 0.15rem 1.2rem var(--hero-shadow), 0 0 3rem var(--hero-shadow)" }}>
      <div
        className="pointer-events-none absolute -inset-x-[14rem] -inset-y-[6rem] -z-10"
        style={{ background: "radial-gradient(closest-side, var(--hero-glow), transparent)" }}
      />
      <div className="flex items-start">
        <span
          style={{ fontWeight: settings.clockWeight ?? 200 }}
          className={`tabular leading-[0.9] tracking-[-0.04em] text-ink ${big ? "text-[11.5rem]" : "text-[8rem]"}`}
        >
          {time}
        </span>
        {!h24 && (
          <span className={`ms-[0.8rem] font-medium tracking-wide text-ink-dim ${big ? "mt-[1.6rem] text-[2rem]" : "mt-[1.1rem] text-[1.5rem]"}`}>
            {suffix}
          </span>
        )}
      </div>
      <div className={`mt-[1.4rem] font-medium text-ink ${big ? "text-[1.85rem]" : "text-[1.5rem]"}`}>{date}</div>
      <div className={`mt-[0.55rem] flex items-center gap-[1rem] font-semibold text-accent ${big ? "text-[1.5rem]" : "text-[1.25rem]"}`}>
        {formatHijri(hijri, lang)}
      </div>
      <div className={`mt-[0.6rem] flex items-center gap-[0.4rem] text-ink-dim ${big ? "text-[1.15rem]" : "text-[1rem]"}`}>
        <MapPin className="h-[1.1em] w-[1.1em]" strokeWidth={2} />
        {settings.location.label.split(", ").map((x) => t(x)).join(dir === "rtl" ? "، " : ", ")}
      </div>
    </div>
  );
}
