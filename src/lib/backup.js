// Backups: all settings in one file. Restoring replaces them.
export function makeBackup(settings, { secrets = true } = {}) {
  const copy = JSON.parse(JSON.stringify(settings));
  if (!secrets) {
    if (copy.jellyfin) {
      copy.jellyfin.auth = null;
      copy.jellyfin.accounts = [];
    }
    if (copy.updates) copy.updates.token = "";
    if (copy.admin) copy.admin.devices = [];
  }
  return { app: "YousufOS", version: __APP_VERSION__, created: new Date().toISOString(), settings: copy };
}
export function backupName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `yousufos-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
export function readBackup(text) {
  const data = typeof text === "string" ? JSON.parse(text) : text;
  if (data?.app !== "YousufOS" || typeof data.settings !== "object") throw new Error("This isn't a YousufOS backup.");
  return data.settings;
}
