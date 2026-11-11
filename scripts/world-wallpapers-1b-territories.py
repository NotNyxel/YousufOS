# Usage: python3 scripts/world-wallpapers-1b-territories.py places.json src/data/world-locations.json <wikidata countries.json>
"""Step 1b: overseas territories whose places are filed under another country
(Guam, French Polynesia, Svalbard...): places located in them, and the
territory's own photo."""
import json, re, sys, time, urllib.parse
PLACES, LOC, WDRAW = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, __import__("os").path.dirname(__file__))
from world_wallpapers_lib import sparql
places = json.load(open(PLACES))
qid = {}
for r in json.load(open(WDRAW))["countries"]:
    qid.setdefault(r["iso"]["value"], r["c"]["value"].rsplit("/", 1)[1])
for c in json.load(open(LOC)):
    cc = c["code"]
    if cc in places or cc not in qid: continue  # only places with nothing yet
    q = qid[cc]
    rows = sparql(f"""
SELECT DISTINCT ?item ?label ?img ?sl ?coord WHERE {{
  hint:Query hint:optimizer "None" .
  {{ ?item wdt:P131 wd:{q} }} UNION {{ ?sub wdt:P131 wd:{q} . ?item wdt:P131 ?sub }} UNION {{ ?item wdt:P706 wd:{q} }} UNION {{ BIND(wd:{q} AS ?item) }}
  ?item wdt:P18 ?img .
  ?item wikibase:sitelinks ?sl .
  OPTIONAL {{ ?item wdt:P625 ?coord }}
  OPTIONAL {{ ?item rdfs:label ?label FILTER(lang(?label) = "en") }}
}} ORDER BY DESC(?sl) LIMIT 80""", tries=3) or []
    have = {p["f"] for p in places.get(cc, [])}
    for r in rows:
        f = urllib.parse.unquote(r["img"]["value"].rsplit("/", 1)[1])
        if f in have: continue
        have.add(f)
        m = re.match(r"Point\(([-\d.e]+) ([-\d.e]+)\)", r.get("coord", {}).get("value", ""))
        places.setdefault(cc, []).append({"f": f, "name": r.get("label", {}).get("value", ""), "ll": [float(m.group(2)), float(m.group(1))] if m else None, "sl": int(r["sl"]["value"])})
    print(cc, len(places.get(cc, [])), flush=True)
json.dump(places, open(PLACES, "w"), ensure_ascii=False)
print("done")
