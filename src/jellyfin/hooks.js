// Hooks for the Jellyfin screens: is the server there (waking the PC up when
// it isn't), and what's downloaded on this TV.
import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "../lib/platform";
import { listDownloads } from "./downloads";

// Checks the server; when it doesn't answer and the PC's network address is
// known, sends a wake-up and keeps trying for a minute and a half.
export function useReachable(client, wol, onLearnMac) {
  const [state, setState] = useState({ status: "checking", attempt: 0 });
  const [waking, setWaking] = useState(false);
  const tries = useRef(0);
  const host = (() => {
    try {
      return new URL(client.base).hostname;
    } catch {
      return null;
    }
  })();
  useEffect(() => {
    let alive = true;
    let timer;
    const check = async () => {
      try {
        const info = await client.publicInfo();
        if (!alive) return;
        setState({ status: "ok", info });
        setWaking(false);
        // Learn the PC's network address so it can be woken next time.
        if (isTauri() && host && wol?.enabled !== false)
          invoke("mac_for_host", { host }).then((mac) => mac && mac !== wol?.mac && onLearnMac(mac), () => {});
      } catch {
        if (!alive) return;
        tries.current += 1;
        const canWake = isTauri() && wol?.enabled !== false && !!wol?.mac;
        if (canWake && tries.current === 1) {
          invoke("wake_on_lan", { mac: wol.mac, host }).catch(() => {});
          setWaking(true);
        }
        if (canWake && tries.current < 18) {
          setState((s) => ({ ...s, status: "waking" }));
          timer = setTimeout(check, 5000);
        } else setState((s) => ({ ...s, status: "down" }));
      }
    };
    check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, state.attempt]);
  return {
    ...state,
    waking,
    retry: () => {
      tries.current = 0;
      setState((s) => ({ status: "checking", attempt: s.attempt + 1 }));
    },
    wake: () => {
      if (wol?.mac) invoke("wake_on_lan", { mac: wol.mac, host }).catch(() => {});
      tries.current = 1;
      setWaking(true);
      setState((s) => ({ status: "checking", attempt: s.attempt + 1 }));
    },
  };
}

export function useDownloads(version = 0) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    listDownloads().then((l) => alive && setList(l), () => {});
    return () => {
      alive = false;
    };
  }, [version]);
  return list;
}

// Plays a downloaded file in mpv.
export async function playDownload(d) {
  const title = d.Type === "Episode" ? `${d.SeriesName} · S${d.ParentIndexNumber}:E${d.IndexNumber} · ${d.Name}` : d.Name;
  return invoke("play_media", { entries: [{ url: d.path, title, start: 0, aid: null, sid: null, sub_files: [] }], headers: [], audioOnly: false });
}
