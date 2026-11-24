import { useEffect, useLayoutEffect, useRef } from "react";

// Spatial navigation for remotes, keyboards and gamepads.
// Any element with `data-nav` is focusable; arrows move to the nearest
// one in that direction. Elements with `data-adjust` receive a
// "nav-adjust" event for Left/Right instead (sliders, option pickers).
// The last element marked `data-nav-scope` traps focus (modals).
// Inside a `data-nav-trap="y"` container (the sidebar, Settings sections)
// Up/Down stay in that container. Back fires a cancelable "nav-back" event on
// the focused element first, so pages can step out of their own sub-views.

const DIRS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
const BACK_KEYS = new Set(["Escape", "Backspace", "BrowserBack", "GoBack"]);

function visible(el) {
  if (el.checkVisibility ? !el.checkVisibility({ visibilityProperty: true }) : !el.getClientRects().length) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.opacity !== "0";
}

// Cheap list (no style checks); visibility is checked only for the winner.
function candidates(root = document) {
  const scopes = document.querySelectorAll("[data-nav-scope]");
  const scope = scopes.length ? scopes[scopes.length - 1] : root;
  return [...scope.querySelectorAll("[data-nav]")].filter((el) => !el.disabled);
}

export function focusables(root = document) {
  return candidates(root).filter(visible);
}

function rangeGap(a1, a2, b1, b2) {
  if (a2 < b1) return b1 - a2;
  if (b2 < a1) return a1 - b2;
  return 0;
}

// Last focused element in the main area, restored when coming back from the sidebar.
let lastMain = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (el?.closest?.("[data-main]") && el.matches?.("[data-nav]")) lastMain = el;
  });
}

export function restoreMain() {
  const main = document.querySelector("[data-main]");
  if (lastMain && main?.contains(lastMain) && visible(lastMain)) focusEl(lastMain);
  else focusDefault(main);
}

export function moveFocus(dir) {
  let items = candidates();
  if (!items.length) return false;
  const cur = document.activeElement;
  if (!items.includes(cur) || !visible(cur)) {
    focusDefault();
    return true;
  }
  // Sidebar: Right enters the page; Up/Down never leave the rail.
  if (cur.closest("[data-sidebar]") && dir === (document.documentElement.dir === "rtl" ? "left" : "right")) {
    cur.click();
    return true;
  }
  const trap = cur.closest('[data-nav-trap="y"]');
  if (trap && (dir === "up" || dir === "down")) items = items.filter((el) => trap.contains(el));
  // Up/Down inside a page stay in the page: at the top or bottom nothing
  // happens (it used to slip into the sidebar and open another page).
  if ((dir === "up" || dir === "down") && !cur.closest("[data-sidebar]")) items = items.filter((el) => !el.closest("[data-sidebar]"));
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const scored = [];
  for (const el of items) {
    if (el === cur) continue;
    const o = el.getBoundingClientRect();
    if (!o.width && !o.height) continue;
    const ox = o.left + o.width / 2;
    const oy = o.top + o.height / 2;
    let primary, ortho, centerOrtho;
    if (dir === "right") {
      if (ox <= cx + 1 || o.left < r.left + 2) continue;
      primary = Math.max(0, o.left - r.right);
      ortho = rangeGap(r.top, r.bottom, o.top, o.bottom);
      centerOrtho = Math.abs(oy - cy);
    } else if (dir === "left") {
      if (ox >= cx - 1 || o.right > r.right - 2) continue;
      primary = Math.max(0, r.left - o.right);
      ortho = rangeGap(r.top, r.bottom, o.top, o.bottom);
      centerOrtho = Math.abs(oy - cy);
    } else if (dir === "down") {
      if (oy <= cy + 1 || o.top < r.top + 2) continue;
      primary = Math.max(0, o.top - r.bottom);
      ortho = rangeGap(r.left, r.right, o.left, o.right);
      centerOrtho = Math.abs(ox - cx);
    } else {
      if (oy >= cy - 1 || o.bottom > r.bottom - 2) continue;
      primary = Math.max(0, r.top - o.bottom);
      ortho = rangeGap(r.left, r.right, o.left, o.right);
      centerOrtho = Math.abs(ox - cx);
    }
    scored.push({ el, score: primary + ortho * 4 + centerOrtho * 0.15 });
  }
  scored.sort((a, b) => a.score - b.score);
  const best = scored.find((c) => visible(c.el));
  if (best) {
    // Entering the sidebar lands on the current page, not the nearest icon.
    if (best.el.closest("[data-sidebar]") && !cur.closest("[data-sidebar]")) {
      const active = document.querySelector("[data-sidebar] [data-active]");
      if (active) return focusEl(active), true;
    }
    // Entering a panel marked data-nav-enter starts at its first setting.
    const panel = best.el.closest("[data-nav-enter]");
    if (panel && !panel.contains(cur)) {
      const first = panel.querySelector("[data-nav-default]") || panel.querySelector("[data-nav]");
      if (first) return focusEl(first), true;
    }
    focusEl(best.el);
    return true;
  }
  return false;
}

// A short scroll animation (the engine's "smooth" scroll is slow to start).
const gliding = new WeakMap();
function glide(el, dy, dx) {
  const prev = gliding.get(el);
  if (prev) cancelAnimationFrame(prev.raf);
  const fromY = el.scrollTop;
  const fromX = el.scrollLeft;
  const toY = (prev ? prev.toY : fromY) + dy;
  const toX = (prev ? prev.toX : fromX) + dx;
  if (document.documentElement.classList.contains("fx-performance")) {
    el.scrollTop = toY;
    el.scrollLeft = toX;
    gliding.delete(el);
    return;
  }
  const t0 = performance.now();
  const D = 170;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D);
    const e = 1 - Math.pow(1 - k, 3);
    el.scrollTop = fromY + (toY - fromY) * e;
    el.scrollLeft = fromX + (toX - fromX) * e;
    if (k < 1) gliding.set(el, { raf: requestAnimationFrame(step), toY, toX });
    else gliding.delete(el);
  };
  gliding.set(el, { raf: requestAnimationFrame(step), toY, toX });
}

// Scrolls only real scroll areas (never the page shell sideways), keeping a
// little room around the focused element.
function reveal(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    const canY = /(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1;
    const canX = /(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1;
    if (!canY && !canX) continue;
    const r = el.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    let top = 0;
    let left = 0;
    if (canY) {
      const pad = Math.min(pr.height * 0.12, 120);
      if (r.top < pr.top + pad) top = r.top - pr.top - pad;
      else if (r.bottom > pr.bottom - pad) top = r.bottom - pr.bottom + pad;
    }
    if (canX) {
      const pad = Math.min(pr.width * 0.06, 120);
      if (r.left < pr.left + pad) left = r.left - pr.left - pad;
      else if (r.right > pr.right - pad) left = r.right - pr.right + pad;
    }
    if (top || left) glide(p, top, left);
  }
}

export function focusEl(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  if (!el.closest("[data-sidebar]")) reveal(el);
}

export function focusDefault(root) {
  const items = focusables(root);
  const scopes = document.querySelectorAll("[data-nav-scope]");
  const scope = scopes.length ? scopes[scopes.length - 1] : root || document;
  const def = scope.querySelector("[data-nav-default]");
  focusEl(def && items.includes(def) ? def : items.find((el) => !el.closest("[data-sidebar]")) || items[0]);
}

export function useSpatialNav({ onBack, enabled = true }) {
  const backRef = useRef(onBack);
  useLayoutEffect(() => {
    backRef.current = onBack;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const tag = e.target?.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && !DIRS[e.key] && e.key !== "Escape") return;
      const dir = DIRS[e.key];
      const cur = document.activeElement;
      // A modal (data-nav-scope) is open but focus is still behind it.
      const scopes = document.querySelectorAll("[data-nav-scope]");
      const scope = scopes[scopes.length - 1];
      if (scope && !scope.contains(cur) && (dir || e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        focusDefault();
        return;
      }
      if (dir) {
        e.preventDefault();
        if (cur?.dataset?.adjust !== undefined && (dir === "left" || dir === "right")) {
          // The control calls preventDefault() if it used the key; otherwise
          // (e.g. the app carousel at its first/last app) focus moves on.
          const ev = new CustomEvent("nav-adjust", { detail: dir === "left" ? -1 : 1, cancelable: true });
          cur.dispatchEvent(ev);
          if (ev.defaultPrevented) return;
        }
        moveFocus(dir);
      } else if (e.key === "Enter" || e.key === " ") {
        if (cur && cur.dataset?.nav !== undefined) {
          e.preventDefault();
          cur.click();
        } else {
          e.preventDefault();
          focusDefault();
        }
      } else if (e.key === "LongEnter") {
        // OK held down (Android TV remote): works like Y on a controller
        // (favourite, mark watched…); where Y does nothing, it's a normal OK.
        e.preventDefault();
        if (cur && cur.dataset?.nav !== undefined) {
          const y = new KeyboardEvent("keydown", { key: "y", bubbles: true, cancelable: true });
          cur.dispatchEvent(y);
          if (!y.defaultPrevented) cur.click();
        }
      } else if (BACK_KEYS.has(e.key)) {
        e.preventDefault();
        const ev = new CustomEvent("nav-back", { bubbles: true, cancelable: true });
        (cur && cur !== document.body ? cur : document).dispatchEvent(ev);
        if (!ev.defaultPrevented) backRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

// A key press delivered to the focused element (bubbles up to window), so
// components can react to controller buttons with ordinary key handlers.
export function pressKey(key) {
  const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

// Gamepad -> synthetic key presses (D-pad / left stick / A / B / Start).
export function useGamepad(enabled = true) {
  useEffect(() => {
    if (!enabled || !("getGamepads" in navigator)) return;
    let raf;
    const held = {};
    // Standard (Xbox) layout: A, B, X, Y, LB, RB, View, Menu, D-pad
    const BUTTONS = { 12: "ArrowUp", 13: "ArrowDown", 14: "ArrowLeft", 15: "ArrowRight", 0: "Enter", 1: "Escape", 2: "x", 3: "y", 4: "PageUp", 5: "PageDown", 8: "Home", 9: "ContextMenu", 7: "Enter" };
    const press = (key) => pressKey(key);
    const loop = (t) => {
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        const state = {};
        for (const [i, key] of Object.entries(BUTTONS)) if (pad.buttons[i]?.pressed) state[key] = true;
        const [ax = 0, ay = 0] = pad.axes;
        if (ax < -0.6) state.ArrowLeft = true;
        if (ax > 0.6) state.ArrowRight = true;
        if (ay < -0.6) state.ArrowUp = true;
        if (ay > 0.6) state.ArrowDown = true;
        for (const key of new Set([...Object.keys(state), ...Object.keys(held)])) {
          if (state[key]) {
            if (!held[key]) {
              press(key);
              held[key] = t + 400; // initial repeat delay
            } else if (key.startsWith("Arrow") && t > held[key]) {
              press(key);
              held[key] = t + 120;
            }
          } else delete held[key];
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}
