import WORLD from "../data/world-locations.json";

// Cities offered under Settings -> Location. Coordinates are city centres.
// The hand-picked Gulf & Muslim-world entries come first; every other country
// and territory follows (capital + largest cities, from GeoNames; built by
// scripts/build-world-locations.py).
const CURATED = [
  {
    code: "AE",
    name: "United Arab Emirates",
    short: "UAE",
    method: "uae",
    cities: [
      { name: "Sharjah", ar: "الشارقة", lat: 25.3463, lng: 55.4209 },
      { name: "Dubai", ar: "دبي", lat: 25.2048, lng: 55.2708 },
      { name: "Abu Dhabi", ar: "أبوظبي", lat: 24.4539, lng: 54.3773 },
      { name: "Ajman", ar: "عجمان", lat: 25.4052, lng: 55.5136 },
      { name: "Umm Al Quwain", ar: "أم القيوين", lat: 25.5647, lng: 55.5552 },
      { name: "Ras Al Khaimah", ar: "رأس الخيمة", lat: 25.8007, lng: 55.9762 },
      { name: "Fujairah", ar: "الفجيرة", lat: 25.1288, lng: 56.3265 },
      { name: "Al Ain", ar: "العين", lat: 24.2075, lng: 55.7447 },
      { name: "Khor Fakkan", ar: "خورفكان", lat: 25.339, lng: 56.356 },
    ],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    short: "KSA",
    method: "ummalqura",
    cities: [
      { name: "Makkah", ar: "مكة المكرمة", lat: 21.4225, lng: 39.8262 },
      { name: "Madinah", ar: "المدينة المنورة", lat: 24.4672, lng: 39.6111 },
      { name: "Riyadh", ar: "الرياض", lat: 24.7136, lng: 46.6753 },
      { name: "Jeddah", ar: "جدة", lat: 21.5433, lng: 39.1728 },
      { name: "Dammam", ar: "الدمام", lat: 26.4207, lng: 50.0888 },
    ],
  },
  {
    code: "OM",
    name: "Oman",
    short: "Oman",
    method: "uae",
    cities: [{ name: "Muscat", ar: "مسقط", lat: 23.588, lng: 58.3829 }],
  },
  {
    code: "QA",
    name: "Qatar",
    short: "Qatar",
    method: "uae",
    cities: [{ name: "Doha", ar: "الدوحة", lat: 25.2854, lng: 51.531 }],
  },
  {
    code: "KW",
    name: "Kuwait",
    short: "Kuwait",
    method: "uae",
    cities: [{ name: "Kuwait City", ar: "مدينة الكويت", lat: 29.3759, lng: 47.9774 }],
  },
  {
    code: "BH",
    name: "Bahrain",
    short: "Bahrain",
    method: "uae",
    cities: [{ name: "Manama", ar: "المنامة", lat: 26.2285, lng: 50.586 }],
  },
  {
    code: "EG",
    name: "Egypt",
    short: "Egypt",
    method: "mwl",
    cities: [{ name: "Cairo", ar: "القاهرة", lat: 30.0444, lng: 31.2357 }],
  },
  {
    code: "PK",
    name: "Pakistan",
    short: "Pakistan",
    method: "mwl",
    cities: [
      { name: "Karachi", ar: "كراتشي", lat: 24.8607, lng: 67.0011 },
      { name: "Lahore", ar: "لاهور", lat: 31.5204, lng: 74.3587 },
      { name: "Islamabad", ar: "إسلام آباد", lat: 33.6844, lng: 73.0479 },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    short: "UK",
    method: "mwl",
    cities: [{ name: "London", ar: "لندن", lat: 51.5074, lng: -0.1278 }],
  },
];

export const COUNTRIES = [
  ...CURATED.map((c) => ({ ...c, ar: c.ar || WORLD.find((w) => w.code === c.code)?.ar })),
  ...WORLD.filter((w) => !CURATED.some((c) => c.code === w.code)).map((w) => ({ ...w, short: w.name })),
];

export function findCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

export function findCity(countryCode, cityName) {
  const c = findCountry(countryCode);
  return c.cities.find((x) => x.name === cityName) || c.cities[0];
}

// Haversine distance, used to snap an auto-detected position to the
// nearest known city name (coordinates stay exact).
export function nearestCity(lat, lng) {
  let best = null;
  for (const country of COUNTRIES) {
    for (const city of country.cities) {
      const d = distanceKm(lat, lng, city.lat, city.lng);
      if (!best || d < best.d) best = { d, country, city };
    }
  }
  return best;
}

function distanceKm(a, b, c, d) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(c - a);
  const dLng = toRad(d - b);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
