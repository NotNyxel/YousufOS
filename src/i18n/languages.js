// Interface languages. `locale` drives dates/numbers (Western digits by default).
export const LANGUAGES = [
  { code: "en", name: "English", dir: "ltr", locale: "en-US" },
  { code: "ar", name: "العربية", dir: "rtl", locale: "ar-AE-u-nu-latn" },
  { code: "ur", name: "اردو", dir: "rtl", locale: "ur-PK-u-nu-latn" },
  { code: "fa", name: "فارسی", dir: "rtl", locale: "fa-IR-u-nu-latn" },
  { code: "hi", name: "हिन्दी", dir: "ltr", locale: "hi-IN" },
  { code: "bn", name: "বাংলা", dir: "ltr", locale: "bn-BD-u-nu-latn" },
  { code: "ml", name: "മലയാളം", dir: "ltr", locale: "ml-IN" },
  { code: "ta", name: "தமிழ்", dir: "ltr", locale: "ta-IN" },
  { code: "tl", name: "Filipino", dir: "ltr", locale: "fil-PH" },
  { code: "id", name: "Bahasa Indonesia", dir: "ltr", locale: "id-ID" },
  { code: "ms", name: "Bahasa Melayu", dir: "ltr", locale: "ms-MY" },
  { code: "tr", name: "Türkçe", dir: "ltr", locale: "tr-TR" },
  { code: "fr", name: "Français", dir: "ltr", locale: "fr-FR" },
  { code: "es", name: "Español", dir: "ltr", locale: "es-ES" },
  { code: "pt", name: "Português", dir: "ltr", locale: "pt-BR" },
  { code: "de", name: "Deutsch", dir: "ltr", locale: "de-DE" },
  { code: "it", name: "Italiano", dir: "ltr", locale: "it-IT" },
  { code: "ru", name: "Русский", dir: "ltr", locale: "ru-RU" },
  { code: "zh", name: "中文", dir: "ltr", locale: "zh-CN" },
  { code: "ja", name: "日本語", dir: "ltr", locale: "ja-JP" },
  { code: "ko", name: "한국어", dir: "ltr", locale: "ko-KR" },
  { code: "sw", name: "Kiswahili", dir: "ltr", locale: "sw-KE" },
];

export const langInfo = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
