// Jellyfin server API (written against Jellyfin 12.4).
// In the desktop app, requests go through Rust (no CORS / mixed-content
// limits on a plain-http server at home); images and music stream through
// the same relay as Live TV.
import { invoke, isTauri } from "../lib/platform";
import { relayUrl } from "../lib/iptv";

export const TICKS = 10_000_000;
const VERSION = __APP_VERSION__;

export function normalizeServer(raw) {
  // An address copied from the browser ("…:8096/web/#/home", "…/web/index.html")
  // points at the web app, not the server: keep only the server part. A base
  // path such as "/jellyfin" (reverse proxy) stays.
  let v = String(raw || "")
    .trim()
    .replace(/[#?].*$/, "")
    .replace(/\/web(\/.*)?$/i, "")
    .replace(/\/index\.html$/i, "")
    .replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  if (!/^https?:\/\/[^/]+:\d+/i.test(v) && /^http:/i.test(v)) v = v.replace(/^(http:\/\/[^/]+)/i, "$1:8096");
  return v;
}

export function deviceId() {
  try {
    let id = localStorage.getItem("yousufos.jellyfin.device");
    if (!id) {
      id = "yousufos-" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem("yousufos.jellyfin.device", id);
    }
    return id;
  } catch {
    return "yousufos-tv";
  }
}

export class JellyfinError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.status = status;
  }
}

export function createClient(server, auth = {}) {
  const base = normalizeServer(server);
  const authHeader = (token = auth.token) =>
    `MediaBrowser Client="YousufOS", Device="YousufOS TV", DeviceId="${deviceId()}", Version="${VERSION}"` + (token ? `, Token="${token}"` : "");

  async function request(method, path, { query, body, token, timeout = 15000 } = {}) {
    const qs = query
      ? "?" +
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(",") : v)}`)
          .join("&")
      : "";
    const url = base + path + (qs.length > 1 ? qs : "");
    const headers = { Authorization: authHeader(token), Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let status, text;
    if (isTauri()) {
      const r = await invoke("http_request", {
        method,
        url,
        headers: Object.entries(headers),
        body: body === undefined ? null : JSON.stringify(body),
        timeoutMs: timeout,
      });
      [status, text] = r;
    } else {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
        status = res.status;
        text = await res.text();
      } catch (e) {
        throw new JellyfinError(0, String(e?.message || e));
      } finally {
        clearTimeout(timer);
      }
    }
    if (status === 0 || status >= 400) throw new JellyfinError(status, text?.slice(0, 200));
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  const get = (path, query) => request("GET", path, { query });
  const post = (path, body, query) => request("POST", path, { body: body ?? {}, query });
  const del = (path, query) => request("DELETE", path, { query });
  const uid = auth.userId;

  const FIELDS = "Overview,Genres,PrimaryImageAspectRatio,ProductionYear,OfficialRating,CommunityRating,RunTimeTicks,ChildCount,Taglines";

  return {
    base,
    authHeader,
    publicInfo: () =>
      request("GET", "/System/Info/Public", { timeout: 6000 }).then((r) => {
        // A web page instead of the server's answer: the address is wrong.
        if (!r || typeof r !== "object" || !r.Id) throw new JellyfinError(404, "That address isn't a Jellyfin server");
        return r;
      }),
    publicUsers: () => get("/Users/Public"),
    quickConnectEnabled: () => get("/QuickConnect/Enabled"),
    // POST since Jellyfin 10.9; older servers only answer GET.
    quickConnectStart: () => post("/QuickConnect/Initiate").catch((e) => (e.status === 405 || e.status === 404 ? get("/QuickConnect/Initiate") : Promise.reject(e))),
    quickConnectState: (secret) => get("/QuickConnect/Connect", { secret }),
    quickConnectFinish: (secret) => post("/Users/AuthenticateWithQuickConnect", { Secret: secret }),
    signIn: (username, password) => post("/Users/AuthenticateByName", { Username: username, Pw: password }),
    signOut: () => post("/Sessions/Logout").catch(() => {}),
    me: () => get("/Users/Me"),

    views: () => get("/UserViews", { userId: uid }).then((r) => r?.Items || []),
    resume: (limit = 16) =>
      get("/UserItems/Resume", { userId: uid, limit, mediaTypes: "Video", fields: FIELDS, enableImageTypes: "Primary,Backdrop,Thumb", imageTypeLimit: 1 }).then((r) => r?.Items || []),
    nextUp: (limit = 16, seriesId) =>
      get("/Shows/NextUp", { userId: uid, limit, seriesId, fields: FIELDS, enableResumable: false, enableRewatching: false }).then((r) => r?.Items || []),
    latest: (parentId, limit = 16) => get("/Items/Latest", { userId: uid, parentId, limit, fields: FIELDS, groupItems: true }).then((r) => r || []),
    items: (query) => get("/Items", { userId: uid, fields: FIELDS, enableTotalRecordCount: true, ...query }),
    item: (id) => get(`/Items/${id}`, { userId: uid }),
    similar: (id, limit = 12) => get(`/Items/${id}/Similar`, { userId: uid, limit, fields: FIELDS }).then((r) => r?.Items || []),
    seasons: (seriesId) => get(`/Shows/${seriesId}/Seasons`, { userId: uid, fields: FIELDS }).then((r) => r?.Items || []),
    episodes: (seriesId, seasonId) =>
      get(`/Shows/${seriesId}/Episodes`, { userId: uid, seasonId, fields: FIELDS + ",MediaStreams" }).then((r) => r?.Items || []),
    segments: (id) => get(`/MediaSegments/${id}`, { includeSegmentTypes: "Intro,Recap,Outro" }).then((r) => r?.Items || []).catch(() => []),
    playbackInfo: (id) => post(`/Items/${id}/PlaybackInfo`, {}, { userId: uid }),

    setFavorite: (id, on) => (on ? post(`/UserFavoriteItems/${id}`, undefined, { userId: uid }) : del(`/UserFavoriteItems/${id}`, { userId: uid })),
    setPlayed: (id, on) => (on ? post(`/UserPlayedItems/${id}`, undefined, { userId: uid }) : del(`/UserPlayedItems/${id}`, { userId: uid })),

    // Watch together (SyncPlay) and the server clock.
    syncplay: (method, path, body) => request(method, path, { body }),

    reportStart: (info) => post("/Sessions/Playing", info).catch(() => {}),
    reportProgress: (info) => post("/Sessions/Playing/Progress", info).catch(() => {}),
    reportStop: (info) => post("/Sessions/Playing/Stopped", info).catch(() => {}),

    // ---- addresses
    image(item, type = "Primary", { height, width, fromSeries = false } = {}) {
      if (!item) return null;
      let id = item.Id;
      let tag;
      if (type === "Backdrop") {
        if (item.BackdropImageTags?.length && !fromSeries) tag = item.BackdropImageTags[0];
        else if (item.ParentBackdropImageTags?.length) {
          id = item.ParentBackdropItemId;
          tag = item.ParentBackdropImageTags[0];
        }
      } else if (type === "Primary") {
        if (fromSeries && item.SeriesId && item.SeriesPrimaryImageTag) {
          id = item.SeriesId;
          tag = item.SeriesPrimaryImageTag;
        } else if (item.ImageTags?.Primary) tag = item.ImageTags.Primary;
        else if (item.AlbumId && item.AlbumPrimaryImageTag) {
          id = item.AlbumId;
          tag = item.AlbumPrimaryImageTag;
        }
      } else if (item.ImageTags?.[type]) tag = item.ImageTags[type];
      else if (type === "Thumb" && item.ParentThumbItemId && item.ParentThumbImageTag) {
        id = item.ParentThumbItemId;
        tag = item.ParentThumbImageTag;
      }
      if (!tag) return null;
      const q = new URLSearchParams({ tag, quality: "90" });
      if (height) q.set("fillHeight", Math.round(height));
      if (width) q.set("fillWidth", Math.round(width));
      return media(`${base}/Items/${id}/Images/${type}?${q}`);
    },
    // Original file, played as-is (mpv handles every format).
    streamUrl: (item, mediaSourceId) =>
      `${base}/${item.MediaType === "Audio" ? "Audio" : "Videos"}/${item.Id}/stream?static=true&mediaSourceId=${mediaSourceId || item.Id}&deviceId=${deviceId()}`,
    // Music in the launcher's own <audio> element.
    audioUrl(item) {
      const url = `${base}/Audio/${item.Id}/universal?container=mp3,aac,m4a,flac,ogg,opus,wav&audioCodec=aac&transcodingContainer=mp3&deviceId=${deviceId()}&userId=${uid}`;
      if (isTauri()) return relayUrl(url, { headers: { Authorization: authHeader() } });
      return url + `&api_key=${auth.token}`; // browser preview only
    },
  };
}

function media(url) {
  return isTauri() ? relayUrl(url) : url;
}

// ------------------------------------------------------------- formatting
export function runtime(ticks) {
  if (!ticks) return "";
  const m = Math.round(ticks / TICKS / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
}
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export function episodeCode(item) {
  if (item?.Type !== "Episode") return "";
  const s = item.ParentIndexNumber ?? "?";
  const e = item.IndexNumber ?? "?";
  return `S${s}:E${e}`;
}
export const progressOf = (item) => {
  const u = item?.UserData;
  if (!u) return 0;
  if (u.PlayedPercentage) return Math.min(100, u.PlayedPercentage);
  if (u.PlaybackPositionTicks && item.RunTimeTicks) return Math.min(100, (100 * u.PlaybackPositionTicks) / item.RunTimeTicks);
  return 0;
};
