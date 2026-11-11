// Plays Jellyfin videos in mpv (every format, no transcoding on the server)
// and keeps the server up to date: resume points, watched state, Next Up.
// In the browser preview (no mpv) a simulated player runs instead so the flow
// can be tested.
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri, listen, playerCommand } from "../lib/platform";
import { TICKS } from "./api";

const QUEUE = 25; // following episodes queued after the one you pick

// Jellyfin stream index -> mpv track number (1-based within its type, embedded
// tracks first, then external subtitle files in the order they're added).
export function trackNumbers(item, audioIndex, subtitleIndex) {
  const streams = item?.MediaStreams || item?.MediaSources?.[0]?.MediaStreams || [];
  const audio = streams.filter((s) => s.Type === "Audio");
  const embeddedSubs = streams.filter((s) => s.Type === "Subtitle" && !s.IsExternal);
  const externalSubs = streams.filter((s) => s.Type === "Subtitle" && s.IsExternal);
  const out = {};
  if (audioIndex != null) {
    const n = audio.findIndex((s) => s.Index === audioIndex);
    if (n >= 0) out.aid = n + 1;
  }
  if (subtitleIndex === -1) out.sid = 0;
  else if (subtitleIndex != null) {
    let n = embeddedSubs.findIndex((s) => s.Index === subtitleIndex);
    if (n >= 0) out.sid = n + 1;
    else {
      n = externalSubs.findIndex((s) => s.Index === subtitleIndex);
      if (n >= 0) out.sid = embeddedSubs.length + n + 1;
    }
  }
  return { ...out, externalSubs };
}

function subtitleUrl(client, item, s) {
  const ext = { subrip: "srt", ass: "ass", ssa: "ssa", webvtt: "vtt", vtt: "vtt" }[String(s.Codec).toLowerCase()] || "srt";
  return `${client.base}/Videos/${item.Id}/${item.MediaSources?.[0]?.Id || item.Id}/Subtitles/${s.Index}/0/Stream.${ext}`;
}

// sync: Watch together hooks { onKey(key, run), onLoaded(item, pos, run) }:
// in a group, pausing and seeking go to the group instead of the player.
export function usePlayback({ client, t = (s) => s, onToast, onFinished, sync }) {
  const [playing, setPlaying] = useState(null); // { item, pos, duration, paused, preview }
  const run = useRef(null);
  const cb = useRef({ onToast, onFinished, t, sync });
  useEffect(() => {
    cb.current = { onToast, onFinished, t, sync };
  });

  const info = (r, item, pos, extra = {}) => ({
    ItemId: item.Id,
    MediaSourceId: item.MediaSources?.[0]?.Id || item.Id,
    PlaySessionId: r.session,
    PositionTicks: Math.round((pos || 0) * TICKS),
    PlayMethod: "DirectPlay",
    CanSeek: true,
    ...extra,
  });

  const onProgress = useCallback(
    (st) => {
      const r = run.current;
      if (!r || (st.pid != null && st.pid !== r.pid)) return;
      const idx = st.index ?? 0;
      if (idx !== r.index) {
        // mpv moved on to the next episode.
        const prev = r.queue[r.index];
        if (prev) client.reportStop(info(r, prev, r.lastPos));
        r.index = idx;
        r.lastPos = 0;
        r.prompted = false;
        r.segments = [];
        const next = r.queue[idx];
        if (next) {
          client.reportStart(info(r, next, 0));
          client.segments(next.Id).then((s) => r === run.current && (r.segments = s));
        }
      }
      const item = r.queue[r.index];
      if (!item) return;
      if (typeof st.pos === "number") r.lastPos = st.pos;
      r.paused = !!st.paused;
      // Watch together: tell the group once this screen has the video ready.
      if (r.sync && st.duration > 0 && r.readyFor !== r.index) {
        r.readyFor = r.index;
        cb.current.sync?.onLoaded?.(item, r.lastPos, r);
      }
      setPlaying({ item, pos: r.lastPos, duration: st.duration || item.RunTimeTicks / TICKS, paused: r.paused, preview: r.preview });
      const now = Date.now();
      if (now - r.lastReport > 10000 || !!st.paused !== r.lastPaused) {
        r.lastReport = now;
        r.lastPaused = !!st.paused;
        client.reportProgress(info(r, item, r.lastPos, { IsPaused: !!st.paused }));
      }
      // Intro: offer to skip it once.
      const intro = r.segments.find((s) => s.Type === "Intro" && r.lastPos * TICKS >= s.StartTicks && r.lastPos * TICKS < s.EndTicks - 2 * TICKS);
      r.intro = intro || null;
      if (intro && !r.prompted) {
        r.prompted = true;
        if (!r.preview) playerCommand("show-text", "⏭  " + cb.current.t("Press OK to skip the intro"), "5000");
      }
    },
    [client],
  );

  const finish = useCallback(
    (state, error) => {
      const r = run.current;
      if (!r) return;
      run.current = null;
      clearInterval(r.timer);
      const item = r.queue[r.index];
      const pos = typeof state?.pos === "number" && state.index === r.index ? state.pos : r.lastPos;
      if (item) client.reportStop(info(r, item, pos));
      setPlaying(null);
      if (error) cb.current.onToast?.("Couldn't play this video");
      // Give the server a moment to save before the pages reload their rows.
      setTimeout(() => cb.current.onFinished?.(item), 600);
    },
    [client],
  );

  const onKey = useCallback(
    (key) => {
      const r = run.current;
      if (!r) return;
      if (r.sync) return cb.current.sync?.onKey?.(key, r);
      if (key !== "ok") return;
      if (r.intro) {
        const to = r.intro.EndTicks / TICKS;
        r.intro = null;
        if (r.preview) r.lastPos = to;
        else playerCommand("seek", String(to), "absolute");
      } else if (r.preview) r.paused = !r.paused;
      else playerCommand("cycle", "pause");
    },
    [],
  );

  useEffect(() => {
    if (!isTauri()) return;
    const offs = [
      listen("media-progress", (st) => onProgress(st)),
      listen("media-key", (k) => run.current && k.pid === run.current.pid && onKey(k.key)),
      listen("media-closed", (e) => run.current && e.state?.pid === run.current.pid && finish(e.state, e.error)),
    ];
    return () => offs.forEach((p) => p.then((off) => off()));
  }, [onProgress, onKey, finish]);

  // queue: items in order; start: which one; opts: { resume, audio, subtitle }
  const lastPlay = useRef({ id: null, at: 0 });
  const play = useCallback(
    async (queue, start = 0, opts = {}) => {
      // One press of OK can arrive twice (key and click): start only once.
      const firstId = queue[start]?.Id;
      if (!opts.sync && lastPlay.current.id === firstId && Date.now() - lastPlay.current.at < 2500) return;
      // In a Watch together group: the group starts it for everyone.
      if (!opts.sync && cb.current.sync?.active?.()) return cb.current.sync.startForGroup(queue, start, opts);
      lastPlay.current = { id: firstId, at: Date.now() };
      const list = queue.slice(start, start + QUEUE).filter((i) => i.MediaType === "Video" || i.MediaType === "Audio" || i.Type === "Episode" || i.Type === "Movie");
      if (!list.length) return;
      const first = list[0];
      const resumeAt = opts.startTicks != null ? opts.startTicks / TICKS : opts.resume ? (first.UserData?.PlaybackPositionTicks || 0) / TICKS : 0;
      const session = Math.random().toString(16).slice(2);
      const r = {
        queue: list, index: 0, session, lastPos: resumeAt, lastReport: 0, lastPaused: false, prompted: false, segments: [], preview: !isTauri(),
        sync: !!opts.sync, playlistItemIds: opts.playlistItemIds?.slice(start, start + QUEUE) || null, readyFor: null,
      };
      if (run.current) finish(null, false);
      run.current = r;
      client.segments(first.Id).then((s) => r === run.current && (r.segments = s));

      if (isTauri()) {
        const entries = list.map((it, i) => {
          const tracks = i === 0 ? trackNumbers(it, opts.audio, opts.subtitle) : trackNumbers(it);
          const title = it.Type === "Episode" ? `${it.SeriesName} · S${it.ParentIndexNumber}:E${it.IndexNumber} · ${it.Name}` : it.Name;
          return {
            url: client.streamUrl(it),
            title,
            start: i === 0 ? resumeAt : 0,
            aid: tracks.aid ?? null,
            sid: tracks.sid ?? null,
            sub_files: tracks.externalSubs.map((s) => subtitleUrl(client, it, s)),
            pause: !!opts.pause && i === 0,
          };
        });
        try {
          r.pid = await invoke("play_media", { entries, headers: [`Authorization: ${client.authHeader()}`], audioOnly: first.MediaType === "Audio", sync: !!opts.sync });
        } catch (e) {
          run.current = null;
          cb.current.onToast?.(String(e));
          return;
        }
      } else {
        // Browser preview: simulate playback at 10x speed.
        r.pid = -1;
        r.timer = setInterval(() => {
          if (!r.paused) r.lastPos += 1;
          const dur = (r.queue[r.index].RunTimeTicks || 60 * TICKS) / TICKS;
          if (r.lastPos >= dur) {
            if (r.index + 1 < r.queue.length) onProgress({ pid: -1, index: r.index + 1, pos: 0, paused: false, duration: (r.queue[r.index + 1].RunTimeTicks || 0) / TICKS });
            else return finish({ pos: dur, index: r.index }, false);
          } else onProgress({ pid: -1, index: r.index, pos: r.lastPos, paused: r.paused, duration: dur });
        }, 100);
      }
      client.reportStart(info(r, first, resumeAt));
      setPlaying({ item: first, pos: resumeAt, duration: first.RunTimeTicks / TICKS, paused: false, preview: r.preview });
    },
    [client, finish, onProgress],
  );

  // Preview controls (the real player takes keys in mpv itself).
  const preview = {
    stop: () => run.current && finish({ pos: run.current.lastPos, index: run.current.index }, false),
    ok: () => onKey("ok"),
    seek: (s) => run.current && (run.current.lastPos = Math.max(0, run.current.lastPos + s)),
    next: () => {
      const r = run.current;
      if (r && r.index + 1 < r.queue.length) onProgress({ pid: -1, index: r.index + 1, pos: 0, paused: false, duration: 0 });
    },
  };

  useEffect(() => () => run.current && finish(null, false), [finish]);
  return {
    playing,
    play,
    preview,
    introActive: () => !!run.current?.intro,
    current: () => run.current,
    // Stop the player from code (Watch together: the group stopped).
    stop: () => {
      const r = run.current;
      if (!r) return;
      if (r.preview) finish({ pos: r.lastPos, index: r.index }, false);
      else playerCommand("quit", "4");
    },
  };
}
