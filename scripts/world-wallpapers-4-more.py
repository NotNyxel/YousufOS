# Usage: python3 scripts/world-wallpapers-4-more.py src/data/world-wallpapers.json [target]
"""Tops up the countries people here care most about (the Gulf, the Arab and
Muslim world, then popular places) to `target` photos each (default 36) with
Featured and Quality pictures of the country and its main cities. Safe to stop
and run again: it saves after every country and skips full ones."""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "world-wallpapers-3-fill.py")).read()
exec(src[: src.index("CAT = sys.argv[1]")])  # api(), search(), candidates(), clean()

CAT = sys.argv[1]
TARGET = int(sys.argv[2]) if len(sys.argv) > 2 else 36
FIRST = ["AE", "SA", "QA", "KW", "BH", "OM", "EG", "JO", "MA", "TR", "PS", "LB", "SY", "IQ", "YE", "TN", "DZ", "LY", "SD",
         "PK", "MY", "ID", "BD", "IR", "AZ", "UZ", "KZ", "MV", "BA", "AL"]
THEN = ["GB", "FR", "IT", "ES", "DE", "CH", "AT", "NL", "GR", "PT", "US", "CA", "JP", "KR", "CN", "TH", "SG", "IN", "LK",
        "AU", "NZ", "ZA", "KE", "TZ", "BR", "AR", "MX", "NO", "IS", "IE", "SE", "FI", "CZ", "HR", "GE", "VN", "PH", "PE", "CL"]
LOCS = {l["code"]: l for l in json.load(open(os.path.join(HERE, "..", "src", "data", "world-locations.json")))}
path = lambda u: (re.search(r"/commons/(?:thumb/)?([0-9a-f]/[0-9a-f]{2}/[^/]+)", u) or [None, u])[1]
# The title itself must say it's a view of a place; no species names
# ("Nerita polita 01"), crowds or industrial close-ups.
NOPE = re.compile(r"^[A-Z][a-z]+ [a-z]+(?: \d+)?$|pilgrim|crowd|crane|cranes|construction|denoised|\bport\b(?! city)", re.I)
def looks_like_a_place(title):
    return not NOPE.search(title) and (GOOD.search(title) or re.search(r"[A-Z][a-z]{3,}", title))

cat = json.load(open(CAT))
stem = lambda s: re.sub(r"[\d_\-\s.,()]+", " ", s.lower()).strip()[:22]

for cc in FIRST + THEN:
    have = cat.setdefault(cc, [])
    if len(have) >= TARGET or cc not in LOCS:
        continue
    loc = LOCS[cc]
    country = NAME.get(cc, loc["name"]).split(" (")[0]
    seen = {x["u"] for x in have}
    got = []
    for place, city in [(country, "")] + [(c["name"], c["name"]) for c in loc["cities"][:5]]:
        pre = re.compile(r"\b" + re.escape(place) + r"\b", re.I)
        for q in (f'"{place}" incategory:Featured_pictures_on_Wikimedia_Commons', f'"{place}" incategory:Quality_images'):
            got += candidates(search(q, 50), cc, pre, city)
        if len(got) >= TARGET * 3:
            break
    before = len(have)
    for it in sorted(got, key=lambda x: -x["s"]):
        if len(have) >= TARGET:
            break
        p = path(it["u"])
        if p in seen or sum(stem(v["t"]) == stem(it["t"]) for v in have) >= 2 or not looks_like_a_place(it["t"]):
            continue
        seen.add(p)
        have.append({"u": p, "t": it["t"], "a": it["a"], "l": it["l"], "n": it["n"], "c": it["c"] or ""})
    print(cc, before, "->", len(have), flush=True)
    json.dump(cat, open(CAT, "w"), ensure_ascii=False, separators=(",", ":"))
print("images:", sum(map(len, cat.values())))
