import { memo } from "react";
import { RefreshCw } from "lucide-react";
import { useNews } from "../lib/news-store";
import { useI18n } from "../lib/settings-store";

function ago(date) {
  const m = Math.round((Date.now() - date) / 60000);
  if (!isFinite(m) || m < 0) return "";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function News({ settings, onOpen }) {
  const { t } = useI18n();
  const { bySource, status } = useNews();
  const feeds = settings.news.feeds;
  return (
    <div className="h-full overflow-hidden pb-[2rem] ps-[9rem] pe-[4rem] pt-[4rem]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[2.6rem] font-bold tracking-tight">{t("News")}</h1>
          <p className="mt-[0.3rem] text-[1.15rem] text-ink-dim">{t("Breaking, regional and UAE headlines. Refreshes every 10 minutes.")}</p>
        </div>
        {status === "loading" && (
          <div className="flex items-center gap-[0.5rem] text-ink-dim">
            <RefreshCw className="h-[1.2rem] w-[1.2rem] animate-spin" /> {t("Loading")}
          </div>
        )}
      </div>
      <div className="mt-[2rem] grid h-[calc(100%-7rem)] grid-cols-3 gap-[1.5rem]">
        {feeds.map((feed) => {
          const items = bySource[feed.name] || [];
          return (
            <section key={feed.name} className="glass flex min-h-0 flex-col rounded-[1.6rem] p-[1.2rem]">
              <div className="flex items-center justify-between px-[0.6rem] pb-[0.8rem]">
                <span className="text-[0.9rem] font-bold uppercase tracking-[0.18em] text-accent">{t(feed.label)}</span>
                <span className="arabic text-[1.3rem] font-bold">{feed.name}</span>
              </div>
              <div className="min-h-0 flex-1 space-y-[0.4rem] overflow-y-auto">
                {items.length === 0 && (
                  <div className="arabic px-[0.6rem] py-[1rem] text-[1.1rem] text-ink-faint">
                    {status === "loading" ? "جارٍ التحميل…" : "لا توجد أخبار متاحة"}
                  </div>
                )}
                {items.map((item, i) => (
                  <button
                    key={i}
                    data-nav
                    onClick={() => item.link && onOpen({ id: "news", name: feed.name, url: item.link, bg: "#0b0d12" })}
                    className="focus-row arabic block w-full rounded-[1rem] px-[1rem] py-[0.8rem] text-right"
                  >
                    <div className="text-[1.2rem] font-semibold leading-snug">{item.title}</div>
                    <div className="dim-on-focus mt-[0.25rem] text-[0.9rem] text-ink-faint" dir="ltr">
                      {ago(item.date)}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default memo(News);
