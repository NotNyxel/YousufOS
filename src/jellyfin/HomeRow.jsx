// "Continue watching" from Jellyfin on the YousufOS home screen. Shows only
// when signed in and there's something to continue; OK resumes it.
import { memo, useEffect, useMemo, useState } from "react";
import { listen } from "../lib/platform";
import { useI18n } from "../lib/settings-store";
import { createClient, episodeCode, normalizeServer, progressOf } from "./api";
import { Art } from "./ui";

function JellyfinHomeRow({ settings, onOpen }) {
  const { t } = useI18n();
  const server = normalizeServer(settings.appUrls?.jellyfin || "http://localhost:8096");
  const auth = settings.jellyfin?.auth;
  const on = settings.jellyfin?.homeRow !== false && settings.jellyfin?.native !== false && auth?.server === server;
  const client = useMemo(() => (on ? createClient(server, auth) : null), [on, server, auth]);
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!client) return;
    let alive = true;
    const load = () =>
      Promise.all([client.resume(8).catch(() => []), client.nextUp(8).catch(() => [])]).then(([r, n]) => {
        if (!alive) return;
        const seen = new Set();
        setItems([...r, ...n].filter((i) => !seen.has(i.Id) && seen.add(i.Id)).slice(0, 8));
      });
    load();
    // Again every few minutes, and when coming back from a film.
    const id = setInterval(load, 5 * 60000);
    window.addEventListener("focus", load);
    const offs = [listen("media-closed", () => setTimeout(load, 1500)), listen("app-closed", load)];
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", load);
      offs.forEach((p) => p.then((f) => f()));
    };
  }, [client]);
  if (!client || !items.length) return null;
  return (
    <section className="fade-up ps-[9rem] pe-[3.5rem] pb-[0.6rem]">
      <div className="mb-[0.6rem] text-[1.05rem] font-semibold text-ink-dim">{t("Continue watching · Jellyfin")}</div>
      <div className="no-scrollbar flex gap-[1.1rem] overflow-x-auto py-[0.5rem] pe-[2rem] ps-[0.3rem]">
        {items.map((it) => {
          const p = progressOf(it);
          const img = client.image(it, "Backdrop", { width: 480 }) || client.image(it, "Primary", { width: 480 }) || client.image(it, "Backdrop", { width: 480, fromSeries: true });
          return (
            <button
              key={it.Id}
              data-nav
              onClick={() => onOpen(it)}
              className="group relative aspect-video w-[15rem] shrink-0 overflow-hidden rounded-[0.9rem] shadow-lg ring-1 ring-white/10 transition-transform focus:z-10 focus:scale-[1.08] focus:ring-[0.2rem] focus:ring-white"
            >
              <Art src={img} item={it} className="absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-[0.8rem] pb-[0.55rem] pt-[1.6rem] text-start">
                <div dir="auto" className="truncate text-[0.95rem] font-bold text-white">{it.Type === "Episode" ? it.SeriesName : it.Name}</div>
                {it.Type === "Episode" && <div dir="auto" className="truncate text-[0.8rem] text-white/70">{episodeCode(it)} · {it.Name}</div>}
              </div>
              {p > 0 && p < 100 && (
                <div className="absolute inset-x-[0.6rem] bottom-[0.35rem] h-[0.25rem] overflow-hidden rounded-full bg-white/25">
                  <div className="h-full bg-accent" style={{ width: `${p}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default memo(JellyfinHomeRow);
