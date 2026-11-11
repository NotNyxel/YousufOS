import { fetchText } from "./platform";
import { COUNTRIES, nearestCity } from "./locations";

// IP-based location (no GPS on a TV box). Returns a settings.location object.
export async function detectLocation() {
  const raw = await fetchText("https://ipwho.is/");
  const j = JSON.parse(raw);
  if (!j.success && j.success !== undefined) throw new Error(j.message || "lookup failed");
  const lat = j.latitude, lng = j.longitude;
  const near = nearestCity(lat, lng);
  const useKnown = near && near.d < 40;
  const country = useKnown ? near.country : COUNTRIES.find((c) => c.code === j.country_code) || { code: j.country_code, short: j.country_code };
  const city = useKnown ? near.city.name : j.city;
  return {
    mode: "auto",
    country: country.code,
    city,
    lat,
    lng,
    label: `${city}, ${country.short}`,
  };
}
