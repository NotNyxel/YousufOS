import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

const FADE_MS = 2600;

// The wallpapers are 4K. On a 1080p TV, decoding and compositing 4K frames
// costs a lot for no visible gain, so each photo is scaled once to the
// screen's real resolution and the smaller copy is reused.
const fitted = new Map();
async function fitToScreen(url) {
  const target = Math.round(Math.max(window.innerWidth, screen.width || 0) * (window.devicePixelRatio || 1));
  if (target >= 3200) return url;
  if (fitted.has(url)) return fitted.get(url);
  const job = (async () => {
    try {
      const img = new Image();
      // Photos from the internet (Wikimedia allows this) can be scaled too.
      if (/^https?:/i.test(url)) img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      if (img.naturalWidth <= target * 1.15) return url;
      const w = target;
      const h = Math.round((img.naturalHeight * target) / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      return blob ? URL.createObjectURL(blob) : url;
    } catch {
      return url;
    }
  })();
  fitted.set(url, job);
  return job;
}
const LAYER = { opacity: 0, willChange: "opacity" };
const IMG = { filter: "var(--wall-filter)" };

// Crossfading wallpaper with exactly two layers.
// The next photo is fully decoded in the hidden layer, raised on top and
// faded in over the current one. Changes that arrive mid-fade wait for it to
// finish, so layers never overlap or cut off half-way.
// fallback: photos to use when the given ones can't be loaded (offline).
function Background({ images: given, fallback, interval = 60, onChange, scrim = true }) {
  const [offline, setOffline] = useState(false);
  const images = offline && fallback?.length ? fallback : given;
  const fails = useRef(0);
  const slotA = useRef(null);
  const slotB = useRef(null);
  const top = useRef(-1);
  const busy = useRef(false);
  const queued = useRef(null);
  const shownUrl = useRef(null);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  const key = images.map((i) => i.url).join("|");
  const [state, setState] = useState({ key, index: 0 });
  if (state.key !== key) setState({ key, index: 0 });
  const current = images.length ? images[state.index % images.length] : null;

  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setState((s) => ({ ...s, index: s.index + 1 })), Math.max(10, interval) * 1000);
    return () => clearInterval(id);
  }, [interval, images.length]);

  const failRef = useRef(null);
  useLayoutEffect(() => {
    failRef.current = (n) => {
      if (n >= 3 && fallback?.length) setOffline(true);
      else setState((s) => ({ ...s, index: s.index + 1 }));
    };
  });
  // Try the internet photos again every 10 minutes.
  useEffect(() => {
    if (!offline) return;
    const id = setTimeout(() => {
      fails.current = 0;
      setOffline(false);
    }, 600000);
    return () => clearTimeout(id);
  }, [offline]);

  // The crossfade itself works directly on the two layer elements.
  const showRef = useRef(null);
  useEffect(() => {
    const show = async (item) => {
      if (busy.current) {
        queued.current = item;
        return;
      }
      if (item.url === shownUrl.current) return;
      busy.current = true;
      const next = top.current === 0 ? 1 : 0;
      const layer = next === 0 ? slotA.current : slotB.current;
      const other = next === 0 ? slotB.current : slotA.current;
      const img = layer.querySelector("img");

      // Hide the spare layer instantly, then load and fully decode the photo.
      layer.style.transition = "none";
      layer.style.opacity = "0";
      img.src = await fitToScreen(item.url);
      try {
        await img.decode();
      } catch {
        /* decode() can reject on some engines; the image still renders */
      }
      if (!img.naturalWidth) {
        // Couldn't load (no internet?): try the next photo; after three
        // misses in a row use the built-in photos for a while.
        busy.current = false;
        fails.current += 1;
        failRef.current?.(fails.current);
        return;
      }
      fails.current = 0;
      // Restart the optional Ken Burns drift for the new photo.
      img.classList.remove("kenburns");
      void img.offsetWidth;
      img.classList.add("kenburns");

      layer.style.zIndex = "2";
      if (other) other.style.zIndex = "1";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          layer.style.transition = `opacity ${FADE_MS}ms ease-in-out`;
          layer.style.opacity = "1";
        }),
      );
      top.current = next;
      shownUrl.current = item.url;
      onChangeRef.current?.(item);

      setTimeout(() => {
        busy.current = false;
        const q = queued.current;
        queued.current = null;
        if (q) show(q);
      }, FADE_MS + 150);
    };
    showRef.current = show;
  }, []);

  useEffect(() => {
    if (current) showRef.current?.(current);
  }, [current]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-canvas">
      <div ref={slotA} className="absolute inset-0 overflow-hidden" style={LAYER}>
        <img alt="" draggable={false} decoding="async" className="h-full w-full object-cover" style={IMG} />
      </div>
      <div ref={slotB} className="absolute inset-0 overflow-hidden" style={LAYER}>
        <img alt="" draggable={false} decoding="async" className="h-full w-full object-cover" style={IMG} />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[3]" style={{ background: "var(--wall-tint)" }} />
      <div className="pointer-events-none absolute inset-0 z-[3]" style={{ background: "rgb(0 0 0 / var(--wall-dim))" }} />
      {scrim && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-[3]"
            style={{ background: "linear-gradient(180deg, var(--scrim-top) 0%, transparent 30%, transparent 45%, var(--scrim-bottom) 100%)" }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-[3]"
            style={{ background: "radial-gradient(ellipse at 50% 42%, transparent 0%, transparent 35%, rgb(0 0 0 / 0.25) 100%)" }}
          />
        </>
      )}
    </div>
  );
}

export default memo(Background);
