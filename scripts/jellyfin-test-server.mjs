// Usage: node scripts/jellyfin-test-server.mjs [port] [media folder]   (developer tool: a stand-in Jellyfin server for testing the app, with SyncPlay)
// Test stand-in for a Jellyfin 12.4 server (shapes follow the official OpenAPI
// spec). Serves /srv/media. Only for developing YousufOS's Jellyfin client.
// Usage: node server.mjs [port] [media dir]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = +process.argv[2] || 8096;
const ROOT = process.argv[3] || "/srv/media";
const SERVER_ID = "8808f421893947b78708e5b37c52b912";
const USERS = [
  { Name: "Yousuf", Id: "a1b2c3d4e5f60718293a4b5c6d7e8f90", PASSWORD: "test" },
  { Name: "Guest", Id: "b2c3d4e5f60718293a4b5c6d7e8f90a1", PASSWORD: "guest" },
];
const USER = USERS[0];
const id = (s) => crypto.createHash("md5").update(s).digest("hex");
const TICKS = 10_000_000;
const items = new Map();
const children = new Map();
const userData = new Map();
const log = [];
const add = (it) => {
  items.set(it.Id, it);
  if (it.ParentId) (children.get(it.ParentId) || children.set(it.ParentId, []).get(it.ParentId)).push(it.Id);
  return it;
};
const tag = (s) => (s && fs.existsSync(s) ? id(s + fs.statSync(s).mtimeMs).slice(0, 12) : undefined);
const nfo = (f, k) => {
  try {
    const m = fs.readFileSync(f, "utf8").match(new RegExp(`<${k}>([^<]*)</${k}>`, "g"));
    return m ? m.map((x) => x.replace(/<[^>]+>/g, "")) : [];
  } catch {
    return [];
  }
};
const dur = { Movies: 150, Shows: 90, Music: 30 };
const streams = (kind) =>
  kind === "Audio"
    ? [{ Type: "Audio", Index: 0, Codec: "mp3", Language: null, DisplayTitle: "MP3 - Stereo", IsDefault: true }]
    : [
        { Type: "Video", Index: 0, Codec: "h264", DisplayTitle: "720p H264 SDR", Width: 1280, Height: 720 },
        { Type: "Audio", Index: 1, Codec: "aac", Language: "eng", Title: "English", DisplayTitle: "English - AAC - Stereo - Default", IsDefault: true },
        { Type: "Audio", Index: 2, Codec: "aac", Language: "ara", Title: "Arabic", DisplayTitle: "Arabic - AAC - Stereo" },
        { Type: "Subtitle", Index: 3, Codec: "subrip", Language: "eng", DisplayTitle: "English - SUBRIP", IsExternal: false, IsTextSubtitleStream: true },
      ];

function scan() {
  const libs = [
    ["Movies", "movies", "Movies"],
    ["Shows", "tvshows", "Shows"],
    ["Music", "music", "Music"],
  ];
  let added = 0;
  for (const [dir, ct, name] of libs) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    const lib = add({ Name: name, Id: id("lib" + dir), Type: "CollectionFolder", CollectionType: ct, IsFolder: true, ImageTags: {}, BackdropImageTags: [] });
    for (const d of fs.readdirSync(base).sort()) {
      const p = path.join(base, d);
      const date = new Date(Date.now() - 86400000 * (++added)).toISOString();
      if (ct === "movies") {
        const f = fs.readdirSync(p).find((x) => x.endsWith(".mkv"));
        const n = path.join(p, "movie.nfo");
        add({
          Name: nfo(n, "title")[0] || d, Id: id(p), Type: "Movie", MediaType: "Video", IsFolder: false, ParentId: lib.Id,
          ProductionYear: +nfo(n, "year")[0] || undefined, Overview: nfo(n, "plot")[0], Taglines: nfo(n, "tagline"),
          Genres: nfo(n, "genre"), CommunityRating: +nfo(n, "rating")[0], OfficialRating: nfo(n, "officialrating")[0],
          RunTimeTicks: dur.Movies * TICKS, DateCreated: date, _file: path.join(p, f), _poster: path.join(p, "poster.jpg"), _backdrop: path.join(p, "backdrop.jpg"),
        });
      } else if (ct === "tvshows") {
        const n = path.join(p, "tvshow.nfo");
        const series = add({
          Name: nfo(n, "title")[0] || d, Id: id(p), Type: "Series", IsFolder: true, ParentId: lib.Id, ProductionYear: +nfo(n, "year")[0],
          Overview: nfo(n, "plot")[0], Genres: nfo(n, "genre"), CommunityRating: +nfo(n, "rating")[0], DateCreated: date, Status: "Continuing",
          _poster: path.join(p, "poster.jpg"), _backdrop: path.join(p, "backdrop.jpg"),
        });
        for (const sd of fs.readdirSync(p).filter((x) => /^Season/.test(x)).sort()) {
          const sp = path.join(p, sd);
          const sn = +sd.match(/\d+/)[0];
          const season = add({ Name: sd, Id: id(sp), Type: "Season", IsFolder: true, ParentId: series.Id, SeriesId: series.Id, SeriesName: series.Name, IndexNumber: sn, _poster: series._poster });
          for (const ef of fs.readdirSync(sp).filter((x) => x.endsWith(".mkv")).sort()) {
            const en = +ef.match(/E(\d+)/)[1];
            const b = path.join(sp, ef.replace(/\.mkv$/, ""));
            add({
              Name: nfo(b + ".nfo", "title")[0] || ef, Id: id(b), Type: "Episode", MediaType: "Video", IsFolder: false, ParentId: season.Id,
              SeriesId: series.Id, SeriesName: series.Name, SeasonId: season.Id, SeasonName: sd, IndexNumber: en, ParentIndexNumber: sn,
              Overview: nfo(b + ".nfo", "plot")[0], RunTimeTicks: dur.Shows * TICKS, DateCreated: new Date(Date.parse(date) + sn * 1000 + en).toISOString(),
              _file: b + ".mkv", _primary: b + "-thumb.jpg", _backdrop: series._backdrop,
            });
          }
        }
      } else if (ct === "music") {
        const artist = add({ Name: d, Id: id(p), Type: "MusicArtist", IsFolder: true, ParentId: lib.Id });
        for (const ad of fs.readdirSync(p)) {
          const ap = path.join(p, ad);
          const album = add({ Name: ad, Id: id(ap), Type: "MusicAlbum", IsFolder: true, ParentId: artist.Id, AlbumArtist: d, DateCreated: date });
          for (const tf of fs.readdirSync(ap).sort())
            add({ Name: tf.replace(/^\d+ - |\.mp3$/g, ""), Id: id(path.join(ap, tf)), Type: "Audio", MediaType: "Audio", IsFolder: false, ParentId: album.Id,
              AlbumId: album.Id, Album: ad, AlbumArtist: d, Artists: [d], IndexNumber: +tf.slice(0, 2), RunTimeTicks: dur.Music * TICKS, _file: path.join(ap, tf) });
        }
      }
    }
  }
}
scan();

const ud = (i) => {
  const u = userData.get(i.Id) || { PlaybackPositionTicks: 0, PlayCount: 0, IsFavorite: false, Played: false };
  const out = { ...u, Key: i.Id, ItemId: i.Id };
  if (u.PlaybackPositionTicks && i.RunTimeTicks) out.PlayedPercentage = (100 * u.PlaybackPositionTicks) / i.RunTimeTicks;
  if (i.Type === "Series" || i.Type === "Season") {
    const eps = descendants(i.Id).filter((x) => x.Type === "Episode");
    out.UnplayedItemCount = eps.filter((x) => !userData.get(x.Id)?.Played).length;
    out.Played = out.UnplayedItemCount === 0;
  }
  return out;
};
const descendants = (pid) => (children.get(pid) || []).flatMap((c) => [items.get(c), ...descendants(c)]);
function dto(i) {
  const o = { ServerId: SERVER_ID, ...Object.fromEntries(Object.entries(i).filter(([k]) => !k.startsWith("_"))) };
  o.ImageTags = {};
  if (tag(i._poster || i._primary)) o.ImageTags.Primary = tag(i._poster || i._primary);
  o.BackdropImageTags = tag(i._backdrop) ? [tag(i._backdrop)] : [];
  if (i.Type === "Episode" || i.Type === "Season") {
    const s = items.get(i.SeriesId);
    o.SeriesPrimaryImageTag = tag(s._poster);
    o.ParentBackdropItemId = s.Id;
    o.ParentBackdropImageTags = [tag(s._backdrop)];
  }
  if (i.Type === "Episode") o.ParentThumbItemId = undefined;
  if (i._file) {
    o.Container = path.extname(i._file).slice(1);
    o.MediaStreams = streams(i.Type);
    o.MediaSources = [{ Id: i.Id, Protocol: "File", Container: o.Container, Name: i.Name, SupportsDirectPlay: true, RunTimeTicks: i.RunTimeTicks, MediaStreams: o.MediaStreams, DefaultAudioStreamIndex: 1 }];
    o.PrimaryImageAspectRatio = i.Type === "Episode" ? 16 / 9 : 2 / 3;
  } else if (i._poster) o.PrimaryImageAspectRatio = 2 / 3;
  if (i.Type === "Series") o.ChildCount = (children.get(i.Id) || []).length;
  if (i.Type === "CollectionFolder") {
    o.Type = "CollectionFolder";
  }
  o.UserData = ud(i);
  return o;
}
const page = (arr, q) => {
  const start = +q.get("startIndex") || +q.get("StartIndex") || 0;
  const lim = +q.get("limit") || +q.get("Limit") || arr.length;
  return { Items: arr.slice(start, start + lim).map(dto), TotalRecordCount: arr.length, StartIndex: start };
};
const list = (q, k) => (q.get(k) || q.get(k[0].toUpperCase() + k.slice(1)) || "").split(",").filter(Boolean);

// ------------------------------------------------------------ auth
const tokens = new Set(["test-token", "guest-token"]);
const tokenUser = new Map([["test-token", USERS[0]], ["guest-token", USERS[1]]]);
const qc = new Map(); // secret -> {Code, Authenticated}
function tokenOf(req) {
  const h = req.headers.authorization || req.headers["x-emby-authorization"] || "";
  return h.match(/Token="([^"]+)"/)?.[1] || null;
}
function auth(req) {
  const t = tokenOf(req);
  return t && tokens.has(t);
}
const userDto = (U = USER) => ({
  Name: U.Name, Id: U.Id, ServerId: SERVER_ID, HasPassword: true, HasConfiguredPassword: true, PrimaryImageTag: undefined,
  Policy: { IsAdministrator: true }, Configuration: { PlayDefaultAudioTrack: true, SubtitleMode: "Default" },
});
const session = (U = USER) => {
  const t = crypto.randomBytes(16).toString("hex");
  tokens.add(t);
  tokenUser.set(t, U);
  return { User: userDto(U), AccessToken: t, ServerId: SERVER_ID, SessionInfo: { Id: crypto.randomBytes(8).toString("hex"), UserId: U.Id } };
};

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function file(req, res, f, type) {
  if (!f || !fs.existsSync(f)) return send(res, 404, "");
  const size = fs.statSync(f).size;
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  const h = { "Content-Type": type, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
  if (range) {
    const s = +range[1] || 0;
    const e = range[2] ? +range[2] : size - 1;
    res.writeHead(206, { ...h, "Content-Range": `bytes ${s}-${e}/${size}`, "Content-Length": e - s + 1 });
    fs.createReadStream(f, { start: s, end: e }).pipe(res);
  } else {
    res.writeHead(200, { ...h, "Content-Length": size });
    fs.createReadStream(f).pipe(res);
  }
}
const body = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); });

// ------------------------------------------------------------ websocket + SyncPlay
const sockets = new Map(); // token -> Set(socket)
function wsSend(sock, obj) {
  const data = Buffer.from(JSON.stringify(obj));
  let head;
  if (data.length < 126) head = Buffer.from([0x81, data.length]);
  else if (data.length < 65536) head = Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
  else {
    head = Buffer.alloc(10);
    head[0] = 0x81;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(data.length), 2);
  }
  try {
    sock.write(Buffer.concat([head, data]));
  } catch {}
}
const toUser = (tok, msg) => (sockets.get(tok) || []).forEach((s) => wsSend(s, msg));
const groups = new Map();
const nameOf = (tok) => tokenUser.get(tok)?.Name || "?";
const info = (g) => ({ GroupId: g.GroupId, GroupName: g.GroupName, State: g.state, Participants: [...g.members].map(nameOf), LastUpdatedAt: new Date().toISOString() });
const upd = (g, tok, Type, Data) => toUser(tok, { MessageType: "SyncPlayGroupUpdate", MessageId: crypto.randomUUID(), Data: { GroupId: g.GroupId, Type, Data } });
const all = (g, Type, Data) => g.members.forEach((m) => upd(g, m, Type, Data));
const cmd = (g, Command, When, PositionTicks) =>
  g.members.forEach((m) => toUser(m, { MessageType: "SyncPlayCommand", MessageId: crypto.randomUUID(), Data: { GroupId: g.GroupId, PlaylistItemId: g.queue[g.index]?.PlaylistItemId, When, PositionTicks, Command, EmittedAt: new Date().toISOString() } }));
const queueMsg = (g, Reason) => ({ Reason, LastUpdate: new Date().toISOString(), Playlist: g.queue, PlayingItemIndex: g.index, StartPositionTicks: g.pos, IsPlaying: true, ShuffleMode: "Sorted", RepeatMode: "RepeatNone" });
const nowPos = (g) => (g.state === "Playing" ? g.pos + Math.max(0, Date.now() - g.startedAt) * 10000 : g.pos);
const setState = (g, s) => {
  g.state = s;
  all(g, "StateUpdate", { State: s, Reason: "x" });
};
const groupOf = (tok) => [...groups.values()].find((g) => g.members.has(tok));
function syncplay(req, res, p, tok, b) {
  if (!tok || !tokens.has(tok)) return send(res, 401, "");
  const g = groupOf(tok);
  const done = () => send(res, 204, "");
  synclog.push(`${nameOf(tok)} ${p} ${JSON.stringify(b).slice(0, 120)}`);
  switch (p) {
    case "/SyncPlay/List":
      return send(res, 200, [...groups.values()].map(info));
    case "/SyncPlay/New": {
      if (g) leave(g, tok);
      const ng = { GroupId: crypto.randomUUID(), GroupName: b.GroupName || "Group", members: new Set(), queue: [], index: -1, pos: 0, state: "Idle", ready: new Set(), startedAt: 0 };
      groups.set(ng.GroupId, ng);
      join(ng, tok);
      return done();
    }
    case "/SyncPlay/Join": {
      const ng = groups.get(b.GroupId);
      if (!ng) return send(res, 400, "no group");
      if (g && g !== ng) leave(g, tok);
      join(ng, tok);
      return done();
    }
    case "/SyncPlay/Leave":
      if (g) leave(g, tok);
      return done();
    case "/SyncPlay/Ping":
      return done();
  }
  if (!g) return send(res, 400, "not in a group");
  switch (p) {
    case "/SyncPlay/SetNewQueue":
      g.queue = (b.PlayingQueue || []).map((ItemId) => ({ ItemId, PlaylistItemId: crypto.randomUUID() }));
      g.index = b.PlayingItemPosition || 0;
      g.pos = b.StartPositionTicks || 0;
      g.ready.clear();
      g.wasPlaying = true;
      setState(g, "Waiting");
      all(g, "PlayQueue", queueMsg(g, "NewPlaylist"));
      return done();
    case "/SyncPlay/NextItem":
    case "/SyncPlay/PreviousItem":
      g.index = Math.max(0, Math.min(g.queue.length - 1, g.index + (p.endsWith("Next" + "Item") ? 1 : -1)));
      g.pos = 0;
      g.ready.clear();
      g.wasPlaying = true;
      setState(g, "Waiting");
      all(g, "PlayQueue", queueMsg(g, p.endsWith("NextItem") ? "NextItem" : "PreviousItem"));
      return done();
    case "/SyncPlay/Buffering":
      return done();
    case "/SyncPlay/Ready":
      g.ready.add(tok);
      if (g.state === "Waiting" && [...g.members].every((m) => g.ready.has(m))) {
        if (g.wasPlaying) {
          const When = Date.now() + 600;
          g.startedAt = When;
          setState(g, "Playing");
          cmd(g, "Unpause", new Date(When).toISOString(), g.pos);
        } else setState(g, "Paused");
      }
      return done();
    case "/SyncPlay/Pause":
      if (g.state === "Playing") {
        g.pos = nowPos(g);
        setState(g, "Paused");
        cmd(g, "Pause", new Date().toISOString(), g.pos);
      }
      return done();
    case "/SyncPlay/Unpause":
      if (g.state === "Paused") {
        const When = Date.now() + 600;
        g.startedAt = When;
        setState(g, "Playing");
        cmd(g, "Unpause", new Date(When).toISOString(), g.pos);
      }
      return done();
    case "/SyncPlay/Seek":
      g.wasPlaying = g.state === "Playing" || g.state === "Waiting";
      g.pos = b.PositionTicks || 0;
      g.ready.clear();
      setState(g, "Waiting");
      cmd(g, "Seek", new Date().toISOString(), g.pos);
      return done();
    case "/SyncPlay/Stop":
      cmd(g, "Stop", new Date().toISOString(), nowPos(g));
      setState(g, "Idle");
      return done();
  }
  send(res, 404, "");
}
function join(g, tok) {
  g.members.add(tok);
  upd(g, tok, "GroupJoined", info(g));
  g.members.forEach((m) => m !== tok && upd(g, m, "UserJoined", nameOf(tok)));
  if (g.queue.length) {
    g.ready.delete(tok);
    g.pos = nowPos(g);
    upd(g, tok, "PlayQueue", queueMsg(g, "NewPlaylist"));
  }
}
function leave(g, tok) {
  g.members.delete(tok);
  upd(g, tok, "GroupLeft", g.GroupId);
  g.members.forEach((m) => upd(g, m, "UserLeft", nameOf(tok)));
  if (!g.members.size) groups.delete(g.GroupId);
}
const synclog = [];

const httpServer = http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const p = u.pathname.replace(/\/+$/, "") || "/";
    const q = u.searchParams;
    log.push(`${req.method} ${req.url}`);
    if (log.length > 500) log.shift();
    if (req.method === "OPTIONS") return send(res, 204, "");
    if (p === "/_test/log") return send(res, 200, log.join("\n"), "text/plain");
    if (p === "/_test/approve") {
      for (const v of qc.values()) if (v.Code === q.get("code")) v.Authenticated = true;
      return send(res, 200, "ok", "text/plain");
    }
    if (p === "/_test/userdata") return send(res, 200, Object.fromEntries(userData));
    if (p === "/_test/synclog") return send(res, 200, synclog.join("\n"), "text/plain");
    if (p === "/_test/groups") return send(res, 200, [...groups.values()].map((g) => ({ ...info(g), pos: nowPos(g), index: g.index })));
    if (p === "/GetUtcTime") return send(res, 200, { RequestReceptionTime: new Date().toISOString(), ResponseTransmissionTime: new Date().toISOString() });
    if (p === "/System/Info/Public") return send(res, 200, { LocalAddress: `http://127.0.0.1:${PORT}`, ServerName: "TEST-SERVER", Version: "12.4.0", ProductName: "Jellyfin Server", OperatingSystem: "", Id: SERVER_ID, StartupWizardCompleted: true });
    if (p === "/Users/Public") return send(res, 200, USERS.map((U) => userDto(U)));
    if (p === "/QuickConnect/Enabled") return send(res, 200, "true");
    if (p === "/QuickConnect/Initiate" && req.method === "POST") {
      const Secret = crypto.randomBytes(16).toString("hex");
      const Code = String(100000 + crypto.randomInt(900000));
      qc.set(Secret, { Code, Authenticated: false });
      return send(res, 200, { Authenticated: false, Secret, Code, DeviceId: "x", DeviceName: "x", AppName: "x", AppVersion: "x", DateAdded: new Date().toISOString() });
    }
    if (p === "/QuickConnect/Connect") {
      const v = qc.get(q.get("secret"));
      return v ? send(res, 200, { Authenticated: v.Authenticated, Secret: q.get("secret"), Code: v.Code }) : send(res, 404, "Unknown secret");
    }
    if (p === "/Users/AuthenticateWithQuickConnect") {
      const b = await body(req);
      return qc.get(b.Secret)?.Authenticated ? send(res, 200, session()) : send(res, 401, "");
    }
    if (p === "/Users/AuthenticateByName") {
      const b = await body(req);
      const U = USERS.find((x) => x.Name.toLowerCase() === String(b.Username).toLowerCase() && x.PASSWORD === b.Pw);
      return U ? send(res, 200, session(U)) : send(res, 401, "Invalid username or password");
    }
    const img = p.match(/^\/Items\/([0-9a-f]+)\/Images\/(Primary|Backdrop|Thumb|Logo)(?:\/\d+)?$/);
    if (img) {
      const it = items.get(img[1]);
      const f = it && (img[2] === "Backdrop" ? it._backdrop : img[2] === "Primary" ? it._poster || it._primary : null);
      return file(req, res, f, "image/jpeg");
    }
    const st = p.match(/^\/(?:Videos|Audio)\/([0-9a-f]+)\/(?:stream(?:\.\w+)?|universal)$/);
    if (st) {
      if (!auth(req) && q.get("api_key") !== "test-token") return send(res, 401, "");
      const it = items.get(st[1]);
      return file(req, res, it?._file, it?.Type === "Audio" ? "audio/mpeg" : "video/x-matroska");
    }
    if (!auth(req)) return send(res, 401, "");
    if (p === "/Users/Me") return send(res, 200, userDto());
    if (p === "/Sessions/Logout") return send(res, 204, "");
    if (p === "/UserViews") return send(res, 200, page([...items.values()].filter((i) => i.Type === "CollectionFolder"), q));
    if (p === "/UserItems/Resume") {
      const arr = [...items.values()].filter((i) => i._file && i.Type !== "Audio" && userData.get(i.Id)?.PlaybackPositionTicks > 0 && !userData.get(i.Id)?.Played)
        .sort((a, b) => (userData.get(b.Id).LastPlayedDate || "").localeCompare(userData.get(a.Id).LastPlayedDate || ""));
      return send(res, 200, page(arr, q));
    }
    if (p === "/Shows/NextUp") {
      const out = [];
      for (const s of [...items.values()].filter((i) => i.Type === "Series")) {
        const eps = descendants(s.Id).filter((x) => x.Type === "Episode").sort((a, b) => a.ParentIndexNumber - b.ParentIndexNumber || a.IndexNumber - b.IndexNumber);
        const lastPlayed = eps.map((e, n) => (userData.get(e.Id)?.Played ? n : -1)).reduce((a, b) => Math.max(a, b), -1);
        if (lastPlayed >= 0 && eps[lastPlayed + 1]) out.push(eps[lastPlayed + 1]);
      }
      return send(res, 200, page(out, q));
    }
    if (p === "/Items/Latest") {
      const pid = q.get("parentId");
      let arr = descendants(pid).filter((i) => ["Movie", "Episode", "MusicAlbum"].includes(i.Type));
      // Episodes group into their series (groupItems default true).
      const seen = new Set();
      arr = arr.sort((a, b) => b.DateCreated.localeCompare(a.DateCreated)).map((i) => (i.Type === "Episode" ? items.get(i.SeriesId) : i))
        .filter((i) => !seen.has(i.Id) && seen.add(i.Id));
      return send(res, 200, arr.slice(0, +q.get("limit") || 16).map(dto));
    }
    if (p === "/Items") {
      let arr = q.get("parentId") ? (q.get("recursive") === "true" ? descendants(q.get("parentId")) : (children.get(q.get("parentId")) || []).map((c) => items.get(c))) : [...items.values()];
      const types = list(q, "includeItemTypes");
      if (types.length) arr = arr.filter((i) => types.includes(i.Type));
      if (q.get("artistIds")) arr = [...items.values()].filter((i) => i.Type === "MusicAlbum" && items.get(i.ParentId)?.Id === q.get("artistIds"));
      if (q.get("isPlayed") === "false") arr = arr.filter((i) => !ud(i).Played);
      if (q.get("ids")) arr = q.get("ids").split(",").map((x) => items.get(x)).filter(Boolean);
      if (q.get("isFavorite") === "true") arr = arr.filter((i) => userData.get(i.Id)?.IsFavorite);
      if (q.get("genres")) arr = arr.filter((i) => (i.Genres || []).includes(q.get("genres")));
      const term = (q.get("searchTerm") || "").toLowerCase();
      if (term) arr = arr.filter((i) => i.Name.toLowerCase().includes(term));
      const sort = (q.get("sortBy") || "SortName").split(",")[0];
      const ord = q.get("sortOrder") === "Descending" ? -1 : 1;
      const key = { SortName: (i) => i.Name.replace(/^The /, ""), DateCreated: (i) => i.DateCreated || "", PremiereDate: (i) => String(i.ProductionYear || 0),
        ProductionYear: (i) => String(i.ProductionYear || 0), CommunityRating: (i) => String(i.CommunityRating || 0).padStart(5, "0"), Random: () => String(Math.random()) }[sort] || ((i) => i.Name);
      arr = [...arr].sort((a, b) => key(a).localeCompare(key(b)) * ord);
      return send(res, 200, page(arr, q));
    }
    const one = p.match(/^\/Items\/([0-9a-f]+)$/);
    if (one) return items.get(one[1]) ? send(res, 200, dto(items.get(one[1]))) : send(res, 404, "");
    const sim = p.match(/^\/Items\/([0-9a-f]+)\/Similar$/);
    if (sim) {
      const it = items.get(sim[1]);
      return send(res, 200, page([...items.values()].filter((i) => i.Type === it?.Type && i.Id !== it.Id).slice(0, +q.get("limit") || 12), q));
    }
    const seasons = p.match(/^\/Shows\/([0-9a-f]+)\/Seasons$/);
    if (seasons) return send(res, 200, page((children.get(seasons[1]) || []).map((c) => items.get(c)), q));
    const eps = p.match(/^\/Shows\/([0-9a-f]+)\/Episodes$/);
    if (eps) {
      let arr = descendants(eps[1]).filter((i) => i.Type === "Episode");
      if (q.get("seasonId")) arr = arr.filter((i) => i.SeasonId === q.get("seasonId"));
      arr.sort((a, b) => a.ParentIndexNumber - b.ParentIndexNumber || a.IndexNumber - b.IndexNumber);
      return send(res, 200, page(arr, q));
    }
    const seg = p.match(/^\/MediaSegments\/([0-9a-f]+)$/);
    if (seg) {
      const it = items.get(seg[1]);
      const s = it?.Type === "Episode" ? [{ Id: id("seg" + it.Id), ItemId: it.Id, Type: "Intro", StartTicks: 2 * TICKS, EndTicks: 20 * TICKS }] : [];
      return send(res, 200, { Items: s, TotalRecordCount: s.length, StartIndex: 0 });
    }
    const pb = p.match(/^\/Items\/([0-9a-f]+)\/PlaybackInfo$/);
    if (pb) {
      const it = items.get(pb[1]);
      return send(res, 200, { MediaSources: dto(it).MediaSources, PlaySessionId: crypto.randomBytes(8).toString("hex") });
    }
    const fav = p.match(/^\/UserFavoriteItems\/([0-9a-f]+)$/);
    const played = p.match(/^\/UserPlayedItems\/([0-9a-f]+)$/);
    if (fav || played) {
      const it = items.get((fav || played)[1]);
      const targets = played && it.IsFolder ? descendants(it.Id).filter((x) => x._file) : [it];
      for (const x of targets) {
        const d = userData.get(x.Id) || { PlaybackPositionTicks: 0, PlayCount: 0, IsFavorite: false, Played: false };
        if (fav) d.IsFavorite = req.method === "POST";
        else {
          d.Played = req.method === "POST";
          d.PlaybackPositionTicks = 0;
        }
        userData.set(x.Id, d);
      }
      return send(res, 200, ud(it));
    }
    if (p.startsWith("/Sessions/Playing")) {
      const b = await body(req);
      const it = items.get(b.ItemId);
      if (it && b.PositionTicks != null) {
        const d = userData.get(it.Id) || { PlaybackPositionTicks: 0, PlayCount: 0, IsFavorite: false, Played: false };
        d.PlaybackPositionTicks = b.PositionTicks;
        d.LastPlayedDate = new Date().toISOString();
        if (p.endsWith("Stopped") && b.PositionTicks > it.RunTimeTicks * 0.9) {
          d.Played = true;
          d.PlayCount++;
          d.PlaybackPositionTicks = 0;
        }
        userData.set(it.Id, d);
      }
      return send(res, 204, "");
    }
    if (p.startsWith("/SyncPlay")) return syncplay(req, res, p, tokenOf(req), await body(req));
    send(res, 404, "Not found");
  })
  .listen(PORT, () => console.log(`mock jellyfin on :${PORT}, ${items.size} items`));
httpServer.on("upgrade", (req, sock) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname !== "/socket") return sock.destroy();
  const tok = tokenOf(req) || u.searchParams.get("api_key");
  if (!tok || !tokens.has(tok)) {
    sock.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return sock.destroy();
  }
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  if (!sockets.has(tok)) sockets.set(tok, new Set());
  sockets.get(tok).add(sock);
  synclog.push(`${nameOf(tok)} socket connected`);
  wsSend(sock, { MessageType: "ForceKeepAlive", Data: 60 });
  sock.on("data", (buf) => {
    if ((buf[0] & 0x0f) === 8) sock.end();
  });
  const drop = () => sockets.get(tok)?.delete(sock);
  sock.on("close", drop);
  sock.on("error", drop);
});
