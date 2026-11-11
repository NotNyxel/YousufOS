// Watch together (Jellyfin SyncPlay): screens in the same group play the
// same thing at the same moment. Pausing, seeking and starting something go
// to the server, which tells every screen (this one included) what to do and
// when, in server time.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri, listen, playerCommand } from "../lib/platform";
import { TICKS, deviceId } from "./api";

export function useSyncPlay({ client, auth, t, toast, playbackRef }) {
  const [group, setGroup] = useState(null); // GroupInfoDto
  const [state, setState] = useState("Idle");
  const [connected, setConnected] = useState(false);
  const offset = useRef(0); // server time − local time, ms
  const timers = useRef([]);
  const groupRef = useRef(null);
  const stateRef = useRef("Idle");
  useEffect(() => {
    groupRef.current = group;
    stateRef.current = state;
  });
  const serverNow = () => Date.now() + offset.current;
  const iso = (ms) => new Date(ms).toISOString();
  const api = useMemo(
    () => ({
      list: () => client.syncplay("GET", "/SyncPlay/List"),
      create: (name) => client.syncplay("POST", "/SyncPlay/New", { GroupName: name }),
      join: (id) => client.syncplay("POST", "/SyncPlay/Join", { GroupId: id }),
      leave: () => client.syncplay("POST", "/SyncPlay/Leave", {}),
      pause: () => client.syncplay("POST", "/SyncPlay/Pause", {}),
      unpause: () => client.syncplay("POST", "/SyncPlay/Unpause", {}),
      seek: (ticks) => client.syncplay("POST", "/SyncPlay/Seek", { PositionTicks: Math.max(0, Math.round(ticks)) }),
      next: (pid) => client.syncplay("POST", "/SyncPlay/NextItem", { PlaylistItemId: pid }),
      previous: (pid) => client.syncplay("POST", "/SyncPlay/PreviousItem", { PlaylistItemId: pid }),
      ready: (body) => client.syncplay("POST", "/SyncPlay/Ready", body),
      buffering: (body) => client.syncplay("POST", "/SyncPlay/Buffering", body),
      setQueue: (ids, index, startTicks) => client.syncplay("POST", "/SyncPlay/SetNewQueue", { PlayingQueue: ids, PlayingItemPosition: index, StartPositionTicks: startTicks }),
      ping: (ms) => client.syncplay("POST", "/SyncPlay/Ping", { Ping: Math.round(ms) }),
    }),
    [client],
  );

  // Clock: the server's time, measured against ours.
  const syncClock = useCallback(async () => {
    try {
      const t0 = Date.now();
      const r = await client.syncplay("GET", "/GetUtcTime");
      const t3 = Date.now();
      const t1 = Date.parse(r.RequestReceptionTime);
      const t2 = Date.parse(r.ResponseTransmissionTime);
      offset.current = (t1 - t0 + (t2 - t3)) / 2;
      api.ping(t3 - t0 - (t2 - t1)).catch(() => {});
    } catch {
      // Keep the last offset.
    }
  }, [client, api]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const at = (whenIso, fn) => {
    const delay = Date.parse(whenIso) - serverNow();
    if (delay <= 0) fn(-delay);
    else timers.current.push(setTimeout(() => fn(0), delay));
  };

  // ---- messages from the server
  const onMessage = useCallback(
    async (text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      const pb = playbackRef.current;
      if (msg.MessageType === "SyncPlayGroupUpdate") {
        const u = msg.Data || {};
        switch (u.Type) {
          case "GroupJoined":
            setGroup(u.Data);
            toast(t("Joined “{name}”", { name: u.Data?.GroupName || "" }));
            syncClock();
            break;
          case "GroupLeft":
          case "NotInGroup":
          case "GroupDoesNotExist":
            setGroup(null);
            clearTimers();
            break;
          case "UserJoined":
            toast(t("{name} joined", { name: u.Data }));
            break;
          case "UserLeft":
            toast(t("{name} left", { name: u.Data }));
            break;
          case "StateUpdate":
            setState(u.Data?.State || "Idle");
            break;
          case "PlayQueue": {
            const q = u.Data || {};
            const list = q.Playlist || [];
            if (!list.length || q.PlayingItemIndex < 0) return pb?.stop();
            const cur = pb?.current();
            const pid = list[q.PlayingItemIndex]?.PlaylistItemId;
            // Same item already open (a queue edit): nothing to reload.
            if (cur?.sync && cur.playlistItemIds?.[cur.index] === pid && !["NewPlaylist", "SetCurrentItem", "NextItem", "PreviousItem"].includes(q.Reason)) return;
            const ids = list.map((x) => x.ItemId);
            const r = await client.items({ ids: ids.join(","), fields: "MediaSources,MediaStreams" }).catch(() => null);
            const byId = new Map((r?.Items || []).map((i) => [i.Id, i]));
            const items = ids.map((id) => byId.get(id)).filter(Boolean);
            if (items.length !== ids.length) return toast(t("This video isn't in your library."));
            clearTimers();
            pb.play(items, q.PlayingItemIndex, {
              sync: true,
              pause: true,
              startTicks: q.StartPositionTicks || 0,
              playlistItemIds: list.map((x) => x.PlaylistItemId),
            });
            break;
          }
          case "LibraryAccessDenied":
            toast(t("You don't have access to what the group is watching."));
            break;
          default:
        }
      } else if (msg.MessageType === "SyncPlayCommand") {
        const c = msg.Data || {};
        const pos = (c.PositionTicks || 0) / TICKS;
        clearTimers();
        switch (c.Command) {
          case "Unpause":
            at(c.When, (lateMs) => {
              playerCommand("seek", String(pos + lateMs / 1000), "absolute");
              playerCommand("set", "pause", "no");
            });
            break;
          case "Pause":
            at(c.When, () => {
              playerCommand("set", "pause", "yes");
              playerCommand("seek", String(pos), "absolute");
            });
            break;
          case "Seek": {
            playerCommand("set", "pause", "yes");
            playerCommand("seek", String(pos), "absolute");
            // Ready again once the new position has loaded.
            const r = pb?.current();
            setTimeout(() => {
              api.ready({ When: iso(serverNow()), PositionTicks: c.PositionTicks || 0, IsPlaying: stateRef.current === "Playing" || stateRef.current === "Waiting", PlaylistItemId: c.PlaylistItemId || r?.playlistItemIds?.[r.index] }).catch(() => {});
            }, 700);
            break;
          }
          case "Stop":
            pb?.stop();
            break;
          default:
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, t, toast, syncClock, api],
  );

  // Connection to the server (only while the app is open).
  useEffect(() => {
    if (!isTauri() || !auth?.token) return;
    let alive = true;
    const url = client.base.replace(/^http/, "ws") + `/socket?deviceId=${encodeURIComponent(deviceId())}`;
    invoke("jf_socket_open", { url, auth: client.authHeader() }).then(
      () => alive && setConnected(true),
      () => alive && setConnected(false),
    );
    const offs = [listen("jf-socket", (text) => onMessage(text)), listen("jf-socket-closed", () => alive && setConnected(false))];
    const clock = setInterval(() => groupRef.current && syncClock(), 60000);
    return () => {
      alive = false;
      clearInterval(clock);
      clearTimers();
      offs.forEach((p) => p.then((f) => f()));
      if (groupRef.current) api.leave().catch(() => {});
      invoke("jf_socket_close").catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, auth?.token]);

  // ---- hooks for the player
  const hooks = useMemo(
    () => ({
      active: () => !!groupRef.current,
      // Starting something while in a group: the group plays it for everyone.
      startForGroup: (queue, start, opts) => {
        const first = queue[start];
        const ticks = opts?.resume ? first?.UserData?.PlaybackPositionTicks || 0 : 0;
        api.setQueue(queue.map((i) => i.Id), start, ticks).catch((e) => toast(String(e.message || e)));
      },
      onLoaded: (item, pos, r) => {
        api
          .ready({ When: iso(serverNow()), PositionTicks: Math.round(pos * TICKS), IsPlaying: true, PlaylistItemId: r.playlistItemIds?.[r.index] })
          .catch(() => {});
      },
      onKey: (key, r) => {
        const pid = r.playlistItemIds?.[r.index];
        const pos = r.lastPos;
        if (key === "ok" && r.intro) return api.seek(r.intro.EndTicks);
        if (key === "ok" || key === "playpause") return (stateRef.current === "Playing" ? api.pause() : api.unpause()).catch(() => {});
        if (key === "back10") return api.seek((pos - 10) * TICKS).catch(() => {});
        if (key === "fwd10") return api.seek((pos + 10) * TICKS).catch(() => {});
        if (key === "next" && pid) return api.next(pid).catch(() => {});
        if (key === "prev" && pid) return api.previous(pid).catch(() => {});
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, toast],
  );

  return { group, state, connected, api, hooks, refreshClock: syncClock };
}
