// New versions from GitHub releases (see README → Updates).
import { invoke, isAndroid, isTauri } from "./platform";

// The package for this TV: the Android .apk or the Ubuntu .deb.
const pkgOf = (r) => (isAndroid() ? r?.apk : r?.deb);

export const CURRENT = __APP_VERSION__;
export function newer(a, b) {
  const pa = String(a || "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
// Where YousufOS releases are published (used when no repository is set).
export const DEFAULT_REPO = "NotNyxel/YousufOS";
// "owner/name" from whatever was typed: a github.com link, .git, spaces.
export function repoName(v) {
  const m = String(v || "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .match(/^([\w.-]+)\/([\w.-]+)/);
  return m ? `${m[1]}/${m[2]}` : "";
}
// Tokens get pasted with spaces, quotes or line breaks around them.
export const cleanToken = (v) => String(v || "").replace(/[\s"'`]/g, "");
export async function checkUpdate(cfg) {
  if (!isTauri()) return { current: CURRENT, error: "Updates work in the desktop app." };
  const repo = repoName(cfg?.repo) || DEFAULT_REPO;
  try {
    const r = await invoke("update_check", { repo, token: cleanToken(cfg?.token) });
    return { current: CURRENT, latest: r.version, available: newer(r.version, CURRENT) && !!pkgOf(r), notes: r.notes || "", release: r };
  } catch (e) {
    return { current: CURRENT, error: String(e) };
  }
}
export async function installUpdate(cfg, release, onStep) {
  onStep?.("download");
  const path = await invoke("update_download", { token: cleanToken(cfg.token), debUrl: pkgOf(release).url, debName: pkgOf(release).name, sumsUrl: release.sums || null });
  onStep?.("install");
  await invoke("update_install", { path });
}
