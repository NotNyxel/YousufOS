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

// The last headlines are kept so the news still shows when the internet is down.
const CACHE = "yousufos.news";
const interleave = (bySource) => {
  const items = [];
  const lists = Object.values(bySource);
  for (let i = 0; i < 6; i++) for (const l of lists) if (l[i]) items.push(l[i]);
  return items;
};
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || "null");
    if (!c?.bySource) return null;
    for (const list of Object.values(c.bySource)) for (const it of list) it.date = new Date(it.date);
    return c.bySource;
  } catch {
    return null;
  }
}
function writeCache(bySource) {
  try {
    localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), bySource }));
  } catch {
    /* storage full or blocked: the news just won't be kept */
  }
}

export function NewsProvider({ children }) {
  const { settings } = useSettings();
  const [state, setState] = useState(() => {
    const bySource = readCache();
    return bySource ? { items: interleave(bySource), bySource, status: "ok", offline: true } : { items: [], bySource: {}, status: "loading" };
  });
  const feeds = settings.news.feeds;
  const enabled = settings.news.enabled;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const results = await Promise.allSettled(feeds.map((f) => fetchText(f.url).then((x) => parseFeed(x, f))));
      if (cancelled) return;
      const cached = readCache() || {};
      const bySource = {};
      let fresh = 0;
      results.forEach((r, i) => {
        const name = feeds[i].name;
        if (r.status === "fulfilled" && r.value.length) {
          bySource[name] = r.value;
          fresh++;
        } else bySource[name] = cached[name] || []; // offline: the last headlines from this source
      });
      if (fresh) writeCache(bySource);
      // Interleave sources so the ticker alternates between them.
      const items = interleave(bySource);
      setState((prev) =>
        items.length ? { items, bySource, status: "ok", offline: !fresh } : { ...prev, bySource, status: prev.items.length ? "ok" : "error" },
      );
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    // Internet back: fetch straight away.
    window.addEventListener("online", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("online", load);
    };
  }, [feeds, enabled]);

  return <NewsCtx.Provider value={state}>{children}</NewsCtx.Provider>;
}

