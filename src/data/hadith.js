// Offline hadith collection. One is shown per day (rotates by date).
// Add more entries freely: { ar, en, ref }.
export const HADITH = [
  { ar: "خيركم من تعلم القرآن وعلمه", en: "The best of you are those who learn the Qur'an and teach it.", ref: "Sahih al-Bukhari" },
  { ar: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى", en: "Actions are only by intentions, and every person will have only what they intended.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "الدين النصيحة", en: "The religion is sincere counsel.", ref: "Sahih Muslim" },
  { ar: "لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه", en: "None of you truly believes until he loves for his brother what he loves for himself.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "من كان يؤمن بالله واليوم الآخر فليقل خيرا أو ليصمت", en: "Whoever believes in Allah and the Last Day, let him speak good or remain silent.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "الطهور شطر الإيمان", en: "Purity is half of faith.", ref: "Sahih Muslim" },
  { ar: "تبسمك في وجه أخيك لك صدقة", en: "Your smile in the face of your brother is charity.", ref: "Jami' at-Tirmidhi" },
  { ar: "المسلم من سلم المسلمون من لسانه ويده", en: "A Muslim is the one from whose tongue and hand the Muslims are safe.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "لا تغضب", en: "Do not become angry.", ref: "Sahih al-Bukhari" },
  { ar: "الكلمة الطيبة صدقة", en: "A good word is charity.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "من حسن إسلام المرء تركه ما لا يعنيه", en: "Part of the excellence of a person's Islam is leaving what does not concern him.", ref: "Jami' at-Tirmidhi" },
  { ar: "اتق الله حيثما كنت، وأتبع السيئة الحسنة تمحها، وخالق الناس بخلق حسن", en: "Fear Allah wherever you are, follow a bad deed with a good one and it will erase it, and treat people with good character.", ref: "Jami' at-Tirmidhi" },
  { ar: "من سلك طريقا يلتمس فيه علما سهل الله له به طريقا إلى الجنة", en: "Whoever takes a path seeking knowledge, Allah makes easy for him a path to Paradise.", ref: "Sahih Muslim" },
  { ar: "إن الله رفيق يحب الرفق في الأمر كله", en: "Allah is gentle and loves gentleness in all matters.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "ليس الشديد بالصرعة، إنما الشديد الذي يملك نفسه عند الغضب", en: "The strong one is not the one who overcomes others by force, but the one who controls himself when angry.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "أحب الأعمال إلى الله أدومها وإن قل", en: "The most beloved deeds to Allah are those done consistently, even if small.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "من لا يرحم لا يرحم", en: "Whoever does not show mercy will not be shown mercy.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "الراحمون يرحمهم الرحمن", en: "The merciful are shown mercy by the Most Merciful.", ref: "Abu Dawud & at-Tirmidhi" },
  { ar: "يسروا ولا تعسروا، وبشروا ولا تنفروا", en: "Make things easy and do not make them difficult; give glad tidings and do not drive people away.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "ما نقصت صدقة من مال", en: "Charity never decreases wealth.", ref: "Sahih Muslim" },
  { ar: "أكمل المؤمنين إيمانا أحسنهم خلقا", en: "The most complete of the believers in faith are those with the best character.", ref: "Abu Dawud & at-Tirmidhi" },
  { ar: "كلمتان خفيفتان على اللسان، ثقيلتان في الميزان، حبيبتان إلى الرحمن: سبحان الله وبحمده، سبحان الله العظيم", en: "Two words light on the tongue, heavy on the scale, beloved to the Most Merciful: SubhanAllahi wa bihamdihi, SubhanAllahil-Azim.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "إن الله لا ينظر إلى صوركم وأموالكم، ولكن ينظر إلى قلوبكم وأعمالكم", en: "Allah does not look at your appearance or your wealth, but He looks at your hearts and your deeds.", ref: "Sahih Muslim" },
  { ar: "من دل على خير فله مثل أجر فاعله", en: "Whoever guides someone to good will have a reward like the one who does it.", ref: "Sahih Muslim" },
  { ar: "خيركم خيركم لأهله، وأنا خيركم لأهلي", en: "The best of you are the best to their families, and I am the best of you to my family.", ref: "Jami' at-Tirmidhi" },
  { ar: "من لا يشكر الناس لا يشكر الله", en: "Whoever does not thank people does not thank Allah.", ref: "Abu Dawud & at-Tirmidhi" },
  { ar: "الحياء من الإيمان", en: "Modesty is part of faith.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "المؤمن للمؤمن كالبنيان يشد بعضه بعضا", en: "The believer to another believer is like a building whose parts support one another.", ref: "Sahih al-Bukhari & Muslim" },
  { ar: "دع ما يريبك إلى ما لا يريبك", en: "Leave what makes you doubt for what does not make you doubt.", ref: "at-Tirmidhi & an-Nasa'i" },
  { ar: "أفشوا السلام بينكم", en: "Spread the greeting of peace among yourselves.", ref: "Sahih Muslim" },
];

export function hadithOfTheDay(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  return HADITH[(dayOfYear + date.getFullYear()) % HADITH.length];
}
