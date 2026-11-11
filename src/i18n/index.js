// Tiny i18n: the English text is the key. Each language file maps
// English -> translation; anything missing falls back to English.
import { langInfo } from "./languages";

const files = import.meta.glob("./locales/*.json", { eager: true, import: "default" });
const DICTS = Object.fromEntries(Object.entries(files).map(([p, d]) => [p.match(/(\w+)\.json$/)[1], d]));

export function makeT(code) {
  const dict = DICTS[code] || {};
  return (text, vars) => {
    let s = dict[text] || text;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
    return s;
  };
}

export function i18nFor(code) {
  const info = langInfo(code);
  return { t: makeT(info.code), lang: info.code, dir: info.dir, locale: info.locale };
}
