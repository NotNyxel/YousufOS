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

function Weather({ lat, lng }) {
  const { t } = useI18n();
  const [w, setW] = useState(null);
  useEffect(() => {
    if (lat == null || lng == null) return;
    let alive = true;
    const load = () =>
      fetchText(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
      )
        .then((txt) => {
          const d = JSON.parse(txt);
          if (alive && d.current)
            setW({
              temp: Math.round(d.current.temperature_2m),
              code: d.current.weather_code,
              day: !!d.current.is_day,
              hi: Math.round(d.daily.temperature_2m_max[0]),
              lo: Math.round(d.daily.temperature_2m_min[0]),
            });
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 30 * 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [lat, lng]);
  if (!w) return null;
  return (
    <div className="fade-up flex items-center justify-center gap-[0.7rem] text-[1.15rem] text-ink-dim">
      <WeatherIcon code={w.code} day={w.day} className="h-[1.5rem] w-[1.5rem] text-accent" />
      <span className="tabular font-semibold text-ink">{w.temp}°</span>
      <span>{t(LABELS[w.code] || "Cloudy")}</span>
      <span className="tabular text-ink-faint" dir="ltr">
        ↑{w.hi}° ↓{w.lo}°
      </span>
    </div>
  );
}

export default memo(Weather);
