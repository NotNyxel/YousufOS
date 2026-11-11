// Music plays inside YousufOS (an <audio> element; no separate window).
import { useCallback, useEffect, useRef, useState } from "react";
import { TICKS } from "./api";

export function useMusic(client) {
  const audio = useRef(null);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState({ pos: 0, duration: 0, paused: true });
  const session = useRef("");
  const lastReport = useRef(0);
  const current = queue[index];

  const report = useCallback(
    (kind, item, pos) => {
      if (!item) return;
      const info = { ItemId: item.Id, PositionTicks: Math.round((pos || 0) * TICKS), PlaySessionId: session.current, PlayMethod: "DirectStream", CanSeek: true };
      if (kind === "start") client.reportStart(info);
      else if (kind === "stop") client.reportStop(info);
      else client.reportProgress({ ...info, IsPaused: audio.current?.paused });
    },
    [client],
  );

  useEffect(() => {
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    const tick = () => {
      setState({ pos: a.currentTime || 0, duration: a.duration || 0, paused: a.paused });
      if (Date.now() - lastReport.current > 10000) {
        lastReport.current = Date.now();
        report("progress", current, a.currentTime);
      }
    };
    const ended = () => {
      report("stop", current, a.duration);
      if (index + 1 < queue.length) setIndex(index + 1);
      else {
        setQueue([]);
        setIndex(0);
      }
    };
    a.addEventListener("timeupdate", tick);
    a.addEventListener("play", tick);
    a.addEventListener("pause", tick);
    a.addEventListener("ended", ended);
    return () => {
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("play", tick);
      a.removeEventListener("pause", tick);
      a.removeEventListener("ended", ended);
    };
  }, [current, index, queue.length, report]);

  // Load the current track.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (!current) {
      a.pause();
      a.removeAttribute("src");
      a.load();
      return;
    }
    session.current = Math.random().toString(16).slice(2);
    a.src = client.audioUrl(current);
    a.play().catch(() => {});
    report("start", current, 0);
  }, [current, client, report]);

  useEffect(
    () => () => {
      const a = audio.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
      }
    },
    [],
  );

  const controls = {
    play: (tracks, start = 0) => {
      if (current) report("stop", current, audio.current?.currentTime);
      setQueue(tracks);
      setIndex(start);
    },
    toggle: () => {
      const a = audio.current;
      if (!a || !current) return;
      if (a.paused) a.play().catch(() => {});
      else a.pause();
    },
    next: () => {
      if (index + 1 < queue.length) {
        report("stop", current, audio.current?.currentTime);
        setIndex(index + 1);
      }
    },
    prev: () => {
      const a = audio.current;
      if (a && a.currentTime > 4) a.currentTime = 0;
      else if (index > 0) {
        report("stop", current, a?.currentTime);
        setIndex(index - 1);
      }
    },
    seek: (s) => {
      const a = audio.current;
      if (a && current) a.currentTime = Math.max(0, Math.min((a.duration || 0) - 1, a.currentTime + s));
    },
    stop: () => {
      report("stop", current, audio.current?.currentTime);
      setQueue([]);
      setIndex(0);
    },
  };
  return { current, state, queue, index, controls };
}

