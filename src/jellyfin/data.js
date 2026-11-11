// Data helpers for the Jellyfin app.
import { useEffect, useState } from "react";

// Small cache so going back to a page is instant. Pages put a version number
// in the key to reload after something changed (watched, resume point...).
// While a new key loads, the previous data stays on screen.
const caches = new WeakMap();
export function useData(client, key, load, deps = []) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const cached = client && key ? caches.get(client)?.get(key) : undefined;
  useEffect(() => {
    if (!client || !key) return;
    let alive = true;
    let cache = caches.get(client);
    if (!cache) caches.set(client, (cache = new Map()));
    load().then(
      (value) => {
        cache.set(key, value);
        if (alive) setState({ key, data: value, error: null });
      },
      (error) => alive && setState((s) => ({ key, data: s.data, error })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, ...deps]);
  if (state.key === key) return { data: state.data, error: state.error, loading: false };
  if (cached !== undefined) return { data: cached, error: null, loading: false };
  return { data: key ? state.data : null, error: null, loading: !!key };
}
export function clearCache(client) {
  caches.delete(client);
}

export function cardShape(item, preferWide = false) {
  if (preferWide || item.Type === "Episode" || item.Type === "Video" || item.Type === "MusicVideo" || item.Type === "CollectionFolder") return "wide";
  if (["MusicAlbum", "Audio", "MusicArtist", "Playlist", "Photo", "PhotoAlbum", "Folder"].includes(item.Type)) return "square";
  return "poster";
}
