import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import { ChevronDown, ChevronUp, Heart, List, LoaderCircle, TvMinimal } from "lucide-react";
import { relayUrl } from "../lib/iptv";
import { focusDefault } from "../lib/nav";
import { useI18n } from "../lib/settings-store";

// Fullscreen live player. Up/Down = previous/next channel, OK = show info,
// Back = channel list. Plays HLS (.m3u8) via hls.js, anything else natively.
// Why a channel failed, in words people understand.
function reasonOf(d) {
  const code = d?.response?.code;
  if (d?.type === "mediaError") return "video format not supported here";
  if (code === 403 || code === 451) return "blocked in your country";
  if (code === 404 || code === 410) return "the channel has moved or stopped";
  if (d?.type === "networkError") return "couldn't reach the channel";
  return "";
}

export default function TvPlayer({ channels, index, onIndex, onClose, onFailed, isFav, onToggleFav, paused }) {
  const { t } = useI18n();
  const video = useRef(null);
  const [st, setSt] = useState({ url: null, value: "loading", reason: "" });
  const [chrome, setChrome] = useState(true);
  const ch = channels[index];
  const status = st.url === ch.url ? st.value : "loading";
  const ref = useRef({});
  useLayoutEffect(() => {
    ref.current = { index, channels, onIndex, onClose, onFailed };
  });

  // Load the channel.
  useEffect(() => {
    const v = video.current;
    let hls;
    let triedNative = false;
    let reason = "";
    const setStatus = (value) =>
      setSt((prev) => ({ url: ch.url, reason, value: typeof value === "function" ? value(prev.url === ch.url ? prev.value : "loading") : value }));
    // Nothing worked: let the page try mpv (Automatic mode) or show why.
    const fail = () => {
      const { index: i, onFailed: failed } = ref.current;
      if (failed?.(i, reason)) return;
      setStatus("error");
    };
    const native = () => {
      triedNative = true;
      v.src = ch.url; // the media engine fetches http(s) itself
      v.play().catch(() => {});
    };
    if (/\.m3u8($|\?)/i.test(ch.url) && Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 20,
        capLevelToPlayerSize: true, // no 1080p decode work on a 720p screen
        xhrSetup: (xhr, url) => xhr.open("GET", relayUrl(url, ch), true),
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        reason = reasonOf(d);
        hls.destroy();
        hls = null;
        // A 403 / 404 won't get better with another engine.
        if (!triedNative && !/blocked|moved/.test(reason)) native();
        else fail();
      });
      hls.loadSource(ch.url);
      hls.attachMedia(v);
    } else {
      native();
    }
    const onPlaying = () => setStatus("playing");
    const onWaiting = () => setStatus((s) => (s === "error" ? s : "loading"));
    const onError = () => {
      if (!triedNative) native();
      else {
        if (!reason) reason = v.error?.code === 4 ? "video format not supported here" : "couldn't reach the channel";
        fail();
      }
    };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("error", onError);
    const timeout = setTimeout(() => {
      if (v.readyState < 3 && !v.currentTime) {
        reason = reason || "the channel didn't respond";
        fail();
      }
    }, 20000);
    return () => {
      clearTimeout(timeout);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("error", onError);
      hls?.destroy();
      v.removeAttribute("src");
      v.load();
    };
  }, [ch]);

  useEffect(() => {
    const v = video.current;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused]);

  // Info overlay hides after a few seconds.
  useEffect(() => {
    if (!chrome) return;
    const id = setTimeout(() => setChrome(false), 5000);
    return () => clearTimeout(id);
  }, [chrome, index]);

  useEffect(() => {
    const id = requestAnimationFrame(() => focusDefault());
    const onKey = (e) => {
      const { index: i, channels: list, onIndex: go, onClose: close } = ref.current;
      const n = list.length;
      // Skip entries that aren't streams (old 1.3 web channels in favourites).
      const step = (d) => {
        for (let k = 1; k <= n; k++) {
          const j = (((i + d * k) % n) + n) % n;
          if (!list[j].web) return go(j);
        }
      };
      setChrome(true);
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "ChannelUp") {
        step(-1);
      } else if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "ChannelDown") {
        step(1);
      } else if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) {
        close();
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[75] bg-black text-white" style={{ cursor: chrome ? "default" : "none" }}>
      <video ref={video} className="h-full w-full bg-black object-contain" playsInline autoPlay />

      {status !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1rem] text-center">
          {status === "loading" ? (
            <LoaderCircle className="h-[3.5rem] w-[3.5rem] animate-spin text-white/70" />
          ) : (
            <>
              <TvMinimal className="h-[3.5rem] w-[3.5rem] text-white/50" />
              <div className="text-[1.8rem] font-semibold">{t("This channel isn't available right now")}</div>
              {st.reason && <div className="text-[1.2rem] text-white/70">{t(st.reason)}</div>}
              <div className="text-[1.15rem] text-white/60">{t("Press ▲ or ▼ to try another channel")}</div>
            </>
          )}
        </div>
      )}

      <div className={`absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-[3rem] pb-[4rem] pt-[2.2rem] transition-opacity duration-500 ${chrome ? "opacity-100" : "opacity-0"}`}>
        <div className="flex items-center gap-[1.4rem]">
          <div className="flex h-[5rem] w-[8rem] items-center justify-center rounded-[1rem] bg-white/10 p-[0.6rem]">
            {ch.logo ? <img src={ch.logo} alt="" className="max-h-full max-w-full object-contain" /> : <TvMinimal className="h-[2.4rem] w-[2.4rem] text-white/60" />}
          </div>
          <div className="min-w-0">
            <div className="tabular text-[1rem] font-semibold text-white/60">
              {index + 1} / {channels.length}
              {ch.group && ` · ${ch.group}`}
            </div>
            <div className="truncate text-[2.2rem] font-bold">{ch.name}</div>
          </div>
          <div className="ms-auto flex items-center gap-[0.6rem] text-[1rem] text-white/60">
            <ChevronUp className="h-[1.3rem] w-[1.3rem]" />
            <ChevronDown className="h-[1.3rem] w-[1.3rem]" />
            {t("Change channel")}
          </div>
        </div>
      </div>

      <div className={`absolute inset-x-0 bottom-0 flex justify-center gap-[1rem] bg-gradient-to-t from-black/80 to-transparent pb-[2.5rem] pt-[4rem] transition-opacity duration-500 ${chrome ? "opacity-100" : "opacity-0"}`}>
        <button data-nav data-nav-default onClick={onToggleFav} className="focus-row flex items-center gap-[0.6rem] rounded-full border border-white/20 bg-white/10 px-[1.8rem] py-[0.9rem] text-[1.15rem] font-semibold">
          <Heart className={`h-[1.3rem] w-[1.3rem] ${isFav ? "fill-current text-red-400" : ""}`} />
          {isFav ? t("Remove from favourites") : t("Add to favourites")}
        </button>
        <button data-nav onClick={onClose} className="focus-row flex items-center gap-[0.6rem] rounded-full border border-white/20 bg-white/10 px-[1.8rem] py-[0.9rem] text-[1.15rem] font-semibold">
          <List className="h-[1.3rem] w-[1.3rem]" />
          {t("All channels")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
