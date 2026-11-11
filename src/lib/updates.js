// New versions from GitHub releases (see README → Updates).
import { invoke, isTauri } from "./platform";

export const CURRENT = __APP_VERSION__;
export function newer(a, b) {
  const pa = String(a || "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
export async function checkUpdate(cfg) {
  if (!isTauri()) return { current: CURRENT, error: "Updates work in the desktop app." };
  if (!cfg?.repo) return { current: CURRENT, error: "Add the GitHub repository and token in Settings → System → Updates." };
  try {
    const r = await invoke("update_check", { repo: cfg.repo, token: cfg.token || "" });
    return { current: CURRENT, latest: r.version, available: newer(r.version, CURRENT) && !!r.deb, notes: r.notes || "", release: r };
  } catch (e) {
    return { current: CURRENT, error: String(e) };
  }
}
export async function installUpdate(cfg, release, onStep) {
  onStep?.("download");
  const path = await invoke("update_download", { token: cfg.token || "", debUrl: release.deb.url, debName: release.deb.name, sumsUrl: release.sums || null });
  onStep?.("install");
  await invoke("update_install", { path });
}
