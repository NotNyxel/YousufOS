import { toHijri } from "./hijri";

// Istighfar phrases shown in rotation (all from authentic narrations).
export const ISTIGHFAR = [
  { ar: "أستغفر الله", en: "I seek Allah's forgiveness" },
  { ar: "أستغفر الله وأتوب إليه", en: "I seek Allah's forgiveness and turn to Him in repentance" },
  { ar: "ربِّ اغفر لي وتُب عليَّ إنك أنت التوّاب الرحيم", en: "My Lord, forgive me and accept my repentance; You are the Accepting of repentance, the Merciful" },
  { ar: "أستغفر الله العظيم الذي لا إله إلا هو الحيَّ القيومَ وأتوب إليه", en: "I seek forgiveness from Allah the Almighty, besides whom there is no god, the Ever-Living, the Sustainer, and I repent to Him" },
];

export const TAKBIR = {
  ar: "الله أكبر الله أكبر، لا إله إلا الله، والله أكبر الله أكبر، ولله الحمد",
  en: "Allah is the Greatest, Allah is the Greatest. There is no god but Allah. Allah is the Greatest, Allah is the Greatest, and to Allah belongs all praise.",
};

// Which Eid (if any) is being celebrated today, for the "Eid Mubarak" chip.
export function eidToday(now, offset) {
  const h = toHijri(now, offset);
  if (h.month === 10 && h.day <= 3) return "Eid al-Fitr";
  if (h.month === 12 && h.day >= 10 && h.day <= 13) return "Eid al-Adha";
  return null;
}

// Takbir times:
//  Eid al-Fitr: from Maghrib on the eve of Eid until Dhuhr on Eid day.
//  Eid al-Adha: from Fajr on the Day of Arafah (9 Dhul-Hijjah) until Asr on 13 Dhul-Hijjah.
export function takbirPeriod(now, offset, today) {
  const h = toHijri(now, offset);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const ht = toHijri(tomorrow, offset);
  if (ht.month === 10 && ht.day === 1 && now >= today.maghrib) return "Eid al-Fitr";
  if (h.month === 10 && h.day === 1 && now < today.dhuhr) return "Eid al-Fitr";
  if (h.month === 12 && h.day >= 9 && h.day <= 13) {
    if (h.day === 9 && now < today.fajr) return null;
    if (h.day === 13 && now >= today.asr) return null;
    return "Eid al-Adha";
  }
  return null;
}

export function isQuietTime(now, today) {
  const lateNight = new Date(today.isha.getTime() + 60 * 60000);
  return now >= lateNight || now < today.fajr;
}

// A soft two-note chime, synthesised (no audio file needed).
export function playChime(volume = 0.5) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1318.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18 * volume, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.9);
    });
    setTimeout(() => ctx.close(), 2600);
  } catch {
    /* no audio device */
  }
}
