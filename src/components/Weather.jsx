import { memo, useEffect, useState } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from "lucide-react";
import { fetchText } from "../lib/platform";
import { useI18n } from "../lib/settings-store";

// Today's weather from Open-Meteo (free, no account), refreshed every 30 min.
const LABELS = {
  0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog",
  51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain",
  71: "Snow", 73: "Snow", 75: "Snow", 80: "Showers", 81: "Showers", 82: "Heavy showers",
  95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
};
function WeatherIcon({ code, day, className }) {
  const props = { className, strokeWidth: 1.8 };
  if (code <= 1) return day ? <Sun {...props} /> : <Moon {...props} />;
  if (code === 2) return day ? <CloudSun {...props} /> : <CloudMoon {...props} />;
  if (code === 3) return <Cloud {...props} />;
  if (code === 45 || code === 48) return <CloudFog {...props} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle {...props} />;
  if (code >= 71 && code <= 77) return <CloudSnow {...props} />;
  if (code >= 95) return <CloudLightning {...props} />;
  return <CloudRain {...props} />;
}

// The forecast is kept for 16 days (the most Open-Meteo gives), so the
// weather still shows when the internet is down. Back online: it refreshes.
const CACHE = "yousufos.weather";
const near = (a, b) => Math.abs(a - b) < 0.05;

function readCache(lat, lng) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || "null");
    return c && near(c.lat, lat) && near(c.lng, lng) ? c : null;
  } catch {
    return null;
  }
}

/** Weather for now from the saved forecast (null when it has run out). */
function fromCache(c, now = new Date()) {
  if (!c?.hourly?.time) return null;
  // Hourly times are local to the place ("2026-11-16T18:00"); compare as local.
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hourKey = `${key(now)}T${String(now.getHours()).padStart(2, "0")}:00`;
  const i = c.hourly.time.indexOf(hourKey);
  const di = c.daily.time.indexOf(key(now));
  if (i < 0 || di < 0) return null;
  return {
    temp: Math.round(c.hourly.temperature_2m[i]),
    code: c.hourly.weather_code[i],
    day: !!c.hourly.is_day[i],
    hi: Math.round(c.daily.temperature_2m_max[di]),
    lo: Math.round(c.daily.temperature_2m_min[di]),
    saved: true,
  };
}

function Weather({ lat, lng }) {
  const { t } = useI18n();
  const [w, setW] = useState(() => (lat == null ? null : fromCache(readCache(lat, lng))));
  useEffect(() => {
    if (lat == null || lng == null) return;
    let alive = true;
    const load = () =>
      fetchText(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`,
      )
        .then((txt) => {
          const d = JSON.parse(txt);
          if (!d.current) throw new Error("no weather");
          try {
            localStorage.setItem(CACHE, JSON.stringify({ lat, lng, at: Date.now(), hourly: d.hourly, daily: d.daily }));
          } catch {
            /* not kept: fine */
          }
          if (alive)
            setW({
              temp: Math.round(d.current.temperature_2m),
              code: d.current.weather_code,
              day: !!d.current.is_day,
              hi: Math.round(d.daily.temperature_2m_max[0]),
              lo: Math.round(d.daily.temperature_2m_min[0]),
            });
        })
        // Offline: the saved forecast for this hour.
        .catch(() => alive && setW(fromCache(readCache(lat, lng))));
    load();
    const id = setInterval(load, 30 * 60000);
    window.addEventListener("online", load);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("online", load);
    };
  }, [lat, lng]);
  if (!w) return null;
  return (
    <div className="fade-up flex items-center justify-center gap-[0.7rem] text-[1.15rem] text-ink-dim">
      <WeatherIcon code={w.code} day={w.day} className="h-[1.5rem] w-[1.5rem] text-accent" />
      <span className="tabular font-semibold text-ink" title={w.saved ? t("Saved forecast (offline)") : undefined}>
        {w.temp}°
      </span>
      <span>{t(LABELS[w.code] || "Cloudy")}</span>
      <span className="tabular text-ink-faint" dir="ltr">
        ↑{w.hi}° ↓{w.lo}°
      </span>
    </div>
  );
}

export default memo(Weather);
