import { hadithOfTheDay } from "../data/hadith";
import { useI18n } from "../lib/settings-store";

export default function HadithCard({ now, compact = false }) {
  const { t, lang } = useI18n();
  const h = hadithOfTheDay(now);
  return (
    <div className={`glass rounded-[1.5rem] shadow-2xl ${compact ? "w-[27rem] px-[1.6rem] py-[1.25rem]" : "w-full p-[2.5rem]"}`}>
      <div className="flex items-center justify-between text-[0.85rem] font-semibold uppercase tracking-[0.16em] text-accent">
        <span>{t("Today's Hadith")}</span>
        {lang !== "ar" && <span className="arabic text-[0.95rem] tracking-normal">حديث اليوم</span>}
      </div>
      <p className={`quran mt-[0.6rem] leading-[1.7] text-ink ${compact ? "text-[1.7rem]" : "text-[2.6rem]"}`}>{h.ar}</p>
      <p dir="ltr" className={`mt-[0.4rem] leading-snug text-ink-dim ${compact ? "line-clamp-2 text-[1rem]" : "text-[1.35rem]"}`}>{h.en}</p>
      <p dir="ltr" className={`mt-[0.45rem] text-ink-faint ${compact ? "text-[0.85rem]" : "text-[1rem]"}`}>— {h.ref}</p>
    </div>
  );
}
