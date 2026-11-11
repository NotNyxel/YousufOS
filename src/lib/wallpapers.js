// Wallpapers are discovered automatically: drop a photo into
// src/assets/wallpapers named  <collection>-<title>[-night].jpg
//   collection: landmarks | mosques | desert   (anything else -> "landmarks")
//   "-night" anywhere in the name = shown after Maghrib until sunrise.
const files = import.meta.glob("../assets/wallpapers/*.{jpg,jpeg,png,webp,avif}", {
  eager: true,
  import: "default",
});

const SMALL = new Set(["of", "the", "al", "and", "at"]);

function titleFrom(slug) {
  return slug
    .replace(/-(night|day|\d+)\b/gi, "")
    .replace(/-(golden-hour|skyline)/gi, "")
    .split("-")
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export const WALLPAPERS = Object.entries(files)
  .map(([path, url]) => {
    const base = path.split("/").pop().replace(/\.[^.]+$/, "");
    const [first, ...rest] = base.split("-");
    const known = ["landmarks", "mosques", "desert"].includes(first);
    return {
      url,
      category: known ? first : "landmarks",
      title: titleFrom(known ? rest.join("-") : base),
      night: /night/i.test(base),
    };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

export const COLLECTIONS = [
  { value: "all", label: "All UAE" },
  { value: "landmarks", label: "UAE Landmarks" },
  { value: "mosques", label: "Mosques" },
  { value: "desert", label: "Desert" },
  { value: "custom", label: "Custom Images" },
];

export function pickWallpapers(collection, custom, isNight) {
  let pool =
    collection === "custom"
      ? custom
      : collection === "all"
        ? [...WALLPAPERS, ...custom]
        : WALLPAPERS.filter((w) => w.category === collection);
  if (!pool.length) pool = WALLPAPERS;
  // Day/night matching: prefer images tagged for the current time,
  // but never leave the screen empty.
  const matched = pool.filter((w) => w.night === isNight);
  return matched.length ? matched : pool;
}

// Background for the Adhan screen: Sheikh Zayed Grand Mosque (night shot after Maghrib).
export function prayerWallpaper(isNight = false) {
  const szgm = WALLPAPERS.filter((w) => /sheikh zayed/i.test(w.title));
  return szgm.find((w) => w.night === isNight) || szgm[0] || WALLPAPERS.find((w) => w.category === "mosques") || WALLPAPERS[0];
}
