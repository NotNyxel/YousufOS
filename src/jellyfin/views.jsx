// Pages of the Jellyfin app. Every control is a [data-nav] element, so the
// remote / controller moves around with the arrows like the rest of YousufOS.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check, ChevronLeft, ChevronRight, Delete, Download, HardDriveDownload, Heart, Play, RotateCcw, Search as SearchIcon, Shuffle, Star, Subtitles, Tv,
} from "lucide-react";
import { focusDefault } from "../lib/nav";
import { isTauri, listen } from "../lib/platform";
import { TICKS, clock, episodeCode, progressOf, runtime } from "./api";
import { ActionButton, Art, Card, Pill, Row, Spinner } from "./ui";
import { cardShape, useData } from "./data";

// Which items a library lists, by its type.
const LIBRARY_KINDS = {
  movies: { types: "Movie", recursive: true, video: true },
  tvshows: { types: "Series", recursive: true, video: true },
  music: { types: "MusicAlbum", recursive: true },
  musicvideos: { types: "MusicVideo", recursive: true, video: true },
  books: { types: "Book", recursive: true },
  boxsets: { types: "BoxSet", recursive: true },
  playlists: { types: "Playlist", recursive: true },
  homevideos: { recursive: false, video: true },
  photos: { recursive: false },
};
const SHOW_IN_TABS = (v) => v.CollectionType !== "livetv";

function Meta({ item, t, extra }) {
  const parts = [];
  if (item.Type === "Episode") parts.push(episodeCode(item));
  if (item.ProductionYear) parts.push(item.ProductionYear);
  if (item.RunTimeTicks && item.Type !== "Series") parts.push(runtime(item.RunTimeTicks));
  if (item.Type === "Series" && item.ChildCount) parts.push(t(item.ChildCount === 1 ? "1 season" : "{n} seasons", { n: item.ChildCount }));
  return (
    <div className="flex flex-wrap items-center gap-x-[1rem] gap-y-[0.4rem] text-[1.1rem] font-semibold text-white/80">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
      {item.OfficialRating && <span className="rounded-[0.35rem] border border-white/40 px-[0.45rem] py-[0.05rem] text-[0.92rem]">{item.OfficialRating}</span>}
      {item.CommunityRating > 0 && (
        <span className="flex items-center gap-[0.3rem]">
          <Star className="h-[1.05rem] w-[1.05rem] fill-accent text-accent" />
          {item.CommunityRating.toFixed(1)}
        </span>
      )}
      {item.Genres?.length > 0 && <span className="text-white/60">{item.Genres.slice(0, 3).join(" · ")}</span>}
      {extra}
    </div>
  );
}

function endsAt(item, settings) {
  if (!item.RunTimeTicks) return null;
  const left = item.RunTimeTicks - (item.UserData?.PlaybackPositionTicks || 0);
  const d = new Date(Date.now() + left / 10000);
  return d.toLocaleTimeString(settings?.lang === "ar" ? "ar-AE" : "en-GB", { hour: "numeric", minute: "2-digit", hour12: !settings?.clock24 });
}

function Hero({ client, item, t, compact = false }) {
  if (!item) return <div className={compact ? "h-[30vh]" : "h-[40vh]"} />;
  const logo = client.image(item, "Logo", { height: 220 });
  const title = item.Type === "Episode" ? item.SeriesName : item.Name;
  return (
    <div key={item.Id} className={`flex flex-col justify-end px-[4.5rem] pb-[1.4rem] ${compact ? "h-[30vh]" : "h-[40vh]"}`} style={{ animation: "fade-up 260ms ease both" }}>
      {logo ? (
        <img src={logo} alt={title} className="mb-[0.9rem] max-h-[7rem] max-w-[30rem] object-contain object-left rtl:object-right" />
      ) : (
        <h1 dir="auto" className="mb-[0.5rem] line-clamp-2 max-w-[48rem] text-[3.1rem] font-extrabold leading-[1.05] tracking-tight">{title}</h1>
      )}
      {item.Type === "Episode" && <div className="mb-[0.4rem] text-[1.3rem] font-semibold text-white/85">{item.Name}</div>}
      <Meta item={item} t={t} />
      {item.Overview && <p dir="auto" className="mt-[0.7rem] line-clamp-2 max-w-[52rem] text-[1.12rem] leading-relaxed text-white/70">{item.Overview}</p>}
    </div>
  );
}

// ================================================================ Home
export function HomeView({ client, views, open, play, setBackdrop, t, version, onKey }) {
  const resume = useData(client, `resume:${version}`, () => client.resume(), [version]);
  const nextUp = useData(client, `nextup:${version}`, () => client.nextUp(), [version]);
  const latestFor = views.filter((v) => ["movies", "tvshows", "music", "musicvideos", "homevideos", "books"].includes(v.CollectionType));
  const latest = useData(
    client,
    `latest:${version}:${latestFor.map((v) => v.Id).join(",")}`,
    () => Promise.all(latestFor.map((v) => client.latest(v.Id).catch(() => []))),
    [version, latestFor.length],
  );
  const [focused, setFocused] = useState(null);
  const firstItem = resume.data?.[0] || nextUp.data?.[0] || latest.data?.find((l) => l.length)?.[0];
  const hero = focused || firstItem;
  useEffect(() => {
    if (hero) setBackdrop(client.image(hero, "Backdrop", { width: 1920 }) || client.image(hero, "Backdrop", { width: 1920, fromSeries: true }));
  }, [hero, client, setBackdrop]);

  const loading = resume.loading && nextUp.loading && latest.loading;
  useEffect(() => {
    if (!loading) requestAnimationFrame(() => focusDefault());
  }, [loading]);

  const onFocusItem = (it) => setFocused(it.Type === "CollectionFolder" ? null : it);
  const openOrPlay = (it) => (it.Type === "Episode" || (it.Type === "Movie" && progressOf(it) > 0) ? play([it], 0, { resume: true }) : open(it));
  const empty = !loading && !resume.data?.length && !nextUp.data?.length && !latest.data?.some((l) => l.length);
  let first = true;
  const isFirst = () => {
    const f = first;
    first = false;
    return f;
  };
  return (
    <div className="flex h-full flex-col">
      <Hero client={client} item={hero} t={t} />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-[6rem]">
        {loading && <Spinner className="mx-auto mt-[4rem]" />}
        {empty && <div className="px-[4.5rem] pt-[2rem] text-[1.3rem] text-white/60">{t("Nothing here yet. Add some films or shows to your Jellyfin server and they'll show up here.")}</div>}
        <Row title={t("Continue watching")} items={resume.data} client={client} shape="wide" wideImage onOpen={openOrPlay} onFocusItem={onFocusItem} onKey={onKey} firstDefault={resume.data?.length > 0 && isFirst()} />
        <Row title={t("Next up")} items={nextUp.data} client={client} shape="wide" onOpen={openOrPlay} onFocusItem={onFocusItem} onKey={onKey} firstDefault={nextUp.data?.length > 0 && isFirst()} />
        <Row title={t("My media")} items={views.filter(SHOW_IN_TABS)} client={client} shape="wide" onOpen={open} onFocusItem={onFocusItem} firstDefault={!resume.data?.length && !nextUp.data?.length && isFirst()} />
        {latestFor.map((v, i) => (
          <Row
            key={v.Id}
            title={t("Recently added in {library}", { library: v.Name })}
            items={latest.data?.[i]}
            client={client}
            shape={v.CollectionType === "music" ? "square" : undefined}
            onOpen={open}
            onFocusItem={onFocusItem}
            onKey={onKey}
          />
        ))}
      </div>
    </div>
  );
}

// ================================================================ Library
const SORTS = [
  { id: "name", label: "A–Z", sortBy: "SortName", sortOrder: "Ascending" },
  { id: "added", label: "Recently added", sortBy: "DateCreated,SortName", sortOrder: "Descending" },
  { id: "year", label: "Year", sortBy: "ProductionYear,PremiereDate,SortName", sortOrder: "Descending" },
  { id: "rating", label: "Rating", sortBy: "CommunityRating,SortName", sortOrder: "Descending" },
];
const PAGE = 60;

export function LibraryView({ client, lib, open, play, setBackdrop, t, version, onKey, music }) {
  const kind = LIBRARY_KINDS[lib.CollectionType] || { recursive: false };
  const isFolder = lib.Type !== "CollectionFolder" && lib.Type !== "UserView";
  const [sort, setSort] = useState(kind.recursive ? "name" : "name");
  const [filter, setFilter] = useState("all");
  const [list, setList] = useState({ key: null, items: [], total: null });
  const loadingMore = useRef(false);
  const s = SORTS.find((x) => x.id === sort);

  const query = useMemo(
    () => ({
      parentId: lib.Id,
      includeItemTypes: isFolder ? undefined : kind.types,
      recursive: isFolder ? false : kind.recursive,
      sortBy: s.sortBy,
      sortOrder: s.sortOrder,
      isPlayed: filter === "unwatched" ? false : undefined,
      isFavorite: filter === "favorites" ? true : undefined,
      enableImageTypes: "Primary,Backdrop,Thumb",
      imageTypeLimit: 1,
    }),
    [lib.Id, isFolder, kind.types, kind.recursive, s, filter],
  );

  const listKey = `${JSON.stringify(query)}:${version}`;
  const loading = list.key !== listKey;
  const { items, total } = loading ? { items: [], total: null } : list;
  useEffect(() => {
    let alive = true;
    client
      .items({ ...query, startIndex: 0, limit: PAGE })
      .then(
        (r) => alive && setList({ key: listKey, items: r?.Items || [], total: r?.TotalRecordCount ?? r?.Items?.length ?? 0 }),
        () => alive && setList({ key: listKey, items: [], total: 0 }),
      );
    return () => {
      alive = false;
    };
  }, [client, query, listKey]);

  const more = () => {
    if (loading || loadingMore.current || total == null || items.length >= total) return;
    loadingMore.current = true;
    client
      .items({ ...query, startIndex: items.length, limit: PAGE })
      .then((r) => setList((cur) => (cur.key === listKey ? { ...cur, items: [...cur.items, ...(r?.Items || [])] } : cur)))
      .finally(() => (loadingMore.current = false));
  };

  const shape = items[0] ? cardShape(items[0]) : lib.CollectionType === "music" ? "square" : "poster";
  const cols = shape === "poster" ? 7 : shape === "square" ? 6 : 4;
  const onFocusItem = (it) => {
    setBackdrop(client.image(it, "Backdrop", { width: 1920 }) || client.image(it, "Backdrop", { width: 1920, fromSeries: true }));
    const idx = items.findIndex((x) => x.Id === it.Id);
    if (idx >= items.length - cols * 3) more();
  };
  useEffect(() => {
    if (!loading) requestAnimationFrame(() => focusDefault());
  }, [loading]);

  const shuffle = async () => {
    const r = await client.items({ parentId: lib.Id, includeItemTypes: lib.CollectionType === "music" ? "Audio" : kind.video ? "Movie,Episode,Video,MusicVideo" : undefined, recursive: true, sortBy: "Random", limit: 100 });
    const list = r?.Items || [];
    if (!list.length) return;
    if (list[0].MediaType === "Audio") music.controls.play(list, 0);
    else play(list, 0);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-[4.5rem] pb-[1rem] pt-[1rem]">
        <div className="flex items-baseline gap-[1rem]">
          <h1 dir="auto" className="text-[2.6rem] font-extrabold tracking-tight">{lib.Name}</h1>
          {total != null && <span className="text-[1.15rem] font-semibold text-white/50">{t(total === 1 ? "1 item" : "{n} items", { n: total })}</span>}
        </div>
        <div className="mt-[1rem] flex flex-wrap items-center gap-[0.7rem]">
          {SORTS.map((x) => (
            <Pill key={x.id} active={sort === x.id} onClick={() => setSort(x.id)}>
              {t(x.label)}
            </Pill>
          ))}
          {kind.video && !isFolder && (
            <>
              <span className="mx-[0.4rem] h-[1.6rem] w-px bg-white/20" />
              {[
                ["all", "All"],
                ["unwatched", "Unwatched"],
                ["favorites", "Favourites"],
              ].map(([id, label]) => (
                <Pill key={id} active={filter === id} onClick={() => setFilter(id)}>
                  {t(label)}
                </Pill>
              ))}
            </>
          )}
          {(kind.video || lib.CollectionType === "music") && !isFolder && (
            <Pill onClick={shuffle}>
              <span className="flex items-center gap-[0.45rem]">
                <Shuffle className="h-[1.05rem] w-[1.05rem]" /> {t("Shuffle")}
              </span>
            </Pill>
          )}
        </div>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-[4.5rem] pb-[6rem] pt-[0.8rem]">
        {loading ? (
          <Spinner className="mx-auto mt-[4rem]" />
        ) : !items.length ? (
          <div className="pt-[2rem] text-[1.3rem] text-white/60">{filter === "all" ? t("This library is empty.") : t("Nothing matches this filter.")}</div>
        ) : (
          <div className="grid gap-x-[1.3rem] gap-y-[1.6rem]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {items.map((it, i) => (
              <Card key={it.Id} client={client} item={it} shape={shape} fluid isDefault={i === 0} onOpen={open} onFocusItem={onFocusItem} onKey={onKey} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================ Details
export function DetailsView({ client, id, open, play, music, setBackdrop, t, version, onKey, settings, initialSeason, onToast, onChanged, onDownload, downloadedIds }) {
  const { data: item, error } = useData(client, `item:${id}:${version}`, () => client.item(id), [id, version]);
  useEffect(() => {
    if (!item) return;
    const cover = client.image(item, "Primary", { height: 600 });
    setBackdrop(
      client.image(item, "Backdrop", { width: 1920 }) ||
        client.image(item, "Backdrop", { width: 1920, fromSeries: true }) ||
        (cover && ["MusicAlbum", "MusicArtist", "Playlist"].includes(item.Type) ? "blur:" + cover : null),
    );
  }, [item, client, setBackdrop]);

  if (error) return <div className="flex h-full items-center justify-center text-[1.3rem] text-white/60">{t("Couldn't load this item.")}</div>;
  if (!item) return <Spinner className="mx-auto mt-[30vh]" />;
  if (item.Type === "Series") return <SeriesDetails {...{ client, item, play, t, version, onKey, initialSeason, onChanged, open, onDownload }} />;
  if (item.Type === "MusicAlbum" || item.Type === "Playlist") return <AlbumDetails {...{ client, item, music, play, t, open }} />;
  if (item.Type === "MusicArtist") return <ArtistDetails {...{ client, item, music, open, t, onKey }} />;
  return <VideoDetails {...{ client, item, play, t, onKey, settings, open, onToast, onChanged, onDownload, downloadedIds }} />;
}

function useToggles(client, item, onChanged) {
  // Shown at once; the item reloads with the server's answer.
  const [over, setOver] = useState({ item: null });
  const mine = over.item === item;
  const fav = mine && over.fav !== undefined ? over.fav : !!item.UserData?.IsFavorite;
  const played = mine && over.played !== undefined ? over.played : !!item.UserData?.Played;
  const setFav = (x) => setOver((o) => ({ ...(o.item === item ? o : {}), item, fav: x }));
  const setPlayed = (x) => setOver((o) => ({ ...(o.item === item ? o : {}), item, played: x }));
  return {
    fav,
    played,
    toggleFav: () => {
      setFav(!fav);
      client.setFavorite(item.Id, !fav).then(onChanged, () => setFav(fav));
    },
    togglePlayed: () => {
      setPlayed(!played);
      client.setPlayed(item.Id, !played).then(onChanged, () => setPlayed(played));
    },
  };
}

function VideoDetails({ client, item, play, t, onKey, settings, open, onToast, onChanged, onDownload, downloadedIds }) {
  const { fav, played, toggleFav, togglePlayed } = useToggles(client, item, onChanged);
  const [tracks, setTracks] = useState(null); // { audio, subtitle } chosen in the picker
  const [picker, setPicker] = useState(false);
  const similar = useData(client, `similar:${item.Id}`, () => (item.Type === "Episode" ? client.episodes(item.SeriesId, item.SeasonId) : client.similar(item.Id)), [item.Id]);
  const progress = progressOf(item);
  const streams = item.MediaStreams || item.MediaSources?.[0]?.MediaStreams || [];
  const hasChoices = streams.filter((s) => s.Type === "Audio").length > 1 || streams.some((s) => s.Type === "Subtitle");
  const pos = (item.UserData?.PlaybackPositionTicks || 0) / TICKS;
  const opts = { audio: tracks?.audio, subtitle: tracks?.subtitle };
  const start = (resume) => {
    if (item.Type === "Episode" && similar.data?.length) {
      // Play on through the rest of the season.
      const i = similar.data.findIndex((e) => e.Id === item.Id);
      if (i >= 0) return play(similar.data.map((e) => (e.Id === item.Id ? item : e)), i, { ...opts, resume });
    }
    play([item], 0, { ...opts, resume });
  };
  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, [item.Id]);
  if (item.Type === "Book" || item.Type === "Photo")
    return (
      <div className="flex h-full flex-col justify-end px-[4.5rem] pb-[5rem]">
        <h1 dir="auto" className="text-[3rem] font-extrabold">{item.Name}</h1>
        <p dir="auto" className="mt-[0.8rem] text-[1.2rem] text-white/65">{t("Books open in Jellyfin's web app. Press Y on the Jellyfin tile to open it.")}</p>
      </div>
    );
  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div className="flex min-h-[64vh] flex-col justify-end px-[4.5rem] pb-[1.6rem]">
        {item.Type === "Episode" && (
          <button data-nav onClick={() => open({ Id: item.SeriesId, Type: "Series" })} className="mb-[0.6rem] flex w-fit items-center gap-[0.4rem] rounded-full px-[0.2rem] text-[1.25rem] font-bold text-white/80 focus:bg-white focus:px-[0.9rem] focus:text-black">
            <Tv className="h-[1.2rem] w-[1.2rem]" /> {item.SeriesName}
          </button>
        )}
        <h1 dir="auto" className="line-clamp-2 max-w-[56rem] text-[3.3rem] font-extrabold leading-[1.05] tracking-tight">{item.Name}</h1>
        <div className="mt-[0.9rem]">
          <Meta item={item} t={t} extra={item.RunTimeTicks ? <span className="text-white/55">{t("Ends at {time}", { time: endsAt(item, settings) })}</span> : null} />
        </div>
        {item.Taglines?.[0] && <div className="mt-[0.8rem] text-[1.2rem] font-semibold italic text-white/75">{item.Taglines[0]}</div>}
        {item.Overview && <p dir="auto" className="mt-[0.7rem] line-clamp-4 max-w-[60rem] text-[1.15rem] leading-relaxed text-white/72">{item.Overview}</p>}
        {progress > 0 && progress < 100 && (
          <div className="mt-[1rem] flex max-w-[28rem] items-center gap-[0.8rem] text-[0.98rem] font-semibold text-white/70">
            <div className="h-[0.32rem] flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            {t("{time} left", { time: runtime(item.RunTimeTicks - item.UserData.PlaybackPositionTicks) })}
          </div>
        )}
        <div className="mt-[1.4rem] flex flex-wrap gap-[0.9rem]">
          {progress > 0 && progress < 100 ? (
            <>
              <ActionButton Icon={Play} filled primary isDefault onClick={() => start(true)}>
                {t("Resume from {time}", { time: clock(pos) })}
              </ActionButton>
              <ActionButton Icon={RotateCcw} onClick={() => start(false)}>
                {t("From the start")}
              </ActionButton>
            </>
          ) : (
            <ActionButton Icon={Play} filled primary isDefault onClick={() => start(false)}>
              {t("Play")}
            </ActionButton>
          )}
          {hasChoices && (
            <ActionButton Icon={Subtitles} onClick={() => setPicker(true)}>
              {t("Audio & subtitles")}
            </ActionButton>
          )}
          <ActionButton Icon={Check} onClick={togglePlayed} title={played ? t("Mark as unwatched") : t("Mark as watched")}>
            {played ? t("Watched") : t("Mark watched")}
          </ActionButton>
          <ActionButton Icon={Heart} filled={fav} onClick={toggleFav} title={t("Favourite")} />
          {isTauri() && (item.Type === "Movie" || item.Type === "Episode" || item.Type === "Video") && (
            <ActionButton Icon={downloadedIds?.has(item.Id) ? HardDriveDownload : Download} onClick={() => onDownload(item)}>
              {downloadedIds?.has(item.Id) ? t("On this TV") : t("Download")}
            </ActionButton>
          )}
        </div>
      </div>
      <div className="pb-[5rem]">
        <Row
          title={item.Type === "Episode" ? t("More from {season}", { season: item.SeasonName || t("this season") }) : t("More like this")}
          items={similar.data?.filter((x) => x.Id !== item.Id)}
          client={client}
          shape={item.Type === "Episode" ? "wide" : undefined}
          onOpen={open}
          onKey={onKey}
        />
      </div>
      {picker && (
        <TrackPicker
          item={item}
          t={t}
          value={tracks}
          onClose={() => setPicker(false)}
          onPick={(v) => {
            setTracks(v);
            setPicker(false);
            onToast?.(t("Your choice is used when you press Play."));
          }}
        />
      )}
    </div>
  );
}

function SeriesDetails({ client, item, play, t, version, onKey, initialSeason, onChanged, open, onDownload }) {
  const { fav, played, toggleFav, togglePlayed } = useToggles(client, item, onChanged);
  const seasons = useData(client, `seasons:${item.Id}:${version}`, () => client.seasons(item.Id), [item.Id, version]);
  const next = useData(client, `nextup-series:${item.Id}:${version}`, () => client.nextUp(1, item.Id), [item.Id, version]);
  const [season, setSeason] = useState(initialSeason || null);
  const seasonId = season || next.data?.[0]?.SeasonId || seasons.data?.[0]?.Id;
  const episodes = useData(client, seasonId ? `episodes:${seasonId}:${version}` : null, () => client.episodes(item.Id, seasonId), [seasonId, version]);
  const nextEp = next.data?.[0];
  const firstEp = !nextEp ? episodes.data?.[0] : null;
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!focusedOnce.current && (next.data || next.error)) {
      focusedOnce.current = true;
      requestAnimationFrame(() => focusDefault());
    }
  }, [next.data, next.error]);

  const playEpisode = (ep) => {
    const list = episodes.data || [ep];
    const i = list.findIndex((e) => e.Id === ep.Id);
    play(list, Math.max(0, i), { resume: progressOf(ep) > 0 });
  };
  const playNext = async () => {
    const ep = nextEp || firstEp;
    if (!ep) return;
    const list = ep.SeasonId === seasonId && episodes.data ? episodes.data : await client.episodes(item.Id, ep.SeasonId);
    const i = list.findIndex((e) => e.Id === ep.Id);
    play(list, Math.max(0, i), { resume: progressOf(ep) > 0 });
  };
  return (
    <div className="no-scrollbar h-full overflow-y-auto">
      <div className="flex min-h-[54vh] flex-col justify-end px-[4.5rem] pb-[1.2rem]">
        {client.image(item, "Logo", { height: 220 }) ? (
          <img src={client.image(item, "Logo", { height: 220 })} alt={item.Name} className="mb-[1rem] max-h-[8rem] max-w-[32rem] object-contain object-left rtl:object-right" />
        ) : (
          <h1 dir="auto" className="text-[3.3rem] font-extrabold leading-[1.05] tracking-tight">{item.Name}</h1>
        )}
        <div className="mt-[0.9rem]">
          <Meta item={item} t={t} />
        </div>
        {item.Overview && <p dir="auto" className="mt-[0.7rem] line-clamp-3 max-w-[60rem] text-[1.15rem] leading-relaxed text-white/72">{item.Overview}</p>}
        <div className="mt-[1.4rem] flex flex-wrap gap-[0.9rem]">
          <ActionButton Icon={Play} filled primary isDefault onClick={playNext}>
            {nextEp
              ? progressOf(nextEp) > 0
                ? t("Resume {episode}", { episode: episodeCode(nextEp) })
                : t("Play {episode}", { episode: episodeCode(nextEp) })
              : t("Play")}
          </ActionButton>
          <ActionButton Icon={Check} onClick={togglePlayed}>
            {played ? t("Watched") : t("Mark watched")}
          </ActionButton>
          <ActionButton Icon={Heart} filled={fav} onClick={toggleFav} title={t("Favourite")} />
          {isTauri() && episodes.data?.length > 0 && (
            <ActionButton Icon={Download} onClick={() => onDownload(episodes.data)}>
              {t("Download this season")}
            </ActionButton>
          )}
        </div>
      </div>
      <div className="no-scrollbar flex gap-[0.7rem] overflow-x-auto px-[4.5rem] pb-[0.4rem] pt-[0.4rem]">
        {seasons.data?.map((s) => (
          <Pill key={s.Id} active={s.Id === seasonId} onClick={() => setSeason(s.Id)} onFocus={() => setSeason(s.Id)}>
            <span className="flex items-center gap-[0.55rem]">
              <span dir="auto">{s.Name}</span>
              {s.UserData?.UnplayedItemCount > 0 && <span className="text-[0.9rem] text-accent">{s.UserData.UnplayedItemCount}</span>}
            </span>
          </Pill>
        ))}
      </div>
      <div className="pb-[5rem] pt-[1rem]">
        {episodes.loading && !episodes.data ? (
          <Spinner className="ms-[4.5rem]" />
        ) : (
          <div className="no-scrollbar flex gap-[1.3rem] overflow-x-auto px-[4.5rem] pb-[1.4rem] pt-[0.6rem]">
            {episodes.data?.map((ep) => (
              <div key={ep.Id} className="w-[24rem] shrink-0">
                <Card client={client} item={ep} shape="wide" fluid label={`${ep.IndexNumber}. ${ep.Name}`} sub={runtime(ep.RunTimeTicks)} onOpen={playEpisode} onKey={(e) => onKey(e, ep, () => open(ep))} />
                {ep.Overview && <p dir="auto" className="mt-[0.6rem] line-clamp-2 px-[0.2rem] text-[0.95rem] leading-snug text-white/55">{ep.Overview}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlbumDetails({ client, item, music, t }) {
  const tracks = useData(client, `tracks:${item.Id}`, () =>
    client.items({ parentId: item.Id, sortBy: item.Type === "Playlist" ? undefined : "ParentIndexNumber,IndexNumber,SortName", includeItemTypes: "Audio", recursive: true }).then((r) => r?.Items || []),
  [item.Id]);
  useEffect(() => {
    if (tracks.data) requestAnimationFrame(() => focusDefault());
  }, [tracks.data]);
  const list = tracks.data || [];
  return (
    <div className="flex h-full gap-[3.5rem] px-[4.5rem] pb-[3rem] pt-[2rem]">
      <div className="w-[26rem] shrink-0">
        <Art src={client.image(item, "Primary", { height: 600 })} item={item} className="aspect-square w-full rounded-[1.4rem] shadow-2xl" eager />
        <h1 dir="auto" className="mt-[1.4rem] text-[2.2rem] font-extrabold leading-tight">{item.Name}</h1>
        <div className="mt-[0.3rem] text-[1.15rem] text-white/65">{[item.AlbumArtist, item.ProductionYear].filter(Boolean).join(" · ")}</div>
        <div className="mt-[1.3rem] flex gap-[0.8rem]">
          <ActionButton Icon={Play} filled primary isDefault onClick={() => list.length && music.controls.play(list, 0)}>
            {t("Play")}
          </ActionButton>
          <ActionButton Icon={Shuffle} onClick={() => list.length && music.controls.play([...list].sort(() => Math.random() - 0.5), 0)}>
            {t("Shuffle")}
          </ActionButton>
        </div>
      </div>
      <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto pb-[6rem]">
        {tracks.loading && !tracks.data && <Spinner />}
        {list.map((tr, i) => {
          const active = music.current?.Id === tr.Id;
          return (
            <button
              key={tr.Id}
              data-nav
              onClick={() => music.controls.play(list, i)}
              className={`focus-row flex w-full items-center gap-[1.2rem] rounded-[0.9rem] px-[1.2rem] py-[0.9rem] text-start ${active ? "text-accent" : ""}`}
            >
              <span className="w-[2rem] text-end text-[1.05rem] tabular text-white/45 dim-on-focus">{tr.IndexNumber || i + 1}</span>
              <span dir="auto" className="min-w-0 flex-1 truncate text-start text-[1.15rem] font-semibold">{tr.Name}</span>
              <span className="text-[1rem] tabular text-white/45 dim-on-focus">{clock((tr.RunTimeTicks || 0) / TICKS)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ArtistDetails({ client, item, open, t, onKey }) {
  const albums = useData(client, `artist:${item.Id}`, () =>
    client.items({ artistIds: item.Id, includeItemTypes: "MusicAlbum", recursive: true, sortBy: "ProductionYear,SortName", sortOrder: "Descending" }).then((r) => r?.Items || []),
  [item.Id]);
  useEffect(() => {
    if (albums.data) requestAnimationFrame(() => focusDefault());
  }, [albums.data]);
  return (
    <div className="flex h-full flex-col pt-[2rem]">
      <h1 dir="auto" className="px-[4.5rem] text-[2.8rem] font-extrabold">{item.Name}</h1>
      <div className="mt-[1.4rem]">
        <Row title={t("Albums")} items={albums.data} client={client} shape="square" onOpen={open} onKey={onKey} firstDefault />
      </div>
    </div>
  );
}

// ================================================================ Track picker
function TrackPicker({ item, t, value, onPick, onClose }) {
  const streams = item.MediaStreams || item.MediaSources?.[0]?.MediaStreams || [];
  const audio = streams.filter((s) => s.Type === "Audio");
  const subs = streams.filter((s) => s.Type === "Subtitle");
  const defAudio = item.MediaSources?.[0]?.DefaultAudioStreamIndex ?? audio.find((a) => a.IsDefault)?.Index ?? audio[0]?.Index;
  const [a, setA] = useState(value?.audio ?? defAudio);
  const [s, setS] = useState(value?.subtitle ?? -1);
  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    const onKey = (e) => {
      if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  const opt = (selected, label, onClick, isDefault) => (
    <button key={label} data-nav data-nav-default={isDefault || undefined} onClick={onClick} className="focus-row flex w-full items-center gap-[0.9rem] rounded-[0.8rem] px-[1rem] py-[0.75rem] text-start text-[1.1rem]">
      <span className={`flex h-[1.4rem] w-[1.4rem] items-center justify-center rounded-full border-2 ${selected ? "border-accent bg-accent" : "border-white/40"}`}>
        {selected && <Check className="h-[0.9rem] w-[0.9rem] text-on-accent" strokeWidth={3.5} />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 fade-up">
      <div className="w-[58rem] rounded-[1.8rem] bg-[#14161c] p-[2rem] shadow-2xl ring-1 ring-white/10">
        <div className="text-[1.6rem] font-bold">{t("Audio & subtitles")}</div>
        <div className="mt-[1.2rem] grid grid-cols-2 gap-[1.6rem]">
          <div>
            <div className="mb-[0.5rem] text-[1rem] font-bold uppercase tracking-wider text-white/50">{t("Audio")}</div>
            <div className="max-h-[22rem] space-y-[0.2rem] overflow-y-auto">
              {audio.map((x) => opt(a === x.Index, x.DisplayTitle || x.Language || `#${x.Index}`, () => setA(x.Index), a === x.Index))}
            </div>
          </div>
          <div>
            <div className="mb-[0.5rem] text-[1rem] font-bold uppercase tracking-wider text-white/50">{t("Subtitles")}</div>
            <div className="max-h-[22rem] space-y-[0.2rem] overflow-y-auto">
              {opt(s === -1, t("Off"), () => setS(-1))}
              {subs.map((x) => opt(s === x.Index, x.DisplayTitle || x.Language || `#${x.Index}`, () => setS(x.Index)))}
            </div>
          </div>
        </div>
        <div className="mt-[1.4rem] flex justify-end gap-[0.8rem]">
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton primary onClick={() => onPick({ audio: a, subtitle: s })}>
            {t("Done")}
          </ActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ================================================================ Search
const KEYS = "abcdefghijklmnopqrstuvwxyz1234567890";
export function SearchView({ client, open, t, onKey, setBackdrop }) {
  const [text, setText] = useState("");
  const [found, setFound] = useState({ q: null, items: [] });
  const q = text.trim();
  const busy = q.length >= 2 && found.q !== q;
  const results = q.length < 2 ? null : found.q === q ? found.items : null;
  useEffect(() => {
    setBackdrop(null);
    requestAnimationFrame(() => focusDefault());
  }, [setBackdrop]);
  useEffect(() => {
    if (q.length < 2) return;
    const id = setTimeout(() => {
      client
        .items({ searchTerm: q, recursive: true, includeItemTypes: "Movie,Series,Episode,MusicAlbum,MusicArtist,Audio,MusicVideo,Video,BoxSet,Book", limit: 60 })
        .then(
          (r) => setFound({ q, items: r?.Items || [] }),
          () => setFound({ q, items: [] }),
        );
    }, 320);
    return () => clearTimeout(id);
  }, [q, client]);
  // A real keyboard types straight into the search.
  useEffect(() => {
    const onType = (e) => {
      if (!e.isTrusted || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setText((v) => v + e.key);
      }
    };
    window.addEventListener("keydown", onType, true);
    const off = listen("remote-text", (txt) => setText((v) => v + txt));
    return () => {
      window.removeEventListener("keydown", onType, true);
      off.then((f) => f());
    };
  }, []);

  const groups = [
    ["Films", (i) => i.Type === "Movie"],
    ["Shows", (i) => i.Type === "Series"],
    ["Episodes", (i) => i.Type === "Episode"],
    ["Music", (i) => ["MusicAlbum", "MusicArtist", "Audio"].includes(i.Type)],
    ["Other", (i) => !["Movie", "Series", "Episode", "MusicAlbum", "MusicArtist", "Audio"].includes(i.Type)],
  ];
  const k = "flex h-[3.1rem] items-center justify-center rounded-[0.7rem] bg-white/[0.08] text-[1.2rem] font-semibold uppercase focus:scale-[1.1] focus:bg-white focus:text-black";
  return (
    <div className="flex h-full gap-[2.5rem] ps-[4.5rem] pt-[1rem]">
      <div className="w-[25rem] shrink-0" dir="ltr">
        <div className="flex h-[3.8rem] items-center gap-[0.8rem] rounded-[1rem] bg-white/[0.08] px-[1.2rem] text-[1.4rem] ring-1 ring-white/10">
          <SearchIcon className="h-[1.4rem] w-[1.4rem] text-white/50" />
          <span className="truncate">{text || <span className="text-white/35">{t("Search films, shows, music")}</span>}</span>
          <span className="h-[1.6rem] w-[0.12rem] animate-pulse bg-accent" />
        </div>
        <div className="mt-[1rem] grid grid-cols-6 gap-[0.45rem]">
          {[...KEYS].map((ch, i) => (
            <button key={ch} data-nav data-nav-default={i === 0 || undefined} className={k} onClick={() => setText((v) => v + ch)}>
              {ch}
            </button>
          ))}
          <button data-nav className={`${k} col-span-3 normal-case text-[1rem]`} onClick={() => setText((v) => v + " ")}>
            {t("Space")}
          </button>
          <button data-nav className={`${k} col-span-2`} onClick={() => setText((v) => v.slice(0, -1))} aria-label={t("Delete")}>
            <Delete className="h-[1.4rem] w-[1.4rem]" />
          </button>
          <button data-nav className={`${k} normal-case text-[0.95rem]`} onClick={() => setText("")}>
            {t("Clear")}
          </button>
        </div>
      </div>
      <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto pb-[6rem]">
        {busy && <Spinner className="ms-[1rem]" />}
        {!busy && results && !results.length && <div className="text-[1.3rem] text-white/60">{t("No results for “{q}”", { q })}</div>}
        {!results && !busy && <div className="pt-[1rem] text-[1.2rem] text-white/45">{t("Type at least two letters.")}</div>}
        {results &&
          groups.map(([label, fn]) => {
            const items = results.filter(fn);
            if (!items.length) return null;
            return (
              <div key={label} className="-ms-[4.5rem]">
                <Row title={t(label)} items={items} client={client} onOpen={open} onKey={onKey} shape={label === "Episodes" ? "wide" : undefined} />
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ================================================================ Photos
export function PhotoViewer({ client, photos, start, onClose }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const onKey = (e) => {
      if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) onClose();
      else if (e.key === "ArrowRight") setI((x) => Math.min(photos.length - 1, x + 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [photos.length, onClose]);
  const p = photos[i];
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[96] flex items-center justify-center bg-black" dir="ltr">
      <Art key={p.Id} src={client.image(p, "Primary", { height: 2160 })} item={p} fit="contain" className="absolute inset-0 bg-black" eager />
      <div className="absolute bottom-[2rem] left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-[1.4rem] py-[0.5rem] text-[1.05rem]">
        <ChevronLeft className="inline h-[1.1rem] w-[1.1rem]" /> {i + 1} / {photos.length} <ChevronRight className="inline h-[1.1rem] w-[1.1rem]" />
      </div>
    </div>,
    document.body,
  );
}

