import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleDot, Heart, LoaderCircle, PictureInPicture2, Play, Radio, Search, TvMinimal, X } from "lucide-react";
import TextEntry from "../components/TextEntry";
import TvPlayer from "../components/TvPlayer";
import { allChannels, matchChannels } from "../lib/channels";
import { OFFICIAL, SOURCES, loadSource } from "../lib/iptv";
import { focusDefault, focusEl } from "../lib/nav";
import { invoke, isAndroid, isTauri, listen, playExternal } from "../lib/platform";
import { keyLabel } from "../lib/remote";
import { useI18n } from "../lib/settings-store";

// Hold OK (TV remote) / Y (controller) on a channel: a short menu of what to do with it.
function ChannelMenu({ ch, isFav, onPlay, onFav, onPip, onRecord, onClose }) {
  const { t } = useI18n();
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
    const onKey = (e) => {
      if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const canRecord = isTauri() && !isAndroid();
  const item = (key, Icon, label, act, def) => (
    <button key={key} data-nav data-nav-default={def || undefined} onClick={act} className="focus-row flex items-center gap-[0.9rem] rounded-[1rem] px-[1.2rem] py-[0.8rem] text-start text-[1.15rem] font-semibold">
      <Icon className="h-[1.4rem] w-[1.4rem] text-accent" />
      {label}
    </button>
  );
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[88] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong w-[36rem] rounded-[1.8rem] p-[1.6rem] shadow-2xl">
        <div className="mb-[0.8rem] flex items-center gap-[0.9rem] px-[0.4rem]">
          {ch.logo && <img src={ch.logo} alt="" className="h-[2.6rem] w-[4rem] object-contain" />}
          <div className="truncate text-[1.5rem] font-bold">{ch.name}</div>
        </div>
        <div className="flex flex-col gap-[0.3rem]">
          {item("play", Play, t("Play"), onPlay, true)}
          {item("fav", Heart, isFav ? t("Remove from favourites") : t("Add to favourites"), onFav)}
          {isTauri() && item("pip", PictureInPicture2, t("Small window"), onPip)}
          {canRecord && (
            <div className="mt-[0.4rem] flex items-center gap-[0.5rem] px-[0.4rem]">
              <CircleDot className="h-[1.4rem] w-[1.4rem] shrink-0 text-red-400" />
              <span className="me-[0.4rem] text-[1.05rem] text-ink-dim">{t("Record")}</span>
              {[30, 60, 120, 180].map((m) => (
                <button key={m} data-nav onClick={() => onRecord(m)} className="focus-row rounded-full bg-current/10 px-[1rem] py-[0.5rem] text-[1rem] font-semibold">
                  {m < 60 ? t("{n} min", { n: m }) : t("{n} h", { n: m / 60 })}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ChannelCard({ ch, onOpen, isDefault, isFav, onFav, onPip }) {
  const { t } = useI18n();
  return (
    <button
      data-nav
      data-nav-default={isDefault || undefined}
      data-channel
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          onFav();
        } else if ((e.key === "x" || e.key === "X") && onPip) {
          e.preventDefault();
          onPip();
        }
      }}
      className="group glass relative flex flex-col items-stretch overflow-hidden rounded-[1.1rem] text-start transition-transform duration-200 focus:z-10 focus:scale-[1.07] focus:ring-[0.2rem] focus:ring-ink"
    >
      <div className={`flex h-[7.5rem] items-center justify-center px-[1rem] ${ch.light ? "bg-white/85" : "bg-black/25"}`}>
        {ch.logo ? (
          <img src={ch.logo} alt="" loading="lazy" className="max-h-[5.5rem] max-w-[85%] object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
        ) : (
          <TvMinimal className="h-[2.4rem] w-[2.4rem] text-ink-faint" />
        )}
      </div>
      <div className="px-[0.9rem] py-[0.6rem]">
        <div className="truncate text-[1rem] font-semibold">{ch.name}</div>
        <div className="truncate text-[0.8rem] text-ink-faint">{ch.group ? t(ch.group) : " "}</div>
      </div>
      {isFav && <Heart className="absolute end-[0.6rem] top-[0.6rem] h-[1.1rem] w-[1.1rem] fill-red-400 text-red-400" />}
    </button>
  );
}

function LiveTV({ settings, update, paused, onPlayingChange, kids = false }) {
  const { t } = useI18n();
  const iptv = settings.iptv;
  // Android TV: always the TV's own video player (plays nearly every stream).
  const player = isAndroid() ? "mpv" : iptv.player || "auto";
  const sources = useMemo(
    () =>
      kids
        ? // Kids profile: children's channels and the Qur'an channels only.
          [SOURCES.find((x) => x.id === "kids"), { id: "kidsquran", label: "Qur'an & Sunnah", channels: OFFICIAL.filter((c) => c.group === "Islamic") }]
        : [{ id: "fav", label: "Favourites" }, ...SOURCES, ...(iptv.playlists || [])],
    [iptv.playlists, kids],
  );
  // 1.3 opens on the new official channels once; after that, the last list used.
  const [sourceId, setSourceId] = useState(kids ? "kids" : iptv.v13 && iptv.source ? iptv.source : "official");
  const [loaded, setLoaded] = useState({ key: null, status: "loading", channels: [] });
  const [playing, setPlaying] = useState(null); // index into channels (built-in player)
  const [notice, setNotice] = useState("");
  const source = sources.find((s) => (s.id || s.url) === sourceId) || sources[1];
  const sourceTimer = useRef();

  const key = source.id || source.url;
  useEffect(() => {
    if (source.id === "fav") return;
    let cancelled = false;
    loadSource(source)
      .then((channels) => !cancelled && setLoaded({ key, status: "ok", channels }))
      .catch(() => !cancelled && setLoaded({ key, status: "error", channels: [] }));
    return () => {
      cancelled = true;
    };
  }, [key, source]);
  const state =
    source.id === "fav"
      ? { status: "ok", channels: (iptv.favorites || []).filter((c) => !c.web) }
      : loaded.key === key
        ? loaded
        : { status: "loading", channels: [] };

  useEffect(() => {
    onPlayingChange?.(playing !== null);
  }, [playing, onPlayingChange]);
  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 9000);
    return () => clearTimeout(id);
  }, [notice]);

  // Switch lists a moment after a chip is focused, so passing over chips is smooth.
  const chooseSource = (id) => {
    clearTimeout(sourceTimer.current);
    sourceTimer.current = setTimeout(() => {
      setSourceId(id);
      if (!kids) update({ iptv: { source: id, v13: true } });
    }, 250);
  };

  // Search: this list plus the official channels, favourites and the big free lists.
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [pool, setPool] = useState([]);
  useEffect(() => {
    if (!query) return;
    let alive = true;
    allChannels(settings)
      .then((l) => alive && setPool(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [query, settings]);
  const results = useMemo(() => {
    if (!query) return null;
    const seen = new Set();
    const list = [...state.channels, ...pool].filter((c) => c.url && !c.web && !seen.has(c.url) && seen.add(c.url));
    return matchChannels(list, query, 120);
  }, [query, pool, state.channels]);
  const [menuFor, setMenuFor] = useState(null); // index of the channel with the quick menu open
  const holdMenu = (iptv.holdOk || "fav") === "menu";

  const { status } = state;
  const channels = results || state.channels;
  const favUrls = new Set((iptv.favorites || []).map((c) => c.url));
  const current = playing !== null ? channels[playing] : null;

  const toggleFav = useCallback(
    (ch) => {
      if (!ch) return;
      update("iptv.favorites", (list = []) => (list.some((c) => c.url === ch.url) ? list.filter((c) => c.url !== ch.url) : [...list, ch]));
    },
    [update],
  );

  // mpv plays streams the built-in player can't.
  const playInMpv = useCallback(
    async (list, i) => {
      try {
        await playExternal(list, i);
        onPlayingChange?.(true);
      } catch (e) {
        setNotice(String(e));
      }
    },
    [onPlayingChange],
  );
  useEffect(() => {
    const off = listen("player-closed", ({ error }) => {
      onPlayingChange?.(false);
      if (error) setNotice(t("This channel couldn't be played. It may be offline or not available in your country."));
      requestAnimationFrame(() => focusEl(document.querySelector("[data-main] [data-channel]:focus") || document.querySelector("[data-main] [data-channel]")));
    });
    return () => off.then((f) => f());
  }, [onPlayingChange, t]);

  // X: this channel in a small window on top of everything (X again: close).
  const togglePip = useCallback(
    async (ch) => {
      if (!isTauri()) return;
      try {
        const running = await invoke("pip_running");
        if (running && pipUrl.current === ch.url) {
          await invoke("pip_stop");
          pipUrl.current = null;
          setNotice(t("Small window closed"));
          return;
        }
        const p = settings.pip || {};
        await invoke("pip_start", { url: ch.url, title: ch.name, corner: p.corner || "br", size: p.size || 480, muted: !!p.muted, userAgent: ch.ua || null, live: true });
        pipUrl.current = ch.url;
        setNotice(t("{name} in a small window. {key} on it again closes it.", { name: ch.name, key: keyLabel("x", t) }));
      } catch (e) {
        setNotice(String(e));
      }
    },
    [settings.pip, t],
  );
  const pipUrl = useRef(null);

  const open = (i) => {
    if (isTauri() && player === "mpv") return playInMpv(channels, i);
    setPlaying(i);
  };

  // The built-in player gave up on a channel: hand it to mpv (Automatic mode).
  const onFailed = useCallback(
    (i, reason) => {
      if (isTauri() && player === "auto") {
        setPlaying(null);
        setNotice(t("Trying the other player…") + (reason ? ` (${t(reason)})` : ""));
        playInMpv(channels, i);
        return true;
      }
      return false;
    },
    [player, channels, playInMpv, t],
  );

  // Back from the channel grid goes to the list chips first.
  const grid = useRef(null);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const onBack = (e) => {
      e.preventDefault();
      focusEl(document.querySelector("[data-main] [data-source-active]"));
    };
    el.addEventListener("nav-back", onBack);
    return () => el.removeEventListener("nav-back", onBack);
  });

  return (
    <div className="flex h-full flex-col pb-[2rem] ps-[9rem] pe-[4rem] pt-[3.5rem]">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[2.6rem] font-bold tracking-tight">{t("Live TV")}</h1>
          <p className="mt-[0.3rem] text-[1.1rem] text-ink-dim">
            {source.id === "official"
              ? t("Live streams straight from the broadcasters. ▲ ▼ change channel while watching.")
              : t("Free channels from around the world. Some may be offline at times.")}
          </p>
        </div>
        {(status === "ok" || query) && <div className="text-[1.05rem] text-ink-faint">{t("{n} channels", { n: channels.length })}</div>}
      </div>

      <div className="mt-[1.4rem] flex flex-wrap gap-[0.6rem]">
        <button
          data-nav
          onClick={() => setTyping(true)}
          className={`focus-row flex items-center gap-[0.5rem] rounded-full px-[1.3rem] py-[0.6rem] text-[1.05rem] font-semibold ${query ? "bg-accent text-on-accent" : "glass text-ink-dim"}`}
        >
          <Search className="h-[1.1rem] w-[1.1rem]" />
          {query ? `“${query}”` : t("Search")}
        </button>
        {query && (
          <button data-nav onClick={() => setQuery("")} aria-label={t("Clear search")} className="focus-row flex items-center rounded-full px-[0.9rem] py-[0.6rem] glass text-ink-dim">
            <X className="h-[1.1rem] w-[1.1rem]" />
          </button>
        )}
        {sources.map((s) => {
          const id = s.id || s.url;
          const active = id === sourceId;
          return (
            <button
              key={id}
              data-nav
              data-source-active={(active && !query) || undefined}
              data-nav-default={(active && status !== "ok") || (active && channels.length === 0) || undefined}
              onFocus={() => {
                if (query) return;
                chooseSource(id);
              }}
              onClick={() => {
                setQuery("");
                chooseSource(id);
              }}
              className={`focus-row flex items-center gap-[0.5rem] rounded-full px-[1.3rem] py-[0.6rem] text-[1.05rem] font-semibold ${active ? "bg-accent text-on-accent" : "glass text-ink-dim"}`}
            >
              {s.id === "fav" && <Heart className="h-[1.1rem] w-[1.1rem]" />}
              {s.id === "official" && <Radio className="h-[1.1rem] w-[1.1rem]" />}
              {t(s.label)}
            </button>
          );
        })}
      </div>

      {notice && <div className="mt-[1rem] rounded-[0.9rem] bg-accent/15 px-[1.1rem] py-[0.7rem] text-[1.05rem] text-accent">{notice}</div>}

      <div ref={grid} className="mt-[1.6rem] min-h-0 flex-1 overflow-y-auto px-[0.6rem] pb-[1rem] pt-[0.4rem]">
        {status === "loading" && (
          <div className="flex items-center gap-[0.8rem] text-[1.2rem] text-ink-dim">
            <LoaderCircle className="h-[1.6rem] w-[1.6rem] animate-spin" /> {t("Loading channels…")}
          </div>
        )}
        {status === "error" && <div className="text-[1.2rem] text-ink-dim">{t("Couldn't load channels. Check the internet connection.")}</div>}
        {status === "ok" && channels.length === 0 && (
          <div className="text-[1.2rem] text-ink-dim">
            {query
              ? t("No channels match “{q}”.", { q: query })
              : source.id === "fav"
                ? t("No favourites yet. {key} on a channel adds it (or choose “Add to favourites” while watching).", { key: keyLabel("y", t) })
                : t("No channels found.")}
          </div>
        )}
        <div className="grid grid-cols-6 gap-[1.1rem]">
          {channels.map((ch, i) => (
            <ChannelCard
              key={ch.url}
              ch={ch}
              isDefault={i === 0}
              isFav={favUrls.has(ch.url)}
              onFav={() => {
                if (holdMenu) return setMenuFor(i);
                toggleFav(ch);
                setNotice(favUrls.has(ch.url) ? t("{name} removed from favourites", { name: ch.name }) : t("{name} added to favourites", { name: ch.name }));
              }}
              onOpen={() => open(i)}
              onPip={() => togglePip(ch)}
            />
          ))}
        </div>
        {status === "ok" && channels.length > 0 && (
          <div className="mt-[1.4rem] text-[0.95rem] text-ink-faint">
            {holdMenu ? t("{key} on a channel: more options", { key: keyLabel("y", t) }) : t("{key} on a channel: add or remove a favourite", { key: keyLabel("y", t) })}
            {isTauri() && " · " + t("{key}: small window", { key: keyLabel("x", t) })}
          </div>
        )}
      </div>

      {typing && (
        <TextEntry
          title={t("Search channels")}
          hint={t("Any part of the name works, even with a typo")}
          value={query}
          layout="text"
          saveLabel={t("Search")}
          onSave={(v) => {
            setQuery(v.trim());
            setTyping(false);
            requestAnimationFrame(() => focusEl(document.querySelector("[data-main] [data-channel]")));
          }}
          onClose={() => setTyping(false)}
        />
      )}
      {menuFor !== null && channels[menuFor] && (
        <ChannelMenu
          ch={channels[menuFor]}
          isFav={favUrls.has(channels[menuFor].url)}
          onClose={() => setMenuFor(null)}
          onPlay={() => {
            const i = menuFor;
            setMenuFor(null);
            open(i);
          }}
          onFav={() => {
            toggleFav(channels[menuFor]);
            setMenuFor(null);
          }}
          onPip={() => {
            togglePip(channels[menuFor]);
            setMenuFor(null);
          }}
          onRecord={(minutes) => {
            const ch = channels[menuFor];
            setMenuFor(null);
            invoke("record_start", { url: ch.url, name: ch.name, minutes, userAgent: ch.ua || null })
              .then(() => setNotice(t("Recording {name} for {n} minutes. Find it in the Videos folder (YousufOS → Recordings) or on the phone remote's page.", { name: ch.name, n: minutes })))
              .catch((e) => setNotice(String(e?.message || e)));
          }}
        />
      )}
      {current && (
        <TvPlayer
          channels={channels}
          index={playing}
          onIndex={setPlaying}
          onClose={() => setPlaying(null)}
          onFailed={onFailed}
          isFav={favUrls.has(current.url)}
          onToggleFav={() => toggleFav(current)}
          paused={paused}
        />
      )}
    </div>
  );
}

export default memo(LiveTV);
