// Hijri dates. Primary source is the Umm al-Qura calendar built into the
// platform's ICU data (Intl). If that is unavailable we fall back to the
// tabular (arithmetic) Islamic calendar. A user offset (±2 days) covers
// local moon-sighting differences.

export const HIJRI_MONTHS = [
  "Muharram", "Safar", "Rabi I", "Rabi II", "Jumada I", "Jumada II",
  "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah",
];

export const HIJRI_MONTHS_AR = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

let intlFormatter;
try {
  intlFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const probe = intlFormatter.resolvedOptions().calendar;
  if (!/islamic/.test(probe)) intlFormatter = null;
} catch {
  intlFormatter = null;
}

function viaIntl(date) {
  const parts = intlFormatter.formatToParts(date);
  const get = (t) => parseInt(parts.find((p) => p.type === t)?.value, 10);
  const r = { day: get("day"), month: get("month"), year: get("year") };
  if (!r.day || !r.month || !(r.year > 1300)) return null;
  return r;
}

// --- Tabular fallback (Fourmilab algorithm) ---
function gregorianToJD(y, m, d) {
  if (m < 3) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}
function islamicToJD(y, m, d) {
  return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948439.5 - 1;
}
function viaArithmetic(date) {
  const jd = Math.floor(gregorianToJD(date.getFullYear(), date.getMonth() + 1, date.getDate())) + 0.5;
  const year = Math.floor((30 * (jd - 1948439.5) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jd - (29 + islamicToJD(year, 1, 1))) / 29.5) + 1);
  const day = jd - islamicToJD(year, month, 1) + 1;
  return { day, month, year };
}

export function toHijri(date, offsetDays = 0) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0); // avoid DST/midnight edge cases
  d.setDate(d.getDate() + (offsetDays || 0));
  return (intlFormatter && viaIntl(d)) || viaArithmetic(d);
}

const RTL_LANGS = new Set(["ar", "ur", "fa"]);
export function formatHijri(h, lang = "en") {
  if (RTL_LANGS.has(lang)) return `${h.day} ${HIJRI_MONTHS_AR[h.month - 1]} ${h.year} هـ`;
  return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} AH`;
}

const EVENTS = [
  { key: "ramadan", en: "Ramadan begins", ar: "بداية رمضان", month: 9, day: 1 },
  { key: "fitr", en: "Eid al-Fitr", ar: "عيد الفطر", month: 10, day: 1 },
  { key: "arafah", en: "Day of Arafah", ar: "يوم عرفة", month: 12, day: 9 },
  { key: "adha", en: "Eid al-Adha", ar: "عيد الأضحى", month: 12, day: 10 },
  { key: "newyear", en: "Islamic New Year", ar: "رأس السنة الهجرية", month: 1, day: 1 },
  { key: "ashura", en: "Day of Ashura", ar: "يوم عاشوراء", month: 1, day: 10 },
];

// Next occurrence of each event, soonest first.
export function upcomingEvents(from, offsetDays = 0) {
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  const found = new Map();
  for (let i = 0; i < 400 && found.size < EVENTS.length; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const h = toHijri(d, offsetDays);
    for (const ev of EVENTS) {
      if (!found.has(ev.key) && h.month === ev.month && h.day === ev.day) {
        found.set(ev.key, { ...ev, date: d, days: i, hijri: h });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.days - b.days);
}

export function isRamadan(date, offsetDays = 0) {
  return toHijri(date, offsetDays).month === 9;
}
