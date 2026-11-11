// Notifications on phones through ntfy (free app for iPhone and Android:
// subscribe to the topic shown in Settings → Phone notifications).
import { invoke, isTauri } from "./platform";

export function newTopic() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return "yousufos-" + [...a].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

export async function notifyPhones(cfg, title, message, tags = "") {
  if (!cfg?.enabled || !cfg.topic) return;
  const server = (cfg.server || "https://ntfy.sh").replace(/\/+$/, "");
  const url = `${server}/${encodeURIComponent(cfg.topic)}`;
  // Header values must be plain ASCII; the title goes in the body when it isn't.
  const ascii = /^[\x20-\x7e]*$/.test(title);
  const headers = [["Priority", "high"]];
  if (ascii) headers.push(["Title", title]);
  if (tags) headers.push(["Tags", tags]);
  const body = ascii ? message : `${title}\n${message}`;
  try {
    if (isTauri()) await invoke("http_request", { method: "POST", url, headers, body, timeoutMs: 10000 });
    else await fetch(url, { method: "POST", headers: Object.fromEntries(headers), body });
  } catch (e) {
    console.warn("ntfy", e);
  }
}
