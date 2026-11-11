// One search for everything: apps, Live TV channels, Jellyfin and YouTube.
// Type with the on-screen keyboard, a real keyboard, or the phone remote.
import { memo, useEffect, useMemo, useState } from "react";
import { Delete, Film, Play, Search as SearchIcon, Tv } from "lucide-react";
import AppTile from "../components/AppTile";
import { focusDefault } from "../lib/nav";
import { isTauri, listen, playExternal } from "../lib/platform";
import { useI18n } from "../lib/settings-store";
import { allChannels, matchChannels, quickChannels } from "../lib/channels";
import { createClient, episodeCode, normalizeServer } from "../jellyfin/api";
import { Art } from "../jellyfin/ui";

const EN = ["abcdefg", "hijklmn", "opqrstu", "vwxyz12", "3456789"];
const AR = ["ابتثجحخ", "دذرزسشص", "ضطظعغفق", "كلمنهوي", "ءآأإةى0"];

function Search({ settings, apps, onLaunch, onJellyfin }) {
  const { t, lang } = useI18n();
  const [text, setText] = useState("");
  const [arabic, setArabic] = useState(lang === "ar");
  const [channels, setChannels] = useState({ q: null, list: [] });
  const [jf, setJf] = useState({ q: null, list: [] });
  const q = text.trim();

  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault(document.querySelector("[data-main]")));
    return () => cancelAnimationFrame(id);
  }, []);
  // A real keyboard, and text typed on the phone remote.
  useEffect(() => {
    const onKey = (e) => {
      if (!e.isTrusted || e.ctrlKey || e.altKey || e.metaKey || document.querySelector("[data-nav-scope]")) return;
      if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setText((v) => v + e.key);
      }
    };
    window.addEventListener("keydown", onKey, true);
    const off = listen("remote-text", (s) => setText((v) => v + s));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      off.then((f) => f());
    };
  }, []);

  // Channels: the quick ones at once, the big free lists once they've loaded.
  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const id = setTimeout(async () => {
      setChannels({ q, list: matchChannels(quickChannels(settings), q, 12) });
      const all = await allChannels(settings).catch(() => []);
      if (alive) setChannels({ q, list: matchChannels(all, q, 24) });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q, settings]);

  const server = normalizeServer(settings.appUrls?.jellyfin || "http://localhost:8096");
  const auth = settings.jellyfin?.auth?.server === server ? settings.jellyfin.auth : null;
  const client = useMemo(() => (auth && settings.jellyfin?.native !== false ? createClient(server, auth) : null), [auth, server, settings.jellyfin?.native]);
  useEffect(() => {
    if (!client || q.length < 2) return;
    let alive = true;
    const id = setTimeout(() => {
      client
        .items({ searchTerm: q, recursive: true, includeItemTypes: "Movie,Series,Episode,MusicAlbum", limit: 16 })
        .then((r) => alive && setJf({ q, list: r?.Items || [] }), () => alive && setJf({ q, list: [] }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [q, client]);

  const appHits = q.length >= 1 ? apps.filter((a) => !a.hidden && (a.name.toLowerCase().includes(q.toLowerCase()) || t(a.name).includes(q))).slice(0, 6) : [];
  const chHits = channels.q === q && q.length >= 2 ? channels.list : [];
  const jfHits = jf.q === q && q.length >= 2 ? jf.list : [];
  const youtube = apps.find((a) => a.id === "youtube");
  const keys = arabic ? AR : EN;
  const k = "flex h-[3.2rem] items-center justify-center rounded-[0.8rem] bg-white/[0.08] text-[1.25rem] font-semibold focus:scale-[1.1] focus:bg-ink focus:text-canvas";

  return (
    <div className="flex h-full gap-[3rem] ps-[9rem] pe-[3rem] pt-[3rem]">
      <div className="w-[27rem] shrink-0" dir={arabic ? "rtl" : "ltr"}>
        <h1 className="mb-[1.2rem] text-[2.4rem] font-bold">{t("Search")}</h1>
        <div className="flex h-[3.8rem] items-center gap-[0.8rem] rounded-[1rem] bg-black/35 px-[1.2rem] text-[1.4rem] ring-1 ring-white/10">
          <SearchIcon className="h-[1.4rem] w-[1.4rem] text-ink-faint" />
          <span dir="auto" className="min-w-0 flex-1 truncate">{text || <span className="text-ink-faint">{t("Apps, channels, films, YouTube…")}</span>}</span>
          <span className="h-[1.6rem] w-[0.12rem] animate-pulse bg-accent" />
        </div>
        <div className="mt-[1rem] grid grid-cols-7 gap-[0.45rem]">
          {keys.flatMap((row, r) =>
            [...row].map((ch, c) => (
              <button key={`${r}-${c}-${ch}`} data-nav data-nav-default={(r === 0 && c === 0) || undefined} className={k} onClick={() => setText((v) => v + ch)}>
                {ch}
              </button>
            )),
          )}
          <button data-nav className={`${k} col-span-3 text-[1rem]`} onClick={() => setText((v) => v + " ")}>
            {t("Space")}
          </button>
          <button data-nav className={`${k} col-span-2`} onClick={() => setText((v) => v.slice(0, -1))} aria-label={t("Delete")}>
            <Delete className="h-[1.4rem] w-[1.4rem]" />
          </button>
          <button data-nav className={`${k} text-[0.95rem]`} onClick={() => setArabic((a) => !a)}>
            {arabic ? "EN" : "ع"}
          </button>
          <button data-nav className={`${k} text-[0.95rem]`} onClick={() => setText("")}>
            {t("Clear")}
          </button>
        </div>
        <p className="mt-[1rem] text-[0.95rem] text-ink-faint">{t("You can also type on a keyboard, or on your phone (Settings → Phone & Remote).")}</p>
      </div>

      <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto pb-[5rem] pt-[4.2rem]">
        {q.length < 2 && !appHits.length && <div className="text-[1.2rem] text-ink-faint">{t("Type at least two letters.")}</div>}
        {appHits.length > 0 && (
          <Section title={t("Apps")}>
            <div className="flex gap-[1.2rem] pb-[1rem]">
              {appHits.map((a) => (
                <AppTile key={a.id} app={a} onLaunch={onLaunch} size="md" />
              ))}
            </div>
          </Section>
        )}
        {q.length >= 2 && youtube && (
          <Section title="YouTube">
            <ResultButton
              Icon={Play}
              title={t("Search YouTube for “{q}”", { q })}
              sub={t("Opens YouTube with the results")}
              onClick={() => onLaunch({ ...youtube, url: `https://www.youtube.com/tv#/search?q=${encodeURIComponent(q)}` })}
            />
          </Section>
        )}
        {jfHits.length > 0 && (
          <Section title="Jellyfin">
            <div className="no-scrollbar flex gap-[1.1rem] overflow-x-auto py-[0.5rem]">
              {jfHits.map((it) => (
                <button
                  key={it.Id}
                  data-nav
                  onClick={() => onJellyfin(it)}
                  className="w-[11rem] shrink-0 text-start transition-transform focus:scale-[1.06] [&:focus>div:first-child]:ring-[0.2rem] [&:focus>div:first-child]:ring-white"
                >
                  <Art src={client.image(it, "Primary", { height: 330 }) || client.image(it, "Primary", { height: 330, fromSeries: true })} item={it} className="aspect-[2/3] w-full rounded-[0.9rem] ring-1 ring-white/10" />
                  <div dir="auto" className="mt-[0.5rem] truncate text-[1rem] font-semibold">{it.Type === "Episode" ? it.SeriesName : it.Name}</div>
                  <div className="truncate text-[0.85rem] text-ink-faint">{it.Type === "Episode" ? `${episodeCode(it)} · ${it.Name}` : it.ProductionYear || t(it.Type === "Series" ? "Shows" : it.Type === "MusicAlbum" ? "Music" : "Films")}</div>
                </button>
              ))}
            </div>
          </Section>
        )}
        {chHits.length > 0 && (
          <Section title={t("Live TV")}>
            <div className="grid grid-cols-2 gap-[0.7rem]">
              {chHits.map((c) => (
                <ResultButton
                  key={c.url}
                  Icon={Tv}
                  logo={c.logo}
                  title={c.name}
                  sub={c.group ? t(c.group) : ""}
                  onClick={() => (isTauri() ? playExternal([c], 0) : window.open(c.url))}
                />
              ))}
            </div>
          </Section>
        )}
        {q.length >= 2 && !appHits.length && !jfHits.length && !chHits.length && channels.q === q && (
          <div className="mt-[1rem] flex items-center gap-[0.8rem] text-[1.1rem] text-ink-faint">
            <Film className="h-[1.3rem] w-[1.3rem]" /> {t("Nothing in your apps, channels or Jellyfin. Try YouTube above.")}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-[1.8rem]">
      <h2 className="mb-[0.6rem] text-[1.05rem] font-bold uppercase tracking-[0.16em] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

function ResultButton({ Icon, logo, title, sub, onClick }) {
  return (
    <button data-nav onClick={onClick} className="focus-row glass flex w-full items-center gap-[1rem] rounded-[1rem] px-[1rem] py-[0.8rem] text-start">
      <span className="flex h-[2.8rem] w-[2.8rem] shrink-0 items-center justify-center overflow-hidden rounded-[0.7rem] bg-black/25">
        {logo ? <img src={logo} alt="" className="max-h-[2.2rem] max-w-[2.4rem] object-contain" /> : <Icon className="h-[1.4rem] w-[1.4rem]" />}
      </span>
      <span className="min-w-0">
        <span dir="auto" className="block truncate text-[1.1rem] font-semibold">{title}</span>
        {sub && <span className="dim-on-focus block truncate text-[0.9rem] text-ink-faint">{sub}</span>}
      </span>
    </button>
  );
}

export default memo(Search);
