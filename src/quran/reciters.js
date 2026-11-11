// Verse-by-verse recitations from the Islamic Network CDN (the audio behind
// api.alquran.cloud): https://cdn.islamic.network/quran/audio/{kbps}/{id}/{verse}.mp3
// stream: quality used online; save: smaller files used for downloads.
export const RECITERS = [
  { id: "ar.alafasy", en: "Mishary Alafasy", ar: "مشاري العفاسي", stream: 128, save: 64 },
  { id: "ar.abdurrahmaansudais", en: "Abdul Rahman Al-Sudais", ar: "عبدالرحمن السديس", stream: 64, save: 64, hours: 23 },
  { id: "ar.saoodshuraym", en: "Saud Al-Shuraim", ar: "سعود الشريم", stream: 64, save: 64, hours: 25 },
  { id: "ar.mahermuaiqly", en: "Maher Al-Muaiqly", ar: "ماهر المعيقلي", stream: 128, save: 64 },
  { id: "ar.husary", en: "Mahmoud Khalil Al-Husary", ar: "محمود خليل الحصري", stream: 128, save: 64, hours: 46 },
  { id: "ar.husarymujawwad", en: "Al-Husary (Mujawwad)", ar: "الحصري (المجود)", stream: 128, save: 64, hours: 70 },
  { id: "ar.abdulsamad", en: "Abdul Basit Abdul Samad", ar: "عبد الباسط عبد الصمد", stream: 64, save: 64, hours: 63 },
  { id: "ar.hudhaify", en: "Ali Al-Hudhaify", ar: "علي الحذيفي", stream: 128, save: 64 },
  { id: "ar.shaatree", en: "Abu Bakr Al-Shatri", ar: "أبو بكر الشاطري", stream: 128, save: 64 },
  { id: "ar.ahmedajamy", en: "Ahmed Al-Ajmi", ar: "أحمد العجمي", stream: 128, save: 64 },
  { id: "ar.abdullahbasfar", en: "Abdullah Basfar", ar: "عبد الله بصفر", stream: 64, save: 64 },
  { id: "ar.hanirifai", en: "Hani Al-Rifai", ar: "هاني الرفاعي", stream: 64, save: 64 },
  { id: "ar.muhammadayyoub", en: "Muhammad Ayyub", ar: "محمد أيوب", stream: 128, save: 128 },
  { id: "ar.muhammadjibreel", en: "Muhammad Jibreel", ar: "محمد جبريل", stream: 128, save: 128 },
  { id: "ar.aymanswoaid", en: "Ayman Suwaid", ar: "أيمن سويد", stream: 64, save: 64 },
  { id: "ar.ibrahimakhbar", en: "Ibrahim Al-Akhdar", ar: "إبراهيم الأخضر", stream: 32, save: 32 },
  { id: "en.walk", en: "English translation (Ibrahim Walk)", ar: "ترجمة إنجليزية", stream: 192, save: 192, translation: true },
  { id: "ur.khan", en: "Urdu translation (Shamshad Ali Khan)", ar: "ترجمة أردية", stream: 64, save: 64, translation: true },
];

export const reciter = (id) => RECITERS.find((r) => r.id === id) || RECITERS[0];
export const CDN = "https://cdn.islamic.network/quran/audio";
// Verse numbers here are 1–6236.
export const streamUrl = (r, n) => `${CDN}/${r.stream}/${r.id}/${n}.mp3`;
export const saveBase = (r) => `${CDN}/${r.save}/${r.id}`;
// Rough download size in MB for a share (0–1) of the Qur'an. Most reciters
// take about 32 hours for the whole Qur'an (measured from the CDN's files).
export const sizeMb = (r, share = 1) => Math.max(1, Math.round(((r.save * 1000) / 8) * (r.hours || 32) * 3600 * share / 1e6));
