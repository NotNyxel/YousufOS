// Music plays inside YousufOS (no separate window), with a small bar you can
// control while browsing: previous / play-pause / next / stop.
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { clock } from "./api";
import { Art } from "./ui";

export function NowPlaying({ client, music, t }) {
  const { current, state, controls } = music;
  if (!current) return null;
  const pct = state.duration ? (100 * state.pos) / state.duration : 0;
  const btn = "flex h-[3rem] w-[3rem] items-center justify-center rounded-full bg-white/10 transition-transform focus:scale-[1.12] focus:bg-white focus:text-black";
  return (
    <div className="absolute bottom-[1.6rem] end-[2.4rem] z-30 flex w-[34rem] items-center gap-[1rem] rounded-[1.4rem] bg-[#14161c]/90 p-[0.8rem] pe-[1.1rem] shadow-2xl ring-1 ring-white/10 backdrop-blur-xl fade-up">
      <Art src={client.image(current, "Primary", { height: 160 })} item={current} className="h-[4.4rem] w-[4.4rem] shrink-0 rounded-[0.8rem]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[1.05rem] font-bold">{current.Name}</div>
        <div className="truncate text-[0.9rem] text-white/60">{current.AlbumArtist || current.Artists?.[0] || current.Album}</div>
        <div className="mt-[0.45rem] flex items-center gap-[0.6rem] text-[0.8rem] tabular text-white/50" dir="ltr">
          <span>{clock(state.pos)}</span>
          <div className="h-[0.25rem] flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span>{clock(state.duration)}</span>
        </div>
      </div>
      <div className="flex gap-[0.4rem]" dir="ltr">
        <button data-nav className={btn} onClick={controls.prev} aria-label={t("Previous")}>
          <SkipBack className="h-[1.2rem] w-[1.2rem]" />
        </button>
        <button data-nav className={btn} onClick={controls.toggle} aria-label={t("Play / pause")}>
          {state.paused ? <Play className="h-[1.2rem] w-[1.2rem] fill-current" /> : <Pause className="h-[1.2rem] w-[1.2rem] fill-current" />}
        </button>
        <button data-nav className={btn} onClick={controls.next} aria-label={t("Next")}>
          <SkipForward className="h-[1.2rem] w-[1.2rem]" />
        </button>
        <button data-nav className={btn} onClick={controls.stop} aria-label={t("Stop")}>
          <Square className="h-[1.05rem] w-[1.05rem] fill-current" />
        </button>
      </div>
    </div>
  );
}
