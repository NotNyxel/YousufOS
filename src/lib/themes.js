// Discord-style themes. Each sets the base colours; card transparency,
// blur and wallpaper dimming are separate sliders applied on top.
//   panel / ink: "r g b" triplets   tint: gradient laid over the wallpaper
export const THEMES = {
  dark: { label: "Obsidian", scheme: "dark", canvas: "#07080b", ink: "246 244 239", panel: "12 14 20", accent: "#d9b45a" },
  ash: { label: "Graphite", scheme: "dark", canvas: "#1c1d21", ink: "236 237 240", panel: "40 41 46", accent: "#8ea1e1" },
  onyx: { label: "Abyss (AMOLED)", scheme: "dark", canvas: "#000000", ink: "240 240 240", panel: "0 0 0", accent: "#d9b45a", dim: 0.4 },
  light: { label: "Daylight", scheme: "light", canvas: "#eef0f3", ink: "18 21 27", panel: "255 255 255", accent: "#2f7de1" },
  midnight: {
    label: "Starlit Sky", scheme: "dark", canvas: "#0b0c1f", ink: "232 234 255", panel: "16 18 46", accent: "#8c9cff",
    tint: "linear-gradient(160deg, rgb(60 60 170 / 0.35), rgb(10 10 40 / 0.45))",
  },
  desert: {
    label: "Liwa Sands", scheme: "dark", canvas: "#1d150b", ink: "250 240 222", panel: "48 34 18", accent: "#e8b86a",
    tint: "linear-gradient(160deg, rgb(200 140 60 / 0.28), rgb(50 30 10 / 0.45))",
  },
  forest: {
    label: "Oasis Palm", scheme: "dark", canvas: "#0a1610", ink: "230 245 236", panel: "14 36 26", accent: "#4fd68b",
    tint: "linear-gradient(160deg, rgb(30 120 70 / 0.3), rgb(5 30 18 / 0.5))",
  },
  crimson: {
    label: "Ruby Dusk", scheme: "dark", canvas: "#16070a", ink: "255 236 238", panel: "44 12 18", accent: "#ff5470",
    tint: "linear-gradient(160deg, rgb(170 20 45 / 0.3), rgb(20 4 8 / 0.55))",
  },
  sea: {
    label: "Arabian Gulf", scheme: "dark", canvas: "#061a20", ink: "226 248 250", panel: "8 34 44", accent: "#3fd0d4",
    tint: "linear-gradient(160deg, rgb(20 140 160 / 0.3), rgb(4 24 34 / 0.5))",
  },
  sunset: {
    label: "Corniche Sunset", scheme: "dark", canvas: "#1a0d16", ink: "255 240 232", panel: "48 20 34", accent: "#ff9a5a",
    tint: "linear-gradient(170deg, rgb(255 130 60 / 0.3), rgb(110 30 110 / 0.4))",
  },
  aurora: {
    label: "Emerald Glow", scheme: "dark", canvas: "#071419", ink: "232 255 246", panel: "10 30 36", accent: "#6ef2c0",
    tint: "linear-gradient(160deg, rgb(40 200 140 / 0.25), rgb(90 40 170 / 0.35))",
  },
  sepia: {
    label: "Old Souq", scheme: "dark", canvas: "#1b140d", ink: "246 234 216", panel: "52 40 28", accent: "#d8a76b",
    tint: "linear-gradient(0deg, rgb(112 66 20 / 0.32), rgb(112 66 20 / 0.32))", filter: "sepia(0.45)",
  },
  cotton: {
    label: "Desert Rose", scheme: "light", canvas: "#fbeff7", ink: "48 22 58", panel: "255 240 250", accent: "#d9539f",
    tint: "linear-gradient(160deg, rgb(255 170 220 / 0.3), rgb(150 190 255 / 0.3))",
  },
  mint: {
    label: "Mint Tea", scheme: "light", canvas: "#ecfaf3", ink: "12 44 32", panel: "240 255 248", accent: "#14a073",
    tint: "linear-gradient(160deg, rgb(150 240 200 / 0.28), rgb(255 255 255 / 0.2))",
  },
};

// Older configs used "amoled".
export const themeOf = (id) => THEMES[id === "amoled" ? "onyx" : id] || THEMES.dark;

export function applyTheme(root, s, accent) {
  const t = themeOf(s.theme);
  const light = t.scheme === "light";
  const alpha = Math.max(0.05, Math.min(1, (s.panelOpacity ?? 46) / 100));
  const set = (k, v) => root.style.setProperty(k, v);
  root.dataset.theme = s.theme;
  root.dataset.scheme = t.scheme;
  set("--canvas", t.canvas);
  set("--ink-rgb", t.ink);
  set("--panel-rgb", t.panel);
  set("--panel-alpha", String(alpha));
  set("--blur", `${s.blur ?? 28}px`);
  set("--wall-dim", String(Math.min(0.9, (s.wallDim ?? 0) / 100 + (t.dim || 0))));
  set("--wall-tint", t.tint || "none");
  set("--wall-filter", t.filter || "none");
  set("--line", light ? "rgb(0 0 0 / 0.1)" : "rgb(255 255 255 / 0.12)");
  set("--scrim-top", light ? "rgb(255 255 255 / 0.15)" : "rgb(0 0 0 / 0.35)");
  set("--scrim-bottom", light ? "rgb(255 255 255 / 0.78)" : "rgb(0 0 0 / 0.82)");
  set("--hero-glow", light ? "rgb(255 255 255 / 0.55)" : "rgb(0 0 0 / 0.38)");
  set("--hero-shadow", light ? "rgb(255 255 255 / 0.5)" : "rgb(0 0 0 / 0.45)");
  set("--ui-scale", String((s.uiScale ?? 100) / 100));
  root.style.colorScheme = t.scheme;
  root.classList.toggle("fx-full", s.effects === "full");
  root.classList.toggle("fx-performance", s.effects === "performance");
  set("--accent", accent);
}
