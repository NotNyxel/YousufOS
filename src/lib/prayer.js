import {
  Coordinates,
  CalculationMethod,
  PrayerTimes,
  Madhab,
  HighLatitudeRule,
} from "adhan";

export const METHODS = {
  uae: { label: "UAE (Awqaf)", make: () => CalculationMethod.Dubai() },
  ummalqura: { label: "Umm Al-Qura", make: () => CalculationMethod.UmmAlQura() },
  mwl: { label: "Muslim World League", make: () => CalculationMethod.MuslimWorldLeague() },
  egypt: { label: "Egyptian Authority", make: () => CalculationMethod.Egyptian() },
  karachi: { label: "Karachi", make: () => CalculationMethod.Karachi() },
  isna: { label: "ISNA (North America)", make: () => CalculationMethod.NorthAmerica() },
  qatar: { label: "Qatar", make: () => CalculationMethod.Qatar() },
  kuwait: { label: "Kuwait", make: () => CalculationMethod.Kuwait() },
  singapore: { label: "Singapore / Malaysia / Indonesia", make: () => CalculationMethod.Singapore() },
  turkey: { label: "Turkey (Diyanet)", make: () => CalculationMethod.Turkey() },
  tehran: { label: "Tehran", make: () => CalculationMethod.Tehran() },
  moonsighting: { label: "Moonsighting Committee", make: () => CalculationMethod.MoonsightingCommittee() },
};

export const PRAYERS = [
  { key: "fajr", en: "Fajr", ar: "الفجر" },
  { key: "sunrise", en: "Sunrise", ar: "الشروق" },
  { key: "dhuhr", en: "Dhuhr", ar: "الظهر" },
  { key: "asr", en: "Asr", ar: "العصر" },
  { key: "maghrib", en: "Maghrib", ar: "المغرب" },
  { key: "isha", en: "Isha", ar: "العشاء" },
];

export const ADHAN_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export function prayerTimesFor(date, loc, prefs) {
  const coords = new Coordinates(loc.lat, loc.lng);
  const params = (METHODS[prefs.method] || METHODS.uae).make();
  params.madhab = prefs.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  if (Math.abs(loc.lat) > 48) params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  const adj = prefs.adjustments || {};
  for (const k of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
    if (adj[k]) params.adjustments[k] = (params.adjustments[k] || 0) + adj[k];
  }
  const pt = new PrayerTimes(coords, date, params);
  const out = {};
  for (const p of PRAYERS) out[p.key] = pt[p.key];
  return out;
}

// Everything the UI needs about "now" in one object.
export function prayerSchedule(now, loc, prefs) {
  const today = prayerTimesFor(now, loc, prefs);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = prayerTimesFor(tomorrowDate, loc, prefs);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = prayerTimesFor(yesterdayDate, loc, prefs);

  const list = PRAYERS.map((p) => ({ ...p, time: today[p.key] }));

  // Next actual prayer (sunrise is shown but is not a prayer).
  let next = list.find((p) => p.key !== "sunrise" && p.time > now);
  if (!next) next = { ...PRAYERS[0], time: tomorrow.fajr, tomorrow: true };

  // Current prayer window: last prayer that has started, ending at sunrise for Fajr.
  let current = null;
  let previousTime = yesterday.isha;
  for (const p of list) {
    if (p.time <= now) {
      current = p.key === "sunrise" ? null : p.key;
      previousTime = p.time;
    }
  }
  if (now < today.fajr) current = "isha";

  const span = next.time - previousTime;
  const progress = span > 0 ? Math.min(1, Math.max(0, (now - previousTime) / span)) : 0;

  const isNight = now >= today.maghrib || now < today.sunrise;

  return { list, today, tomorrow, next, current, progress, isNight };
}

export function formatTime(date, clock24, locale) {
  return date.toLocaleTimeString(locale || (clock24 ? "en-GB" : "en-US"), {
    hour: clock24 ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: !clock24,
  });
}

export function formatCountdown(ms, t = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k])) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t("{m} min", { m });
  return m === 0 ? t("{h} hr", { h }) : t("{h} hr {m} min", { h, m });
}

export function formatCountdownClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
