# Usage: python3 scripts/build-world-locations.py <geonames dir> <wikidata countries.json> src/data/world-locations.json
# (geonames dir: cities15000.txt + countryInfo.txt from download.geonames.org/export/dump)
import json, re, sys
GN = sys.argv[1]; WD = sys.argv[2]; OUT = sys.argv[3]
ARABIC = re.compile(r"[؀-ۿ]")
# countryInfo: ISO, ISO3, ISO-Numeric, fips, Country, Capital, Area, Population, Continent, ...
countries = {}
for line in open(f"{GN}/countryInfo.txt", encoding="utf8"):
    if line.startswith("#"): continue
    f = line.rstrip("\n").split("\t")
    countries[f[0]] = {"code": f[0], "name": f[4], "capital": f[5], "continent": f[8]}
wd = json.load(open(WD))["countries"]
ar_name, coords = {}, {}
for r in wd:
    iso = r["iso"]["value"]
    if "ar" in r: ar_name.setdefault(iso, r["ar"]["value"])
    for key in ("coord", "ccoord"):
        if key in r and iso not in coords:
            m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r[key]["value"])
            if m: coords[iso] = (float(m.group(2)), float(m.group(1)))
cities = {}
for line in open(f"{GN}/cities15000.txt", encoding="utf8"):
    f = line.rstrip("\n").split("\t")
    name, alts, lat, lng, fcode, cc, pop = f[1], f[3], float(f[4]), float(f[5]), f[7], f[8], int(f[14] or 0)
    arab = [a for a in alts.split(",") if ARABIC.search(a)]
    # Prefer Arabic spellings over Persian / Urdu ones.
    ar = next((a for a in arab if not re.search(r"[یکپگچژۀ]", a)), None)
    if name in ("Brooklyn", "Queens", "Manhattan", "The Bronx", "Staten Island", "Borough of Queens"): continue
    cities.setdefault(cc, []).append({"name": name, "ar": ar, "lat": round(lat, 4), "lng": round(lng, 4), "pop": pop, "cap": fcode == "PPLC"})
METHOD = {}
for cc in "SA YE".split(): METHOD[cc] = "ummalqura"
for cc in "EG SD LY DZ TN MA MR SY LB JO PS IQ SO DJ".split(): METHOD[cc] = "egypt"
for cc in "PK IN BD AF NP LK MV".split(): METHOD[cc] = "karachi"
for cc in "US CA".split(): METHOD[cc] = "isna"
for cc in "SG MY ID BN".split(): METHOD[cc] = "singapore"
for cc in "TR AZ".split(): METHOD[cc] = "turkey"
METHOD["IR"] = "tehran"
for cc in "AE OM".split(): METHOD[cc] = "uae"
METHOD["QA"] = "qatar"; METHOD["KW"] = "kuwait"; METHOD["BH"] = "uae"
out = []
for cc, c in sorted(countries.items(), key=lambda kv: kv[1]["name"]):
    lst = sorted(cities.get(cc, []), key=lambda x: -x["pop"])
    picked = [x for x in lst if x["cap"]][:1]
    for x in lst:
        if len(picked) >= 6: break
        if x in picked: continue
        if len(picked) >= 3 and x["pop"] < 1_000_000: break
        picked.append(x)
    if not picked:
        if cc not in coords: print("skip (no coordinates)", cc, c["name"]); continue
        lat, lng = coords[cc]
        picked = [{"name": c["capital"] or c["name"], "ar": None, "lat": round(lat, 4), "lng": round(lng, 4)}]
    out.append({
        "code": cc, "name": c["name"], "ar": ar_name.get(cc), "method": METHOD.get(cc, "mwl"),
        "cities": [{k: v for k, v in x.items() if k in ("name", "ar", "lat", "lng") and v is not None} for x in picked],
    })
for c in out:
    if c["code"] == "AQ": c["ar"] = "أنتاركتيكا"
json.dump(out, open(OUT, "w"), ensure_ascii=False)
print(len(out), sum(len(c["cities"]) for c in out))
