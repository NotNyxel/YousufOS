// Live TV through a computer in another country (for channels that don't
// play where the TV is). The computer runs a small HTTP proxy on its Tailscale
// address; see docs/live-tv-proxy.md. Off until it's set up.
//   when: "off" | "auto" (only while the TV's internet is in one of `countries`) | "always"
import { useEffect, useState } from "react";
import { fetchText, setStreamProxy } from "./platform";

let cached = { at: 0, country: "" };
/** The country of the TV's internet connection (from its public address), checked at most hourly. */
export async function networkCountry() {
  if (Date.now() - cached.at < 3600_000 && cached.country) return cached.country;
  try {
    const r = JSON.parse(await fetchText("https://ipwho.is/?fields=country_code,success"));
    if (r.success !== false && r.country_code) cached = { at: Date.now(), country: r.country_code };
  } catch {
    /* offline: keep what we had */
  }
  return cached.country;
}

/** Normalises what was typed: "100.64.1.5:8888" → "http://100.64.1.5:8888". */
export function proxyUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return /^[a-z0-9]+:\/\//i.test(s) ? s : `http://${s}${/:\d+$/.test(s) ? "" : ":8888"}`;
}

/** Keeps the Live TV proxy on or off as the settings and the TV's location say. Returns { active, country }. */
export function useLiveProxy(iptv, fallbackCountry) {
  const p = iptv?.proxy || {};
  const url = proxyUrl(p.url);
  const when = url ? p.when || "off" : "off";
  const countries = (p.countries?.length ? p.countries : ["AE"]).join(",");
  const [state, setState] = useState({ active: false, country: "" });
  useEffect(() => {
    let alive = true;
    const decide = async () => {
      let on = when === "always";
      let country = "";
      if (when === "auto") {
        country = (await networkCountry()) || fallbackCountry || "";
        on = countries.split(",").includes(country);
      }
      if (!alive) return;
      setStreamProxy(on ? url : "");
      setState({ active: on, country });
    };
    decide();
    const id = setInterval(decide, 30 * 60_000);
    window.addEventListener("online", decide);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("online", decide);
    };
  }, [url, when, countries, fallbackCountry]);
  return state;
}
