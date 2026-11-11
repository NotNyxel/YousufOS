// Building blocks of the Jellyfin app: cards, rows, buttons, the backdrop.
import { memo, useEffect, useRef, useState } from "react";
import { cardShape } from "./data";
import { Check, Film, Folder, Music, Tv, Image as ImageIcon, BookOpen, Heart } from "lucide-react";
import { episodeCode, progressOf } from "./api";

// ---------------------------------------------------------------- images
// Fades in; a soft placeholder with an icon while loading or when missing.
const ICONS = { Movie: Film, Series: Tv, Season: Tv, Episode: Tv, MusicAlbum: Music, Audio: Music, MusicArtist: Music, Photo: ImageIcon, PhotoAlbum: ImageIcon, Book: BookOpen, Folder, CollectionFolder: Folder, BoxSet: Folder, Playlist: Music };
export const Art = memo(function Art({ src, item, className = "", fit = "cover", eager = false }) {
  const [ok, setOk] = useState(false);
  const [failed, setFailed] = useState(false);
  const Icon = ICONS[item?.Type] || Film;
  return (
    <div className={`${/\babsolute\b/.test(className) ? "" : "relative"} overflow-hidden bg-[linear-gradient(135deg,rgb(255_255_255/0.09),rgb(255_255_255/0.03))] ${className}`}>
      {(!src || failed || !ok) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[0.5rem] p-[0.8rem] text-center text-white/35">
          <Icon className="h-[2.2rem] w-[2.2rem]" />
          {(!src || failed) && item?.Name && <div className="line-clamp-2 text-[0.95rem] font-semibold text-white/55">{item.Name}</div>}
        </div>
      )}
      {src && !failed && (
        <img
          src={src}
          alt=""
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setOk(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${fit === "contain" ? "object-contain" : "object-cover"} ${ok ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
});

// ---------------------------------------------------------------- cards
const SIZES = {
  poster: "w-[12.2rem] aspect-[2/3]",
  wide: "w-[22rem] aspect-video",
  square: "w-[14.5rem] aspect-square",
};

export function Card({ client, item, shape, onOpen, onFocusItem, onKey, isDefault, fluid = false, sub, label, wideImage }) {
  const s = shape || cardShape(item);
  const progress = progressOf(item);
  const played = item.UserData?.Played;
  const unplayed = item.UserData?.UnplayedItemCount;
  const h = s === "poster" ? 420 : s === "wide" ? 360 : 340;
  let src;
  if (s === "wide") {
    src = wideImage
      ? client.image(item, "Backdrop", { width: 720 }) || client.image(item, "Primary", { width: 720 })
      : item.Type === "Episode"
        ? client.image(item, "Primary", { width: 720 }) || client.image(item, "Backdrop", { width: 720 })
        : client.image(item, "Thumb", { width: 720 }) || client.image(item, "Backdrop", { width: 720 }) || client.image(item, "Primary", { width: 720 });
  } else src = client.image(item, "Primary", { height: h }) || (item.Type === "Episode" ? client.image(item, "Primary", { height: h, fromSeries: true }) : null);

  const title = label ?? (item.Type === "Episode" ? item.SeriesName || item.Name : item.Name);
  const subtitle =
    sub ??
    (item.Type === "Episode"
      ? `${episodeCode(item)} · ${item.Name}`
      : item.Type === "MusicAlbum"
        ? item.AlbumArtist || item.ProductionYear || ""
        : item.ProductionYear || "");
  return (
    <div className={`${fluid ? "w-full" : SIZES[s].split(" ")[0]} shrink-0`}>
      <button
        data-nav
        data-nav-default={isDefault || undefined}
        data-item-id={item.Id}
        onClick={() => onOpen?.(item)}
        onFocus={() => onFocusItem?.(item)}
        onKeyDown={(e) => onKey?.(e, item)}
        className={`group relative block w-full ${SIZES[s].split(" ")[1]} overflow-hidden rounded-[1rem] bg-white/5 shadow-[0_0.6rem_1.6rem_rgb(0_0_0/0.35)] ring-1 ring-white/10 transition-transform duration-200 focus:z-10 focus:scale-[1.07] focus:shadow-[0_1.4rem_3rem_rgb(0_0_0/0.55)] focus:ring-[0.22rem] focus:ring-white`}
      >
        <Art src={src} item={item} className="absolute inset-0" />
        {s === "wide" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-[1rem] pb-[0.8rem] pt-[2.5rem] text-start">
            <div dir="auto" className="truncate text-[1.12rem] font-bold text-white">{title}</div>
            {subtitle && <div dir="auto" className="truncate text-[0.92rem] font-medium text-white/70">{subtitle}</div>}
          </div>
        )}
        {played && (
          <div className="absolute end-[0.6rem] top-[0.6rem] flex h-[1.9rem] w-[1.9rem] items-center justify-center rounded-full bg-accent text-on-accent shadow-lg">
            <Check className="h-[1.15rem] w-[1.15rem]" strokeWidth={3} />
          </div>
        )}
        {!played && unplayed > 0 && (
          <div className="absolute end-[0.6rem] top-[0.6rem] min-w-[1.9rem] rounded-full bg-accent px-[0.55rem] py-[0.15rem] text-center text-[0.95rem] font-bold text-on-accent shadow-lg">
            {unplayed}
          </div>
        )}
        {item.UserData?.IsFavorite && (
          <Heart className="absolute start-[0.7rem] top-[0.7rem] h-[1.3rem] w-[1.3rem] fill-white text-white drop-shadow" />
        )}
        {progress > 0 && progress < 100 && (
          <div className="absolute inset-x-[0.8rem] bottom-[0.6rem] h-[0.32rem] overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
        )}
      </button>
      {s !== "wide" && (
        <div className="mt-[0.7rem] px-[0.2rem]">
          <div dir="auto" className="truncate text-[1rem] font-semibold text-ink">{title}</div>
          {subtitle && <div className="truncate text-[0.88rem] text-ink-faint">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}

export function Row({ title, items, client, onOpen, onFocusItem, onKey, shape, wideImage, firstDefault = false, action }) {
  if (!items?.length) return null;
  return (
    <section className="mb-[1.6rem]">
      <div className="mb-[0.7rem] flex items-baseline gap-[1rem] px-[4.5rem]">
        <h2 className="text-[1.45rem] font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="no-scrollbar flex gap-[1.3rem] overflow-x-auto px-[4.5rem] pb-[1.4rem] pt-[0.6rem]">
        {items.map((it, i) => (
          <Card
            key={it.Id}
            client={client}
            item={it}
            shape={shape}
            wideImage={wideImage}
            isDefault={firstDefault && i === 0}
            onOpen={onOpen}
            onFocusItem={onFocusItem}
            onKey={onKey}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- buttons
export function Pill({ active, children, onClick, isDefault, onFocus, className = "", ...rest }) {
  return (
    <button
      data-nav
      data-nav-default={isDefault || undefined}
      onClick={onClick}
      onFocus={onFocus}
      className={`shrink-0 rounded-full px-[1.25rem] py-[0.55rem] text-[1.05rem] font-semibold transition-colors focus:scale-[1.06] focus:bg-white focus:text-black ${
        active ? "bg-white/20 text-white" : "bg-white/[0.07] text-white/75"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ActionButton({ Icon, children, onClick, primary, isDefault, filled, title }) {
  return (
    <button
      data-nav
      data-nav-default={isDefault || undefined}
      onClick={onClick}
      title={title}
      className={`flex h-[3.5rem] items-center gap-[0.65rem] rounded-full text-[1.12rem] font-bold transition-transform focus:scale-[1.06] ${
        children ? "px-[1.6rem]" : "w-[3.5rem] justify-center"
      } ${primary ? "bg-white/25 text-white focus:bg-white focus:text-black" : "bg-white/[0.12] text-white focus:bg-white focus:text-black"}`}
    >
      {Icon && <Icon className={`h-[1.35rem] w-[1.35rem] ${filled ? "fill-current" : ""}`} />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- backdrop
// Two stacked layers that crossfade when the picture changes.
// "blur:" before the address: a soft, blurred version (album covers).
export function Backdrop({ src, dim = 0.55 }) {
  const [layers, setLayers] = useState([{ src, key: 0 }]);
  const n = useRef(0);
  useEffect(() => {
    const id = setTimeout(() => {
      setLayers((ls) => (!src ? [] : ls[ls.length - 1]?.src === src ? ls : [...ls.slice(-1), { src, key: ++n.current }]));
    }, 140);
    return () => clearTimeout(id);
  }, [src]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#06070a]">
      {layers.map((l, i) =>
        l.src ? (
          <img
            key={l.key}
            src={l.src.replace(/^blur:/, "")}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${l.src.startsWith("blur:") ? "scale-110 opacity-60 blur-[3rem]" : ""}`}
            style={{ animation: i === layers.length - 1 && layers.length > 1 ? "jf-fade 600ms ease both" : undefined }}
          />
        ) : null,
      )}
      <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, rgb(6 7 10 / ${dim + 0.4}) 0%, rgb(6 7 10 / ${dim}) 45%, rgb(6 7 10 / ${dim - 0.25}) 100%)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-[#06070a]/55 to-transparent" />
    </div>
  );
}

export function Spinner({ className = "" }) {
  return <div className={`h-[2.6rem] w-[2.6rem] animate-spin rounded-full border-[0.25rem] border-white/15 border-t-white ${className}`} />;
}
