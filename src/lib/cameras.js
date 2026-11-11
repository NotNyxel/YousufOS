// Cameras and the doorbell. A camera is either a stream address (RTSP, HLS,
// MJPEG, a picture URL) or a Home Assistant camera entity.
import { useEffect, useRef } from "react";
import { invoke, isTauri, listen } from "./platform";

export function haBase(settings) {
  let v = String(settings.appUrls?.homeassistant || "http://homeassistant.local:8123").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  if (!/:\d+$/.test(v.replace(/^https?:\/\//, ""))) v += ":8123";
  return v;
}
const haHeaders = (settings) => (settings.cameras?.haToken ? [`Authorization: Bearer ${settings.cameras.haToken}`] : []);

// Where to watch a camera and where to get a still picture of it.
export function cameraSource(cam, settings) {
  if (cam.entity) {
    const base = haBase(settings);
    return {
      stream: `${base}/api/camera_proxy_stream/${cam.entity}`,
      still: `${base}/api/camera_proxy/${cam.entity}`,
      headers: haHeaders(settings),
    };
  }
  return { stream: cam.url, still: cam.snapshot || cam.url, headers: [] };
}

export async function snapshot(cam, settings) {
  const src = cameraSource(cam, settings);
  return invoke("camera_snapshot", { id: cam.id, url: src.still, headers: src.headers });
}

// Full screen in mpv (Back closes it).
export function watchCamera(cam, settings) {
  const src = cameraSource(cam, settings);
  return invoke("play_media", {
    entries: [{ url: src.stream, title: cam.name, start: 0, aid: null, sid: null, sub_files: [] }],
    headers: src.headers,
    audioOnly: false,
  });
}

// Small always-on-top window (the doorbell).
export function popupCamera(cam, settings, corner = "tr") {
  const src = cameraSource(cam, settings);
  return invoke("pip_start", { url: src.stream, title: cam.name, corner, size: 640, muted: false, userAgent: null, headers: src.headers });
}

export const newId = () => Math.random().toString(36).slice(2, 10);

// Rings: from the admin server (/api/doorbell?key=…) and, when a Home Assistant
// entity is set, by watching that entity (binary_sensor on, or a new event).
export function useDoorbell(settings, onRing) {
  const ringRef = useRef(onRing);
  useEffect(() => {
    ringRef.current = onRing;
  });
  const d = settings.cameras?.doorbell || {};
  const key = d.key;
  useEffect(() => {
    if (!isTauri()) return;
    const off = listen("doorbell-ring", (e) => {
      if (key && e.key === key) ringRef.current(e.camera || null);
    });
    return () => off.then((f) => f());
  }, [key]);

  const entity = d.enabled !== false ? d.entity : "";
  const token = settings.cameras?.haToken;
  const base = haBase(settings);
  useEffect(() => {
    if (!isTauri() || !entity || !token) return;
    let prev;
    let alive = true;
    const poll = async () => {
      try {
        const [status, text] = await invoke("http_request", {
          method: "GET",
          url: `${base}/api/states/${entity}`,
          headers: [["Authorization", `Bearer ${token}`]],
          body: null,
          timeoutMs: 4000,
        });
        if (status === 200) {
          const st = JSON.parse(text);
          const state = entity.startsWith("event.") ? st.state : st.state === "on" ? "on" : `off:${st.last_changed}`;
          if (prev !== undefined && state !== prev && (state === "on" || entity.startsWith("event."))) ringRef.current(null);
          prev = state;
        }
      } catch {
        /* Home Assistant unreachable: try again */
      }
      if (alive) timer = setTimeout(poll, 2000);
    };
    let timer = setTimeout(poll, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [entity, token, base]);
}
