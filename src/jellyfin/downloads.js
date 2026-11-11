// Films and episodes saved on the TV for watching when the Jellyfin PC is
// off or away (Videos/YousufOS/Jellyfin). Each video gets a small .json with
// its details and a poster beside it.
import { invoke, isTauri } from "../lib/platform";

const pad = (n) => String(n ?? 0).padStart(2, "0");
// Same clean-up as the TV does for file names (media.rs safe_name), per folder.
const safe = (seg) => {
  const t = String(seg)
    .replace(/./gu, (c) => (c.codePointAt(0) > 0x7f || /[A-Za-z0-9 \-_.,()'&+]/.test(c) ? c : "_"))
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return [...(t || "untitled")].slice(0, 120).join("");
};
const clean = (path) => path.split("/").map(safe).join("/");

export function downloadPaths(item) {
  const ext = (item.Container || item.MediaSources?.[0]?.Container || "mkv").split(",")[0];
  if (item.Type === "Episode") {
    const dir = `Shows/${item.SeriesName || "Show"}/Season ${item.ParentIndexNumber ?? 1}`;
    const base = `${item.SeriesName || "Show"} S${pad(item.ParentIndexNumber)}E${pad(item.IndexNumber)} - ${item.Name}`;
    return { dir: clean(dir), file: clean(`${dir}/${base}.${ext}`), meta: clean(`${dir}/${base}.json`), poster: clean(`${dir}/${base}.jpg`) };
  }
  const name = item.ProductionYear ? `${item.Name} (${item.ProductionYear})` : item.Name;
  const dir = `Movies/${name}`;
  return { dir: clean(dir), file: clean(`${dir}/${name}.${ext}`), meta: clean(`${dir}/${name}.json`), poster: clean(`${dir}/poster.jpg`) };
}

export async function startDownload(client, item) {
  if (!isTauri()) throw new Error("Downloads work in the desktop app.");
  const p = downloadPaths(item);
  const headers = [["Authorization", client.authHeader()]];
  const meta = {
    Id: item.Id, Name: item.Name, Type: item.Type, SeriesName: item.SeriesName, SeriesId: item.SeriesId, ParentIndexNumber: item.ParentIndexNumber,
    IndexNumber: item.IndexNumber, Overview: item.Overview, RunTimeTicks: item.RunTimeTicks, ProductionYear: item.ProductionYear,
    Genres: item.Genres, OfficialRating: item.OfficialRating, CommunityRating: item.CommunityRating, server: client.base, file: p.file, saved: Date.now(),
  };
  await invoke("media_write_json", { rel: p.meta, value: meta });
  // Picture (episode still, or the film's poster), straight from the server.
  const img = item.Type === "Episode" ? item.ImageTags?.Primary && `${client.base}/Items/${item.Id}/Images/Primary?fillWidth=720&quality=85` : item.ImageTags?.Primary && `${client.base}/Items/${item.Id}/Images/Primary?fillHeight=720&quality=85`;
  if (img) invoke("download_start", { req: { url: img, rel: p.poster, headers, quiet: true } }).catch(() => {});
  // The video itself: a job you can watch in the admin panel (Files).
  invoke("download_start", { req: { url: client.streamUrl(item), rel: p.file, headers, name: item.Type === "Episode" ? `${item.SeriesName} · ${item.Name}` : item.Name } }).catch((e) => console.warn("download", e));
  return p;
}

// Everything downloaded, with its details (from the .json files).
export async function listDownloads() {
  if (!isTauri()) return [];
  const r = await invoke("media_files", { kind: "downloads" });
  const files = r.files || [];
  const metas = files.filter((f) => f.name.endsWith(".json"));
  const out = [];
  for (const m of metas) {
    try {
      const meta = await invoke("media_read_json", { path: m.path });
      const video = files.find((f) => f.rel === meta.file || f.rel.normalize() === String(meta.file).normalize());
      if (!video) continue;
      const poster = files.find((f) => f.rel === m.rel.replace(/\.json$/, ".jpg")) || files.find((f) => f.rel === m.rel.replace(/[^/]+$/, "poster.jpg"));
      out.push({ ...meta, path: video.path, size: video.size, metaPath: m.path, posterPath: poster?.path || null });
    } catch {
      // A details file without its video (still downloading or removed).
    }
  }
  return out.sort((a, b) => (a.SeriesName || a.Name).localeCompare(b.SeriesName || b.Name) || (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) || (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
}

export async function deleteDownload(d) {
  await invoke("media_delete", { path: d.path });
  await invoke("media_delete", { path: d.metaPath }).catch(() => {});
  if (d.posterPath && !d.posterPath.endsWith("poster.jpg")) await invoke("media_delete", { path: d.posterPath }).catch(() => {});
}
