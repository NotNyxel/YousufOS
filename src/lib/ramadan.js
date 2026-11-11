// Ramadan mode: fasting times, nights, trackers and reminders.
import { toHijri } from "./hijri";

export const IFTAR_DUA = {
  ar: "ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الأَجْرُ إِنْ شَاءَ اللَّهُ",
  en: "The thirst has gone, the veins are moistened, and the reward is certain, if Allah wills.",
  source: "Abu Dawud",
};
export const QADR_DUA = {
  ar: "اللَّهُمَّ إِنَّكَ عَفُوٌّ كَرِيمٌ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي",
  en: "O Allah, You are Pardoning and Generous, You love to pardon, so pardon me.",
  source: "at-Tirmidhi",
};
export const SUHOOR_HADITH = {
  ar: "تَسَحَّرُوا فَإِنَّ فِي السَّحُورِ بَرَكَةً",
  en: "Take suhoor, for in suhoor there is blessing.",
  source: "al-Bukhari & Muslim",
};

// Everything the screens need about Ramadan right now (null outside it).
// mode: "auto" (during Ramadan) | "on" (always, e.g. to try it) | "off".
export function ramadanInfo(now, schedule, settings) {
  const r = settings.ramadan || {};
  if (r.mode === "off") return null;
  const offset = settings.prayer?.hijriOffset || 0;
  const h = toHijri(now, offset);
  const real = h.month === 9;
  if (!real && r.mode !== "on") return null;
  // Outside Ramadan (mode "on") the days count as if today were the 1st... unless
  // it's the last ten, so the preview shows something sensible.
  const day = real ? h.day : 1;
  const { today, tomorrow } = schedule;
  const beforeFajr = now < today.fajr;
  const afterMaghrib = now >= today.maghrib;
  const fasting = !beforeFajr && !afterMaghrib;
  // Suhoor ends at the coming Fajr; iftar is today's Maghrib.
  const suhoorEnds = beforeFajr ? today.fajr : tomorrow.fajr;
  // The night after Maghrib belongs to the next day (night 21 = eve of day 21).
  const night = afterMaghrib ? day + 1 : beforeFajr ? day : null;
  const lastTen = night != null ? night >= 21 && night <= 30 : day >= 20;
  return {
    preview: !real,
    year: real ? h.year : h.month > 9 ? h.year + 1 : h.year,
    day,
    fasting,
    iftar: today.maghrib,
    suhoorEnds,
    night,
    lastTen,
    oddNight: night != null && night >= 21 && night % 2 === 1,
    // One juz a day finishes the Qur'an in Ramadan.
    todaysJuz: Math.min(30, day),
  };
}
