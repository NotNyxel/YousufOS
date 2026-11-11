import { ayahOfTheDay } from "../data/quran";
import { useI18n } from "../lib/settings-store";

const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

export default function QuranCard({ now, className = "", wide = false }) {
  const { t, lang } = useI18n();
  const a = ayahOfTheDay(now);
  return (
    <div className={`glass flex min-w-0 flex-col rounded-[1.5rem] px-[1.8rem] py-[1.3rem] shadow-2xl ${className}`}>
      <div className="flex items-center justify-between text-[0.85rem] font-semibold uppercase tracking-[0.16em] text-accent">
        <span>
          {t("Ayah of the day")} · {lang === "ar" ? a.ref : `${a.surah} ${a.ref}`}
        </span>
        <span className="arabic text-[0.95rem] tracking-normal">{lang === "ar" ? a.surahAr : `آية اليوم · ${a.surahAr}`}</span>
      </div>
      <p className={`mt-[0.5rem] text-right leading-[1.75] text-ink ${wide ? "text-[2.3rem]" : "text-[1.85rem]"}`} dir="rtl" style={{ fontFamily: "var(--mushaf-font)" }}>
        {a.ar} <span className="text-accent">{"\u06DD" + toArabicDigits(a.ayah)}</span>
      </p>
      <p className={`mt-[0.3rem] leading-snug text-ink-dim ${wide ? "text-[1.2rem]" : "line-clamp-2 text-[1rem]"}`} dir="ltr">{a.en}</p>
      <div className="mt-[0.6rem] border-t border-line pt-[0.55rem]">
        <p className={`arabic text-right leading-[1.7] text-ink-dim ${wide ? "line-clamp-3 text-[1.1rem]" : "line-clamp-2 text-[0.98rem]"}`} dir="rtl">
          <span className="font-semibold text-accent">التفسير الميسر: </span>
          {a.tafsir}
        </p>
      </div>
    </div>
  );
}
