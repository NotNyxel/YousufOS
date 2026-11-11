# Usage: python3 scripts/world-wallpapers-2-photos.py places.json src/data/world-locations.json src/data/world-wallpapers.json
"""Step 2: check each landmark photo on Wikimedia Commons (size, shape,
licence, author) in batches of 50 and keep good landscape wallpapers."""
import html, json, math, os, re, sys, time, urllib.error, urllib.parse, urllib.request
LM, LOC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
UA = "YousufOS-build/1.5 (personal TV launcher wallpaper catalogue)"
PER_COUNTRY_CANDIDATES, PER_COUNTRY = 45, 20
BAD = re.compile(
    r"montage|collage|composite|mosaic of|\bmaps?\b|\bplan\b|\bflag|coat of arms|emblem|seal|logo|locator|location map|"
    r"diagram|drawing|painting|engraving|lithograph|illustration|postcard|stamp|coin|banknote|portrait|"
    r"satellite|from space|ISS\d|NASA|Landsat|Sentinel|aerial photograph by|PD-old|PD-Art|before 19|"
    r"\b1[0-8]\d\d\b|interior|inside|ceiling|\baltar|organ\b|nave|vault|statue|sculpture|bust\b|"
    r"black and white|black-and-white|monochrome|\bBW\b|grayscale|sepia|\binfrared", re.I)
def clean(s):
    s = re.sub(r"<[^>]+>", "", html.unescape(s or "")).strip()
    return re.sub(r"\s+", " ", s)[:80]
last = [0.0]
def api(**p):
    p.update(format="json", formatversion=2, maxlag=5)
    body = urllib.parse.urlencode(p).encode()
    for attempt in range(12):
        wait = last[0] + 4.0 - time.time()
        if wait > 0: time.sleep(wait)
        try:
            req = urllib.request.Request("https://commons.wikimedia.org/w/api.php", data=body, headers={"User-Agent": UA})
            d = json.load(urllib.request.urlopen(req, timeout=120))
            last[0] = time.time()
            return d
        except urllib.error.HTTPError as e:
            last[0] = time.time()
            ra = int(e.headers.get("Retry-After") or 15)
            print(f"  {e.code}, waiting {ra + 10 * attempt}s", flush=True)
            time.sleep(ra + 10 * attempt)
        except Exception as e:
            last[0] = time.time(); time.sleep(10 + attempt * 5)
    return {}
def km(a, b):
    R = 6371; t = math.radians
    dlat, dlng = t(b[0] - a[0]), t(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(t(a[0])) * math.cos(t(b[0])) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

lm = json.load(open(LM)); locs = {c["code"]: c for c in json.load(open(LOC))}
cache_path = OUT + ".info"
info = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
def check(files):
    todo = sorted(set(files) - set(info))
    print("files to check:", len(todo), flush=True)
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        d = api(action="query", titles="|".join("File:" + f for f in batch), prop="imageinfo",
                iiprop="url|size|extmetadata", iiurlwidth=2560, iiextmetadatafilter="Artist|LicenseShortName|Categories")
        norm = {n["to"]: n["from"] for n in (d.get("query") or {}).get("normalized", [])}
        for pg in (d.get("query") or {}).get("pages", []):
            name = norm.get(pg["title"], pg["title"])[5:]
            ii = (pg.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata", {})
            info[name] = {"w": ii.get("width", 0), "h": ii.get("height", 0), "u": (ii.get("thumburl") or ii.get("url") or "").split("?")[0],
                          "a": clean(em.get("Artist", {}).get("value")), "l": em.get("LicenseShortName", {}).get("value", ""),
                          "cats": em.get("Categories", {}).get("value", "")[:1500]}
        if d:
            for f in batch: info.setdefault(f, {"w": 0})
        json.dump(info, open(cache_path, "w"), ensure_ascii=False)
        print(f"  checked {min(i + 50, len(todo))}/{len(todo)}", flush=True)

def usable(cc):
    return [x for x in lm.get(cc, []) if re.search(r"\.jpe?g$", x["f"], re.I) and not BAD.search(x["f"])]

NIGHT = re.compile(r"\bnight|blue hour|by night|nocturn|illuminat", re.I)
def select(cc, items, relaxed=False):
    cities = locs.get(cc, {}).get("cities", [])
    minw, lo, hi = (1500, 1.2, 2.6) if relaxed else (1900, 1.3, 2.4)
    out = []
    for x in items:
        m = info.get(x["f"], {})
        w, h = m.get("w", 0), m.get("h", 0)
        if not w or not h or w < minw or not (lo <= w / h <= hi): continue
        if not re.search(r"CC|Public domain|CC0", m.get("l", ""), re.I): continue
        if BAD.search(m.get("cats", "")) or not m.get("u"): continue
        city = ""
        if x.get("ll"):
            near = min(((km(x["ll"], (c["lat"], c["lng"])), c["name"]) for c in cities), default=None)
            if near and near[0] <= 30: city = near[1]
        q = 3 if "Featured pictures" in m["cats"] else 2 if "Quality images" in m["cats"] else 1 if "Valued images" in m["cats"] else 0
        out.append({"u": m["u"], "t": x["name"] or x["f"].rsplit(".", 1)[0], "a": m["a"] or "Wikimedia Commons", "l": m["l"],
                    "p": "File:" + x["f"], "n": 1 if NIGHT.search(x["f"] + m["cats"][:400]) else 0, "c": city, "q": q, "sl": x["sl"]})
    out.sort(key=lambda o: -(o["sl"] + 40 * o["q"]))
    return [{k: v for k, v in o.items() if k not in ("q", "sl")} for o in out[:PER_COUNTRY]]

# Round 1: the 45 best-known places everywhere.
check([x["f"] for cc in lm for x in usable(cc)[:PER_COUNTRY_CANDIDATES]])
catalog = {cc: select(cc, usable(cc)) for cc in lm}
# Round 2: places with few results look deeper down the list.
thin = [cc for cc in lm if len(catalog[cc]) < 12]
print("round 2 for", len(thin), "places", flush=True)
check([x["f"] for cc in thin for x in usable(cc)[:160]])
for cc in thin:
    catalog[cc] = select(cc, usable(cc)[:160])
    if len(catalog[cc]) < 6:  # round 3: slightly smaller / squarer photos are fine too
        catalog[cc] = select(cc, usable(cc)[:160], relaxed=True)
json.dump(catalog, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
counts = sorted((len(v), k) for k, v in catalog.items())
print("countries:", len(catalog), "images:", sum(len(v) for v in catalog.values()))
print("fewest:", counts[:25])
