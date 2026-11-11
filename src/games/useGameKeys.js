import { useEffect, useLayoutEffect, useRef } from "react";

// Game input: grabs keys before the normal TV navigation sees them.
// handler(key) returns true when it used the key.
export function useGameKeys(handler) {
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const onKey = (e) => {
      if (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(e.key)) return; // the shell handles Back
      if (ref.current(e.key, e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

// Fixed-step game loop that survives re-renders.
export function useInterval(cb, ms) {
  const ref = useRef(cb);
  useLayoutEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (ms == null) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export const accentColor = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d9b45a";
