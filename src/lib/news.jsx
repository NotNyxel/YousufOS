import { useEffect, useState } from "react";
import { NewsCtx } from "./news-store";
import { fetchText } from "./platform";
import { useSettings } from "./settings-store";

function parseFeed(xml, feed) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const nodes = [...doc.querySelectorAll("item, entry")].slice(0, 20);
  return nodes
    .map((n) => {
      let title = n.querySelector("title")?.textContent?.trim() || "";
      const linkEl = n.querySelector("link");
      const link = linkEl?.getAttribute("href") || linkEl?.textContent?.trim() || "";
      const date = new Date(n.querySelector("pubDate, published, updated")?.textContent || Date.now());
      // Google News appends " - Publisher"
      if (feed.url.includes("news.google.")) title = title.replace(/\s+-\s+[^-]+$/, "");
      return { title, link, date, source: feed.name, label: feed.label };
    })
    .filter((i) => i.title);
}

export function NewsProvider({ children }) {
  const { settings } = useSettings();
  const [state, setState] = useState({ items: [], bySource: {}, status: "loading" });
  const feeds = settings.news.feeds;
  const enabled = settings.news.enabled;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const results = await Promise.allSettled(feeds.map((f) => fetchText(f.url).then((x) => parseFeed(x, f))));
      if (cancelled) return;
      const bySource = {};
      results.forEach((r, i) => {
        bySource[feeds[i].name] = r.status === "fulfilled" ? r.value : [];
      });
      // Interleave sources so the ticker alternates between them.
      const items = [];
      const lists = Object.values(bySource);
      for (let i = 0; i < 6; i++) for (const l of lists) if (l[i]) items.push(l[i]);
      setState((prev) =>
        items.length ? { items, bySource, status: "ok" } : { ...prev, bySource, status: prev.items.length ? "ok" : "error" },
      );
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [feeds, enabled]);

  return <NewsCtx.Provider value={state}>{children}</NewsCtx.Provider>;
}

