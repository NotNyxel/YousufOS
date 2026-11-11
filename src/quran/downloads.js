// Recitation and text downloads: status, progress and actions.
import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri, listen } from "../lib/platform";
import { reciter as findReciter, saveBase } from "./reciters";
import { refreshDownloads } from "./audio";
import { TOTAL } from "./data";

export function useQuranDownloads() {
  const [status, setStatus] = useState({ texts: [], audio: {} });
  const [progress, setProgress] = useState({}); // reciter -> { done, total, failed, state, label }
  const refresh = useCallback(() => {
    if (!isTauri()) return Promise.resolve();
    return invoke("quran_status").then(setStatus).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const off = listen("quran-progress", (p) => {
      setProgress((cur) => ({ ...cur, [p.reciter]: p }));
      if (p.state !== "running") {
        refresh();
        refreshDownloads(p.reciter);
      }
    });
    return () => off.then((f) => f());
  }, [refresh]);

  // range: [from, to] global indexes (0-based, inclusive); default the whole Qur'an.
  const getAudio = useCallback((id, range = [0, TOTAL - 1], label = "") => {
    const r = findReciter(id);
    setProgress((cur) => ({ ...cur, [id]: { reciter: id, done: 0, total: 0, failed: 0, state: "running", label } }));
    return invoke("quran_audio_get", { reciter: id, base: saveBase(r), from: range[0] + 1, to: range[1] + 1, label }).catch((e) => {
      setProgress((cur) => ({ ...cur, [id]: { reciter: id, done: 0, total: 0, failed: 0, state: "failed", label, error: String(e) } }));
    });
  }, []);
  const cancelAudio = useCallback((id) => invoke("quran_audio_cancel", { reciter: id }), []);
  const deleteAudio = useCallback(
    async (id) => {
      await invoke("quran_audio_delete", { reciter: id });
      await refreshDownloads(id);
      setProgress((cur) => ({ ...cur, [id]: undefined }));
      refresh();
    },
    [refresh],
  );
  return { status, progress, refresh, getAudio, cancelAudio, deleteAudio };
}

export const formatMb = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
