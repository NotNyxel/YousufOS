// Wallpapers for wherever you are: a catalogue of landscape photographs for
// every country and territory (and their main cities), chosen from Wikimedia
// Commons' Featured and Quality pictures. Built by scripts/world-wallpapers-*.py;
// photos are downloaded from Wikimedia when shown (internet needed) and
// credited on screen as their licences require.
let catalog = null;

export async function loadWorldCatalog() {
  if (!catalog) catalog = (await import("../data/world-wallpapers.json")).default;
  return catalog;
}

// Catalogue entries hold the Commons path ("a/ab/File.jpg"). Photos come from
// Wikimedia's thumbnail server at a standard width: 1920 px, or 3840 px on a
// 4K screen. (Commons names the thumbnail "thumbnail.jpg" when the file name
// is longer than 160 bytes.)
const WIDTH = typeof window !== "undefined" && window.screen.width * (window.devicePixelRatio || 1) > 2000 ? 3840 : 1920;
export function photoUrl(u, width = WIDTH) {
  if (/^https?:/.test(u)) return u;
  const file = u.split("/").pop();
  let bytes;
  try {
    bytes = new TextEncoder().encode(decodeURIComponent(file)).length;
  } catch {
    bytes = file.length;
  }
  const name = bytes > 160 ? `thumbnail.${file.split(".").pop().toLowerCase()}` : file;
  return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${u}/${width}px-${name}`;
}

// Same order all day, a new order every day.
function shuffled(list, seed) {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function countryPhotoCount(cat, country) {
  return cat?.[country]?.length || 0;
}

// Photos for a country, favouring the chosen city when it has enough of its own.
export function worldPhotos(cat, country, city, isNight, day) {
  const list = (cat?.[country] || []).map((x) => ({
    url: photoUrl(x.u),
    title: x.t,
    credit: `${x.a} · ${x.l}`,
    night: !!x.n,
    city: x.c || "",
    remote: true,
  }));
  if (!list.length) return [];
  const c = (city || "").toLowerCase();
  const here = c ? list.filter((x) => x.city.toLowerCase() === c || x.title.toLowerCase().includes(c)) : [];
  let pool = here.length >= 3 ? here : [...here, ...shuffled(list.filter((x) => !here.includes(x)), day)];
  // Night photos after Maghrib when there are enough of them.
  const night = pool.filter((x) => x.night);
  if (isNight && night.length >= 3) pool = night;
  else if (!isNight && pool.length - night.length >= 3) pool = pool.filter((x) => !x.night);
  return here.length >= 3 ? shuffled(pool, day) : pool;
}
