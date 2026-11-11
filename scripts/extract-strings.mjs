// Lists every interface string (for the translation files in src/i18n/locales).
// Usage: node scripts/extract-strings.mjs > /tmp/strings.json
import fs from "node:fs";
import path from "node:path";

const files = [];
const walk = (d) => fs.readdirSync(d).forEach((f) => {
  const p = path.join(d, f);
  if (fs.statSync(p).isDirectory()) walk(p);
  else if (/\.(jsx?|mjs)$/.test(f) && !p.includes("i18n") && !p.includes("data/")) files.push(p);
});
walk("src");

const out = new Set();
const add = (s) => {
  s = s.trim();
  if (!s || /^(https?:|#|\/|~|[a-z0-9_-]+$)/.test(s) || /^[\d\s.%:+-]+$/.test(s)) return;
  out.add(s);
};
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)+)"/g)) add(m[1]);
  for (const m of src.matchAll(/\b(?:label|hint|desc|help|name|en)(?:=|:\s*)"((?:[^"\\]|\\.)+)"/g)) add(m[1]);
  for (const m of src.matchAll(/<SectionTitle>([^<{]+)<\/SectionTitle>/g)) add(m[1]);
  for (const m of src.matchAll(/^\s+(?:makkah|madinah|mishary|dubai|sheikhzayed): "([^"]+)"/gm)) add(m[1]);
}
console.log(JSON.stringify([...out].sort(), null, 1));
