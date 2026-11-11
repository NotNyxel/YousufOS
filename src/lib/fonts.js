// Interface fonts (Latin + Arabic pairs) and fonts for hadith / Qur'an text.
import "@fontsource-variable/inter";
import "@fontsource-variable/cairo";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/500.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/ibm-plex-sans-arabic/300.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource-variable/readex-pro";
import "@fontsource-variable/outfit";
import "@fontsource/scheherazade-new/400.css";
import "@fontsource/scheherazade-new/700.css";
import "@fontsource-variable/noto-naskh-arabic";

const KUFI = '"Noto Kufi Arabic Variable"';
export const UI_FONTS = {
  manrope: { label: "Manrope (default)", stack: `"Manrope Variable", ${KUFI}` },
  inter: { label: "Inter", stack: `"Inter Variable", ${KUFI}` },
  outfit: { label: "Outfit", stack: `"Outfit Variable", ${KUFI}` },
  cairo: { label: "Cairo", stack: '"Cairo Variable"' },
  tajawal: { label: "Tajawal", stack: '"Tajawal"' },
  plex: { label: "IBM Plex Sans Arabic", stack: '"IBM Plex Sans Arabic"' },
  readex: { label: "Readex Pro", stack: '"Readex Pro Variable"' },
};

export const ARABIC_FONTS = {
  amiri: { label: "Amiri", stack: '"Amiri"', quran: '"Amiri"' },
  scheherazade: { label: "Scheherazade", stack: '"Scheherazade New"', quran: '"Scheherazade New"' },
  naskh: { label: "Noto Naskh", stack: '"Noto Naskh Arabic Variable"', quran: '"Noto Naskh Arabic Variable"' },
  kufi: { label: "Noto Kufi", stack: KUFI, quran: KUFI },
};

export function applyFonts(root, s) {
  const ui = UI_FONTS[s.uiFont] || UI_FONTS.manrope;
  const ar = ARABIC_FONTS[s.arabicFont] || ARABIC_FONTS.amiri;
  root.style.setProperty("--ui-font", `${ui.stack}, system-ui, sans-serif`);
  root.style.setProperty("--quran-font", `${ar.stack}, serif`);
  root.style.setProperty("--mushaf-font", `${ar.quran}, serif`);
}
