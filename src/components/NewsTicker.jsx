import { useNews } from "../lib/news-store";
import { useI18n } from "../lib/settings-store";

export default function NewsTicker() {
  const { t } = useI18n();
  const { items, status } = useNews();
  const list = items.length
    ? items
    : [{ title: status === "loading" ? "جارٍ تحميل الأخبار…" : "الأخبار غير متاحة حالياً — تحقق من الاتصال بالإنترنت", source: "YousufOS" }];
  const duration = Math.max(60, list.reduce((n, i) => n + i.title.length, 0) * 0.16);

  const strip = (
    <div className="arabic flex shrink-0 items-center" dir="rtl">
      {list.map((item, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <span className="text-[1.15rem] font-semibold text-accent">{item.source}</span>
          <span className="mx-[0.8rem] text-ink-faint">|</span>
          <span className="text-[1.2rem] font-medium text-ink">{item.title}</span>
          <span className="mx-[2.2rem] h-[0.45rem] w-[0.45rem] rotate-45 bg-accent/70" />
        </span>
      ))}
    </div>
  );

  return (
    <div className="glass-strong relative flex h-[3.6rem] items-center overflow-hidden border-x-0 border-b-0">
      <div className="relative z-10 flex h-full shrink-0 items-center gap-[0.7rem] bg-accent ps-[2rem] pe-[1.4rem] text-on-accent">
        <span className="breathe h-[0.55rem] w-[0.55rem] rounded-full bg-on-accent" />
        <span className="arabic text-[1.15rem] font-bold">عاجل</span>
        <span className="text-[0.9rem] font-bold uppercase tracking-[0.18em] opacity-80">{t("News")}</span>
      </div>
      <div className="relative flex-1 overflow-hidden" style={{ direction: "ltr" }}>
        <div className="ticker-track flex w-max" style={{ "--ticker-duration": `${duration}s` }}>
          {strip}
          {strip}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[4rem] bg-gradient-to-r from-[var(--panel-strong)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[4rem] bg-gradient-to-l from-[var(--panel-strong)] to-transparent" />
      </div>
    </div>
  );
}
