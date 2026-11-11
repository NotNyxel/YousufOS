# Usage: python3 scripts/world-wallpapers-1-places.py src/data/world-locations.json <wikidata countries.json> places.json
"""Step 1 (worldwide): famous places with a photo, a few large queries (one per
kind of place), grouped by country afterwards. Small countries with few
results get one extra query of their own."""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
LOC, WDRAW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
UA = "YousufOS-build/1.5 (personal TV launcher wallpaper catalogue)"
def sparql(q, tries=8):
    url = "https://query.wikidata.org/sparql"
    body = urllib.parse.urlencode({"query": q, "format": "json"}).encode()
    for attempt in range(tries):
        t = time.time()
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": UA, "Accept": "application/sparql-results+json",
                                                                   "Content-Type": "application/x-www-form-urlencoded"})
            rows = json.load(urllib.request.urlopen(req, timeout=75))["results"]["bindings"]
            time.sleep(max(4, 2 * (time.time() - t)))  # stay well inside the query-time budget
            return rows
        except urllib.error.HTTPError as e:
            ra = int(e.headers.get("Retry-After") or 30)
            print(f"  wdqs {e.code}, waiting {ra + 15 * attempt}s", flush=True)
            time.sleep(ra + 15 * attempt)
        except Exception as e:
            print("  wdqs error", repr(e)[:80], flush=True)
            time.sleep(20 + 10 * attempt)
    return None
BLOCKS = {
    "heritage": ("?item wdt:P1435 wd:Q9259 .", 0),
    "capital": ("?item wdt:P31 wd:Q5119 .", 5),
    "bigcity": ("?item wdt:P31 wd:Q1549591 .", 20),
    "park": ("?item wdt:P31 wd:Q46169 .", 6),
    "attraction": ("?item wdt:P31 wd:Q570116 .", 8),
    "cathedral": ("?item wdt:P31 wd:Q2977 .", 8),
    "mosque": ("?item wdt:P31 wd:Q32815 .", 6),
    "castle": ("?item wdt:P31 wd:Q23413 .", 8),
    "palace": ("?item wdt:P31 wd:Q16560 .", 8),
    "mountain": ("?item wdt:P31 wd:Q8502 .", 25),
    "lake": ("?item wdt:P31 wd:Q23397 .", 25),
    "waterfall": ("?item wdt:P31 wd:Q34038 .", 6),
    "island": ("?item wdt:P31 wd:Q23442 .", 30),
    "temple": ("?item wdt:P31 wd:Q44539 .", 8),
    "bridge": ("?item wdt:P31 wd:Q12280 .", 15),
    "tower": ("?item wdt:P31 wd:Q11303 .", 15),
}
def query(block, minsl):
    # Fixed join order (the automatic planner times out on these).
    return f"""
SELECT ?item ?label ?img ?sl ?coord ?iso WHERE {{
  hint:Query hint:optimizer "None" .
  {block}
  ?item wikibase:sitelinks ?sl .
  FILTER(?sl > {minsl})
  ?item wdt:P18 ?img .
  ?item wdt:P17 ?c .
  ?c wdt:P297 ?iso .
  OPTIONAL {{ ?item wdt:P625 ?coord }}
  OPTIONAL {{ ?item rdfs:label ?label FILTER(lang(?label) = "en") }}
}}"""
state = json.load(open(OUT + ".state")) if os.path.exists(OUT + ".state") else {"done": [], "rows": []}
def save(): json.dump(state, open(OUT + ".state", "w"), ensure_ascii=False)
for name, (block, minsl) in BLOCKS.items():
    if name in state["done"]: continue
    rows = sparql(query(block, minsl))
    if rows is None:
        print("giving up on", name, flush=True); continue
    for r in rows:
        state["rows"].append([r["iso"]["value"], r["item"]["value"].rsplit("/", 1)[1], r.get("label", {}).get("value", ""),
                              urllib.parse.unquote(r["img"]["value"].rsplit("/", 1)[1]), int(r["sl"]["value"]), r.get("coord", {}).get("value", "")])
    state["done"].append(name); save()
    print(name, len(rows), flush=True)
qid = {}
for r in json.load(open(WDRAW))["countries"]:
    qid.setdefault(r["iso"]["value"], r["c"]["value"].rsplit("/", 1)[1])
def per_country():
    out = {}
    for iso, item, label, f, sl, coord in state["rows"]:
        out.setdefault(iso, {})
        if f in out[iso]: continue
        m = re.match(r"Point\(([-\d.e]+) ([-\d.e]+)\)", coord)
        out[iso][f] = {"f": f, "name": label, "ll": [float(m.group(2)), float(m.group(1))] if m else None, "sl": sl}
    return out
# Places with few photos: one small query for the whole country.
for c in json.load(open(LOC)):
    cc = c["code"]
    have = len(per_country().get(cc, {}))
    if have >= 15 or cc not in qid or ("small:" + cc) in state["done"]: continue
    rows = sparql(f"""
SELECT ?item ?label ?img ?sl ?coord WHERE {{
  ?item wdt:P17 wd:{qid[cc]} .
  ?item wdt:P18 ?img .
  ?item wikibase:sitelinks ?sl .
  FILTER(?sl > 1)
  OPTIONAL {{ ?item wdt:P625 ?coord }}
  OPTIONAL {{ ?item rdfs:label ?label FILTER(lang(?label) = "en") }}
}} ORDER BY DESC(?sl) LIMIT 100""", tries=4) or []
    for r in rows:
        state["rows"].append([cc, r["item"]["value"].rsplit("/", 1)[1], r.get("label", {}).get("value", ""),
                              urllib.parse.unquote(r["img"]["value"].rsplit("/", 1)[1]), int(r["sl"]["value"]), r.get("coord", {}).get("value", "")])
    state["done"].append("small:" + cc); save()
    print("small", cc, have, "->", len(rows), flush=True)
final = {cc: sorted(v.values(), key=lambda x: -x["sl"]) for cc, v in per_country().items()}
json.dump(final, open(OUT, "w"), ensure_ascii=False)
print("done", len(final), "countries", sum(len(v) for v in final.values()), "places", flush=True)
