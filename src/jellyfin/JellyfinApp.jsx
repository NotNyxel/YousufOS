// YousufOS's own Jellyfin app: the server's films, shows and music in the
// launcher's style, driven entirely by the remote or controller.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Download, Globe, House, LogOut, Search, UserRoundCog, Users, X } from "lucide-react";
import TextEntry from "../components/TextEntry";
import { focusDefault } from "../lib/nav";
import { useI18n } from "../lib/settings-store";
import { createClient, normalizeServer, clock } from "./api";
import { NowPlaying } from "./music";
import { useMusic } from "./music-player";
import { usePlayback } from "./playback";
import SignIn from "./SignIn";
import { Backdrop, Pill, Spinner } from "./ui";
import { clearCache, useData } from "./data";
import { DetailsView, HomeView, LibraryView, PhotoViewer, SearchView } from "./views";
import { DownloadsView, ProfilePicker, Unreachable, WatchTogether } from "./screens";
import { useSyncPlay } from "./syncplay";
import { playDownload, useDownloads, useReachable } from "./hooks";
import { startDownload } from "./downloads";

const BACK = new Set(["Escape", "Backspace", "BrowserBack", "GoBack"]);

export default function JellyfinApp({ server, settings, update, onClose, onOpenWeb, onPlayingChange, timeLabel, start }) {
  const { t } = useI18n();
  const base = normalizeServer(server);
  const jf = settings.jellyfin || {};
  // Profiles signed in on this TV for this server (older versions kept one).
  const saved = jf.auth && jf.auth.server === base ? jf.auth : null;
  const accounts = useMemo(() => {
    const list = (jf.accounts || []).filter((a) => a.server === base);
    return saved && !list.some((a) => a.userId === saved.userId) ? [saved, ...list] : list;
  }, [jf.accounts, saved, base]);
  const [picking, setPicking] = useState(() => accounts.length > 1 && jf.askProfile !== false && !start);
  const [adding, setAdding] = useState(false);
  const [offline, setOffline] = useState(false);
  const [dlVersion, setDlVersion] = useState(0);
  const auth = adding ? null : saved;
  const publicClient = useMemo(() => createClient(base), [base]);
  const client = useMemo(() => createClient(base, auth || {}), [base, auth]);
  const learnMac = useCallback((mac) => update("jellyfin.wol", (w = {}) => ({ ...w, mac })), [update]);
  const reach = useReachable(publicClient, jf.wol, learnMac);
  const downloads = useDownloads(dlVersion);
  const [toast, setToast] = useState("");
  const [editServer, setEditServer] = useState(false);

  const onSignedIn = useCallback(
    (res) => {
      const account = { server: base, token: res.AccessToken, userId: res.User?.Id, userName: res.User?.Name, serverId: res.ServerId };
      update("jellyfin", (cur = {}) => ({
        ...cur,
        auth: account,
        accounts: [...(cur.accounts || []).filter((a) => !(a.server === base && a.userId === account.userId)), account],
      }));
      setAdding(false);
    },
    [update, base],
  );
  const signOut = useCallback(() => {
    client.signOut();
    clearCache(client);
    update("jellyfin", (cur = {}) => {
      const left = (cur.accounts || []).filter((a) => !(a.server === base && a.userId === auth?.userId));
      return { ...cur, accounts: left, auth: left.find((a) => a.server === base) || null };
    });
  }, [client, update, base, auth]);
  const pick = useCallback(
    (a) => {
      update("jellyfin.auth", a);
      setPicking(false);
    },
    [update],
  );

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const browsing = reach.status === "ok" && !picking && !!auth && !offline;
  // Back outside the main browser: the downloads go back, anything else closes.
  useEffect(() => {
    if (browsing) return;
    const onKey = (e) => {
      if (!BACK.has(e.key) || document.querySelector("[data-nav-scope] [data-nav-scope]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (offline) setOffline(false);
      else if (adding && accounts.length) {
        setAdding(false);
        setPicking(true);
      } else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [browsing, offline, adding, accounts.length, onClose]);

  let body;
  if (offline)
    body = (
      <DownloadsView
        downloads={downloads}
        onPlay={(d) => playDownload(d).catch((e) => setToast(String(e)))}
        onChanged={() => setDlVersion((v) => v + 1)}
      />
    );
  else if (reach.status !== "ok")
    body = (
      <Unreachable
        client={publicClient}
        reach={reach}
        wol={jf.wol}
        onChangeServer={() => setEditServer(true)}
        onOpenWeb={onOpenWeb}
        onOffline={() => setOffline(true)}
        downloadsCount={downloads.length}
      />
    );
  else if (picking)
    body = (
      <ProfilePicker
        accounts={accounts}
        serverName={reach.info?.ServerName}
        onPick={pick}
        onAdd={() => {
          setPicking(false);
          setAdding(true);
        }}
      />
    );
  else if (!auth) body = <SignIn client={client} onSignedIn={onSignedIn} onChangeServer={() => setEditServer(true)} onOpenWeb={onOpenWeb} />;
  else
    body = (
      <Browser
        {...{ client, auth, settings, t, onClose, onOpenWeb, signOut, setToast, onPlayingChange, timeLabel, start, downloads }}
        onSwitchProfile={() => setPicking(true)}
        onDownloadsChanged={() => setDlVersion((v) => v + 1)}
      />
    );

  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[70] overflow-hidden bg-[#06070a] text-white" style={{ animation: "page-in 260ms ease both" }}>
      {body}
      {editServer && (
        <TextEntry
          title={t("Jellyfin server")}
          hint={t("The address of the PC running Jellyfin, e.g. 192.168.1.20 (Jellyfin on that PC: Dashboard → Networking shows it).")}
          value={server}
          port={8096}
          onClose={() => setEditServer(false)}
          onSave={(v) => {
            const next = normalizeServer(v);
            update("appUrls", (cur = {}) => ({ ...cur, jellyfin: next }));
            setEditServer(false);
            reach.retry();
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-[2.4rem] start-1/2 z-[95] -translate-x-1/2 rounded-full bg-white px-[1.6rem] py-[0.8rem] text-[1.1rem] font-semibold text-black shadow-2xl fade-up rtl:translate-x-1/2">
          {toast}
        </div>
      )}
    </div>,
    document.body,
  );
}

function Browser({ client, auth, settings, t, onClose, onOpenWeb, signOut, setToast, onPlayingChange, timeLabel, start, downloads, onSwitchProfile, onDownloadsChanged }) {
  const viewsData = useData(client, "views", () => client.views());
  const views = useMemo(() => (viewsData.data || []).filter((v) => v.CollectionType !== "livetv"), [viewsData.data]);
  const [tab, setTab] = useState("home");
  const [stack, setStack] = useState([]); // pages opened on top of the tab
  const [backdrop, setBackdropRaw] = useState(null);
  const [version, setVersion] = useState(0);
  const [photos, setPhotos] = useState(null);
  const [menu, setMenu] = useState(false);
  const setBackdrop = useCallback((src) => setBackdropRaw(src || null), []);
  const closeMenu = useCallback(() => setMenu(false), []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // The token was revoked (signed out elsewhere): sign in again.
  useEffect(() => {
    if (viewsData.error?.status === 401) signOut();
  }, [viewsData.error, signOut]);

  const music = useMusic(client);
  const playbackRef = useRef(null);
  const sync = useSyncPlay({ client, auth, t, toast: setToast, playbackRef });
  const [together, setTogether] = useState(false);
  const playback = usePlayback({
    client,
    t,
    onToast: (m) => setToast(t(m)),
    onFinished: () => refresh(),
    sync: sync.hooks,
  });
  useEffect(() => {
    playbackRef.current = playback;
  });
  useEffect(() => {
    onPlayingChange?.(!!playback.playing || (!!music.current && !music.state.paused));
  }, [playback.playing, music.current, music.state.paused, onPlayingChange]);
  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

  // Opened at an item (home screen row, universal search): its page, and
  // straight into playback for "Continue watching".
  const started = useRef(false);
  useEffect(() => {
    if (!start?.item || started.current) return;
    started.current = true;
    const it = start.item;
    setStack([{ kind: "item", id: it.Type === "Episode" && !start.play ? it.Id : it.Id }]);
    if (!start.play) return;
    (async () => {
      if (it.Type === "Episode" && it.SeriesId) {
        const eps = await client.episodes(it.SeriesId, it.SeasonId).catch(() => null);
        const i = eps ? eps.findIndex((e) => e.Id === it.Id) : -1;
        if (i >= 0) return playback.play(eps, i, { resume: true });
      }
      playback.play([it], 0, { resume: true });
    })();
  }, [start, client, playback]);

  const downloadedIds = useMemo(() => new Set((downloads || []).map((d) => d.Id)), [downloads]);
  const onDownload = useCallback(
    async (items) => {
      const list = (Array.isArray(items) ? items : [items]).filter((i) => !downloadedIds.has(i.Id));
      if (!list.length) return setToast(t("Already on this TV"));
      try {
        for (const it of list) await startDownload(client, it.MediaSources ? it : await client.item(it.Id));
        setToast(list.length === 1 ? t("Downloading “{name}”…", { name: list[0].Name }) : t("Downloading {n} episodes…", { n: list.length }));
        setTimeout(onDownloadsChanged, 4000);
      } catch (e) {
        setToast(String(e.message || e));
      }
    },
    [client, downloadedIds, setToast, t, onDownloadsChanged],
  );

  const open = useCallback(
    (item) => {
      if (!item) return;
      if (item.Type === "CollectionFolder" || item.Type === "UserView") {
        setStack([]);
        setTab(item.Id);
        return;
      }
      if (item.Type === "Photo") return setPhotos({ list: [item], start: 0 });
      if (item.Type === "Audio") return music.controls.play([item], 0);
      if (item.Type === "Season") return setStack((s) => [...s, { kind: "item", id: item.SeriesId, season: item.Id }]);
      if (["Folder", "BoxSet", "PhotoAlbum"].includes(item.Type) || (item.Type === "Playlist" && item.MediaType !== "Audio"))
        return setStack((s) => [...s, { kind: "folder", item }]);
      setStack((s) => [...s, { kind: "item", id: item.Id }]);
    },
    [music.controls],
  );

  // Y on a film / episode: mark watched or not.
  const onKey = useCallback(
    (e, item, alt) => {
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        e.stopPropagation();
        if (alt) return alt();
        if (!["Movie", "Episode", "Series", "Season", "Video", "MusicVideo"].includes(item.Type)) return;
        const on = !item.UserData?.Played;
        client.setPlayed(item.Id, on).then(() => {
          setToast(on ? t("Marked as watched") : t("Marked as unwatched"));
          refresh();
        });
      }
    },
    [client, refresh, setToast, t],
  );

  // Back: close the top page, then go to Home, then leave the app.
  const back = useCallback(() => {
    if (menu) return setMenu(false);
    if (stack.length) {
      setStack((s) => s.slice(0, -1));
      return;
    }
    if (tab !== "home") {
      setTab("home");
      return;
    }
    onClose();
  }, [stack.length, tab, onClose, menu]);
  // LB / RB (PageUp / PageDown): previous / next tab.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.key !== "PageUp" && e.key !== "PageDown") || document.querySelectorAll("[data-nav-scope]").length > 1) return;
      e.preventDefault();
      const tabs = ["home", ...views.map((v) => v.Id), ...(downloads?.length ? ["downloads"] : []), "search"];
      const i = Math.max(0, tabs.indexOf(tab));
      setStack([]);
      setTab(tabs[(i + (e.key === "PageDown" ? 1 : tabs.length - 1)) % tabs.length]);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [views, tab, downloads?.length]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!BACK.has(e.key) || e.defaultPrevented) return;
      // A dialog with its own Back handling is open.
      const scopes = document.querySelectorAll("[data-nav-scope]");
      if (scopes.length > 1) return;
      if (e.target?.tagName === "INPUT") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      back();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [back]);

  // Stack changes: put focus back on the page.
  const depth = stack.length;
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, [depth, tab]);
  // After a refresh the focused button can be replaced (Play -> Resume):
  // don't leave focus nowhere.
  useEffect(() => {
    const id = setInterval(() => {
      const a = document.activeElement;
      if ((!a || a === document.body || !a.isConnected) && document.querySelectorAll("[data-nav-scope]").length === 1) focusDefault();
    }, 400);
    return () => clearInterval(id);
  }, []);

  const top = stack[stack.length - 1];
  const currentView = views.find((v) => v.Id === tab);
  const common = { client, open, play: playback.play, music, setBackdrop, t, version, onKey, settings, onToast: setToast, onChanged: refresh, onDownload, downloadedIds };
  let page;
  if (top?.kind === "item") page = <DetailsView key={top.id} {...common} id={top.id} initialSeason={top.season} />;
  else if (top?.kind === "folder") page = <LibraryView key={top.item.Id} {...common} lib={top.item} />;
  else if (tab === "search") page = <SearchView {...common} />;
  else if (tab === "downloads")
    page = <DownloadsView downloads={downloads} onPlay={(d) => playDownload(d).catch((e) => setToast(String(e)))} onChanged={onDownloadsChanged} />;
  else if (currentView) page = <LibraryView key={currentView.Id} {...common} lib={currentView} />;
  else page = <HomeView {...common} views={views} />;

  return (
    <div className="relative h-full w-full">
      <Backdrop src={backdrop} dim={top ? 0.45 : 0.55} />
      <div className="relative z-10 flex h-full flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-[0.7rem] px-[4.5rem] pt-[1.8rem]">
          {top ? (
            <button
              data-nav
              onClick={back}
              className="flex items-center gap-[0.4rem] rounded-full bg-white/10 py-[0.55rem] pe-[1.2rem] ps-[0.8rem] text-[1.05rem] font-semibold text-white/85 focus:scale-[1.06] focus:bg-white focus:text-black"
            >
              <ChevronLeft className="h-[1.2rem] w-[1.2rem] rtl:rotate-180" /> {t("Back")}
            </button>
          ) : (
            <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-[0.6rem] overflow-x-auto py-[0.4rem]">
              <Pill active={tab === "home"} onClick={() => setTab("home")}>
                <span className="flex items-center gap-[0.45rem]">
                  <House className="h-[1.1rem] w-[1.1rem]" /> {t("Home")}
                </span>
              </Pill>
              {views.map((v) => (
                <Pill key={v.Id} active={tab === v.Id} onClick={() => setTab(v.Id)}>
                  {v.Name}
                </Pill>
              ))}
              {downloads?.length > 0 && (
                <Pill active={tab === "downloads"} onClick={() => setTab("downloads")}>
                  <span className="flex items-center gap-[0.45rem]">
                    <Download className="h-[1.1rem] w-[1.1rem]" /> {t("Downloads")}
                  </span>
                </Pill>
              )}
              <Pill active={tab === "search"} onClick={() => setTab("search")} aria-label={t("Search")}>
                <span className="flex items-center gap-[0.45rem]">
                  <Search className="h-[1.1rem] w-[1.1rem]" /> {t("Search")}
                </span>
              </Pill>
            </nav>
          )}
          <div className="ms-auto flex shrink-0 items-center gap-[1rem]">
            {sync.group && (
              <button data-nav onClick={() => setTogether(true)} className="flex items-center gap-[0.5rem] rounded-full bg-accent/20 px-[1rem] py-[0.45rem] text-[1rem] font-semibold text-accent focus:bg-white focus:text-black">
                <Users className="h-[1.1rem] w-[1.1rem]" /> {sync.group.GroupName}
              </button>
            )}
            <span className="text-[1.25rem] font-semibold tabular text-white/80">{timeLabel}</span>
            <button
              data-nav
              onClick={() => setMenu((m) => !m)}
              className="flex h-[2.8rem] w-[2.8rem] items-center justify-center rounded-full bg-accent text-[1.2rem] font-bold text-on-accent focus:scale-[1.12] focus:ring-[0.2rem] focus:ring-white"
              aria-label={auth.userName}
            >
              {auth.userName?.[0]?.toUpperCase() || "?"}
            </button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1">
          {viewsData.loading && !viewsData.data ? <Spinner className="mx-auto mt-[30vh]" /> : page}
        </div>
      </div>

      {menu && <UserMenu {...{ auth, t, signOut, onOpenWeb, onClose, onSwitchProfile, close: closeMenu }} onTogether={() => setTogether(true)} />}
      {together && <WatchTogether sync={sync} auth={auth} onClose={() => setTogether(false)} />}
      <NowPlaying client={client} music={music} t={t} />
      {playback.playing?.preview && <PreviewPlayer state={playback.playing} controls={playback.preview} t={t} />}
      {photos && <PhotoViewer client={client} photos={photos.list} start={photos.start} onClose={() => setPhotos(null)} />}
    </div>
  );
}

function UserMenu({ auth, t, signOut, onOpenWeb, onClose, onSwitchProfile, onTogether, close }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    const onKey = (e) => {
      if (BACK.has(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [close]);
  const item = "focus-row flex w-full items-center gap-[0.9rem] rounded-[0.8rem] px-[1.1rem] py-[0.85rem] text-start text-[1.1rem] font-semibold";
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[90]" onClick={close}>
      <div className="absolute end-[4.5rem] top-[5.4rem] w-[22rem] rounded-[1.3rem] bg-[#14161c]/95 p-[0.7rem] shadow-2xl ring-1 ring-white/10 backdrop-blur-xl fade-up">
        <div className="px-[1.1rem] pb-[0.6rem] pt-[0.5rem] text-[0.95rem] text-white/55">{t("Signed in as {name}", { name: auth.userName })}</div>
        <button data-nav data-nav-default className={item} onClick={() => { close(); onTogether(); }}>
          <Users className="h-[1.2rem] w-[1.2rem]" /> {t("Watch together")}
        </button>
        <button data-nav className={item} onClick={() => { close(); onSwitchProfile(); }}>
          <UserRoundCog className="h-[1.2rem] w-[1.2rem]" /> {t("Switch profile")}
        </button>
        <button data-nav className={item} onClick={onOpenWeb}>
          <Globe className="h-[1.2rem] w-[1.2rem]" /> {t("Open the web version")}
        </button>
        <button data-nav className={item} onClick={signOut}>
          <LogOut className="h-[1.2rem] w-[1.2rem]" /> {t("Sign out")}
        </button>
        <button data-nav className={item} onClick={onClose}>
          <X className="h-[1.2rem] w-[1.2rem]" /> {t("Close Jellyfin")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// Browser preview only: stands in for mpv so the flow can be tried.
function PreviewPlayer({ state, controls, t }) {
  useEffect(() => {
    const onKey = (e) => {
      const map = { Escape: controls.stop, Backspace: controls.stop, Enter: controls.ok, ArrowRight: () => controls.seek(10), ArrowLeft: () => controls.seek(-10), PageDown: controls.next };
      if (map[e.key]) {
        e.preventDefault();
        e.stopImmediatePropagation();
        map[e.key]();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [controls]);
  const it = state.item;
  return createPortal(
    <div data-nav-scope data-preview-player className="fixed inset-0 z-[99] flex flex-col items-center justify-center bg-black text-white">
      <div className="text-[1.2rem] text-white/50">{t("Preview player")}</div>
      <div className="mt-[0.6rem] text-[2rem] font-bold">{it.Type === "Episode" ? `${it.SeriesName} · ${it.Name}` : it.Name}</div>
      <div data-pos={Math.round(state.pos)} className="mt-[1rem] text-[1.6rem] tabular">
        {clock(state.pos)} / {clock(state.duration)}
      </div>
    </div>,
    document.body,
  );
}
