# Usage: python3 scripts/world-wallpapers-3-fill.py src/data/world-wallpapers.json   (cleans the catalogue, tops up thin countries from Commons search, writes the app format)
"""Fills territories that the Wikidata pass left empty or thin, with a direct Commons search.
Usage: python3 fill.py catalog.json   (edits it in place)"""
import json, re, sys

import html, json, os, re, sys, time, threading, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "YousufOS-build/1.5 (personal TV launcher wallpaper catalogue)"
lock = threading.Lock()
last = [0.0]

def api(**p):
    """Polite Commons API call: one request at a time, ~1/s, honouring Retry-After."""
    p.update(format="json", formatversion=2, maxlag=5)
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(p)
    for attempt in range(8):
        with lock:
            wait = last[0] + 1.1 - time.time()
            if wait > 0: time.sleep(wait)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                data = json.load(urllib.request.urlopen(req, timeout=90))
                last[0] = time.time()
                if "error" in data and data["error"].get("code") == "maxlag":
                    time.sleep(5); continue
                return data
            except urllib.error.HTTPError as e:
                last[0] = time.time()
                time.sleep(int(e.headers.get("Retry-After") or 10) + 1 + attempt * 5)
            except Exception:
                last[0] = time.time()
                time.sleep(5 + attempt * 5)
    return {}

# Search name overrides (Commons spelling) and words that make a match wrong.
NAME = {
    "CD": "Democratic Republic of the Congo", "CG": "Republic of the Congo", "CI": "Ivory Coast",
    "GE": "Georgia (country)", "MK": "North Macedonia", "PS": "Palestine", "VA": "Vatican City",
    "KP": "North Korea", "KR": "South Korea", "TL": "East Timor", "MM": "Myanmar", "CZ": "Czech Republic",
    "SZ": "Eswatini", "CV": "Cape Verde", "FM": "Micronesia", "BQ": "Bonaire", "UM": "Wake Island",
}
NOT = {
    "GE": r"U\.S\. state|Georgia \(U", "NE": r"Nigeria", "GN": r"Bissau|Equatorial|Papua|New Guinea",
    "DM": r"Dominican", "NG": r"Niger\b(?!ia)", "IE": r"Northern Ireland", "SD": r"South Sudan",
    "CG": r"Democratic", "JO": r"Jordan River", "US": r"^$", "GE": r"U\.S\. state|Georgia \(U|South Georgia",
}
BAD = re.compile(
    r"\bmaps?\b|\bplan\b|\bflag|coat of arms|emblem|seal of|portrait|people|women|men\b|children|\bbirds?\b|insect|"
    r"butterfl|moth|beetle|spider|\bbees?\b|\bwasps?\b|dragonfl|\bflies\b|lepidoptera|arthropod|reptile|lizard|snake|"
    r"amphibian|frog|\bfish|mammal|animal|\bdogs?\b|\bcats?\b|horse|cattle|sheep|monkey|flower|plant|fungi|mushroom|"
    r"lichen|moss|\bfood\b|dish|coin|banknote|stamp|painting|drawing|lithograph|engraving|illustration|diagram|"
    r"logo|manuscript|book|document|sculpture|statue|relief|mosaic|icon\b|fresco|stained glass|interior|organ\b|"
    r"\baltar|ceiling|vault|museum object|PD-old|PD-Art|daguerre|historical image|before 19|18\d\ds|aircraft|"
    r"airplane|helicopter|locomotive|\btrains?\b|\bcars?\b|automobile|vehicle|military|weapon|ship model|"
    r"microscop|astronomical|\bnebula|\bgalaxy|\bmoon\b|eclipse|x-ray|anatomy|skull|fossil|mineral|crystal|"
    r"specimen|herbarium|close-up|macro photograph|night sky|aurora australis|tortois|turtle|squirrel|grackle|"
    r"camels?\b|goats?\b|donkey|lion|elephant|giraffe|zebra|antelope|gazelle|leopard|cheetah|baboon|lemur|"
    r"\bISS\d|astronaut|from space|satellite|NASA|Landsat|Sentinel|monogra|feuille|airport|ATR\s?\d|\bwing\b|"
    r"visit|meeting|ceremony|minister|president|prime|conference|delegation|exhibition|parade|celebration|"
    r"protest|\bteam\b|player|football|match\b|concert|wedding|portrait|selfie|\bboy\b|\bgirl\b|"
    r"\bman\b|\bwoman\b|\bBW\b|black and white|black-and-white|monochrome|\bb&w\b|grayscale|[\u3040-\u30ff\u4e00-\u9fff]{4}", re.I)
GOOD = re.compile(
    r"landscape|cityscape|skyline|panorama|view|aerial|mountain|valley|beach|coast|sea\b|lake|river|waterfall|"
    r"national park|desert|island|harbou?r|port\b|bridge|castle|palace|mosque|cathedral|church|temple|monastery|"
    r"old town|old city|square|street|city|town|village|sunset|sunrise|dusk|night|forest|canyon|glacier|volcano|"
    r"fjord|hills?|cliff|bay\b|lagoon|oasis|dunes?|fort|tower|citadel|ruins|park\b|garden|skyscraper|downtown", re.I)
NIGHT = re.compile(r"\bnight|blue hour|by night|nocturn|illuminated at", re.I)

def clean(s):
    s = re.sub(r"<[^>]+>", "", html.unescape(s or "")).strip()
    return re.sub(r"\s+", " ", s)[:80]

def search(q, limit=50):
    r = api(action="query", generator="search", gsrnamespace=6, gsrlimit=limit,
            gsrsearch=q + " filemime:image/jpeg filew:>2399",
            prop="imageinfo", iiprop="url|size|extmetadata", iiurlwidth=2560,
            iiextmetadatafilter="Artist|LicenseShortName|Categories|ObjectName")
    return (r.get("query") or {}).get("pages", [])

def candidates(pages, cc, place_re, city=None):
    out = []
    for pg in pages:
        ii = (pg.get("imageinfo") or [{}])[0]
        w, h = ii.get("width", 0), ii.get("height", 0)
        if not w or not h or not (1.3 <= w / h <= 2.4) or w < 2400: continue
        em = ii.get("extmetadata", {})
        cats = em.get("Categories", {}).get("value", "")
        lic = em.get("LicenseShortName", {}).get("value", "")
        title = pg["title"][5:].rsplit(".", 1)[0]
        text = f"{title} | {cats}"
        if BAD.search(text) or not re.search(r"CC|Public domain|CC0", lic, re.I): continue
        if "PD-old" in cats or "PD-Art" in cats: continue
        if cc in NOT and re.search(NOT[cc], text, re.I): continue
        # The place must be in the file name, or the photo filed "in"/"of" it.
        if not (place_re.search(title) or re.search(r"(?:\bin|\bof|,) (?:the )?" + place_re.pattern, cats, re.I)): continue
        if not GOOD.search(text): continue
        thumb = (ii.get("thumburl") or ii.get("url", "")).split("?")[0]
        if not thumb: continue
        score = len(GOOD.findall(title)) * 2 + len(GOOD.findall(cats[:600])) + (3 if "Featured pictures" in cats else 0)
        out.append({
            "u": thumb, "t": clean(em.get("ObjectName", {}).get("value") or title), "a": clean(em.get("Artist", {}).get("value")) or "Wikimedia Commons",
            "l": lic, "p": pg["title"], "n": 1 if NIGHT.search(text) else 0, "c": city, "s": score, "k": cats[:3000],
        })
    return out


CAT = sys.argv[1]
TERMS = {
 "AX": ["Åland", "Mariehamn"], "AQ": ["Antarctica", "Antarctic Peninsula", "Paradise Harbour", "Lemaire Channel"],
 "IO": ["Diego Garcia", "Chagos"], "CX": ["Christmas Island"], "CC": ["Cocos (Keeling) Islands", "Cocos Islands"],
 "GP": ["Guadeloupe", "Basse-Terre", "Pointe-à-Pitre", "Les Saintes", "Marie-Galante"],
 "NF": ["Norfolk Island"], "RE": ["Réunion", "La Réunion", "Saint-Denis Réunion", "Piton de la Fournaise", "Cirque de Mafate"],
 "MF": ["Saint-Martin", "Marigot"], "PM": ["Saint-Pierre-et-Miquelon", "Saint-Pierre", "Miquelon"],
 "SJ": ["Svalbard", "Longyearbyen", "Spitsbergen"], "AS": ["American Samoa", "Pago Pago", "Tutuila"],
 "AI": ["Anguilla"], "BQ": ["Bonaire", "Kralendijk", "Saba", "Sint Eustatius"], "BV": ["Bouvet Island"],
 "GF": ["French Guiana", "Cayenne", "Kourou", "Îles du Salut"], "TF": ["Kerguelen", "Crozet", "Amsterdam Island"],
 "GI": ["Gibraltar"], "HM": ["Heard Island"], "MQ": ["Martinique", "Fort-de-France", "Mount Pelée"],
 "NC": ["New Caledonia", "Nouméa", "Isle of Pines", "Lifou"], "PN": ["Pitcairn"], "GS": ["South Georgia", "Grytviken"],
 "TC": ["Turks and Caicos", "Grace Bay", "Providenciales"], "VI": ["U.S. Virgin Islands", "St. Thomas", "St. John", "Saint Croix"],
 "MS": ["Montserrat island", "Plymouth, Montserrat", "Soufrière Hills", "Little Bay, Montserrat", "Montserrat volcano"],
 "ZW": ["Zimbabwe", "Victoria Falls", "Harare", "Great Zimbabwe", "Lake Kariba"],
}
# Namesakes elsewhere (Saint-Martin-de-Ré, Saint-Pierre in Réunion, Costa Rica's Cocos Island...).
EXCLUDE = {
 "MF": r"Rue Saint|\bR[ée]\b|de-R[eé]|Vindrac|Charente|Church", "PM": r"R[ée]union|ferr|Ecole|avion",
 "MS": r"Catalonia|Catalunya|Barcelona|Santa Maria|Parellades|Natural Park|Ave Maria|monaster|Montserrat mountain|Spain",
 "SH": r"Trnava|Slovakia|church", "SB": r"Milwaukee|handicraft|Museum|Vanuatu|unrest", "TK": r"Sign|mission", "MH": r"Burial",
 "CC": r"COCOS ISLAND 20|Costa Rica|Evan and", "AQ": r"Grossi|IAEA", "VI": r"Blasenstein|Kotor|Ephesus|geograph|Kaneo|Newfoundland|Canada|Antigua|New Brunswick|Barbados|Jamaica|Toronto|London|Germany|Austria|Oregon|Michigan|Minnesota|Florida",
 "GF": r"Kourou ?River|Sweden|panneau",
 "BQ": r"Parcheggio|senegalensis|Sabah|Kinabalu|Papar|Sandakan|Mar Saba|Kitts|AIDA|erosion", "GI": r"Cavalcade|Magi|IMO \d|Tarifa", "TF": r"Netherlands|Amsterdam(?! Island)|Luxe|Transit",
}
# Wikipedia article lead images and wildlife slip through a plain search.
ANY = re.compile(r"pandemic|unrest|riot|\bcoup\b|earthquake|tsunami|hurricane|cyclone|election|\bseals?\b|polar bear|penguin|whale|"
                 r"flycatcher|ant[íi]lope|Kobus|lockdown|harvesting|fetching|supermarket|handicraft|"
                 r"Joint U\.S\.|candles|rice cultivation|water for trees|health trail", re.I)
def ok(cc, it):
    text = it["t"] + " " + it.get("p", it["u"])
    if ANY.search(text): return False
    return not (cc in EXCLUDE and re.search(EXCLUDE[cc], text, re.I))
def path(u):
    m = re.search(r"/commons/(?:thumb/)?([0-9a-f]/[0-9a-f]{2}/[^/]+)", u)
    return m.group(1) if m else u
cat = json.load(open(CAT))

# Whole-catalogue clean-up: Wikidata also links countries to topics that are not
# places (Olympic teams, peoples, epidemics, armed forces...) whose lead photo
# is of people or events. Drop those, photos of people, and files shared by
# three or more countries (a generic photo, not a place).
TOPIC = re.compile(r"olympic|paralympic|armed forces|military|\barmy\b|navy|police|law enforcement|genocide|massacre|"
    r"\bpeoples?\b|^[A-Z][a-z]+(?:ans|ians|ese)$|^Portuguese$|language|cuisine|economy of|politics of|history of|"
    r"pandemic|epidemic|flood|earthquake|battle of|\bwar\b|election|electoral|football|cricket|sports? (?:club|complex|stadium)|"
    r"stadium|passport|parliament|national (?:team|assembly)|association|jail|airport|\bair\b|airlines?|airways|"
    r"college|university|school|playing fields|\bcrab\b|seamount|\bgroup$|company|corporation|\bbank\b|\bday$|"
    r"\bInc\b|\bLtd\b|club$|federation|broadcasting|television|radio|newspaper|\bhospital\b|prison|embassy", re.I)
PEOPLE = re.compile(r"children|\bgirls?\b|\bboys?\b|family|people|soldier|marines|rangers|US_Navy|police|policia|"
    r"covid|passport|olympic|stadium|futbol|football|cricket|_vs\._|rugby|athletics|ceremony|MPs|waste_disposal|"
    r"agriculture|project|giraffe|zebra|baboon|amala|lamb_and_rice|cuisine|chamber|students|commodore", re.I)
from collections import Counter
uses = Counter(k for v in cat.values() for k in {path(y["u"]) for y in v})
for cc in list(cat):
    cat[cc] = [x for x in cat[cc] if not TOPIC.search(x["t"]) and not PEOPLE.search(x["u"].rsplit("/", 1)[-1]) and uses[path(x["u"])] < 3]

# Any other country left with fewer than 8 photos: search its name and main
# cities, keeping only photos that also name the country.
LOCS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "world-locations.json")))
AUTO = {}
for loc in LOCS:
    if loc["code"] not in TERMS and len(cat.get(loc["code"], [])) < 8:
        AUTO[loc["code"]] = NAME.get(loc["code"], loc["name"]).split(" (")[0]
        TERMS[loc["code"]] = [AUTO[loc["code"]]] + [c["name"] for c in loc["cities"][:3]]

for cc in cat:
    cat[cc] = [x for x in cat[cc] if ok(cc, x)]
for cc, terms in TERMS.items():
    have = cat.setdefault(cc, [])
    seen = {path(x["u"]) for x in have}
    if len(have) >= 8: continue
    got = []
    for t in terms:
        pre = re.compile(r"\b" + re.escape(t.split(" (")[0].replace(" Réunion", "")) + r"\b", re.I)
        for q in (f'"{t}" incategory:Quality_images', f'"{t}" incategory:Featured_pictures_on_Wikimedia_Commons', f'"{t}"'):
            got += candidates(search(q, 40), cc, pre)
        if len(got) >= 30: break
    stem = lambda s: re.sub(r"[\d_\-\s.,()]+", " ", s.lower()).strip()[:22]
    for it in sorted(got, key=lambda x: -x["s"]):
        if len(have) >= 12: break
        if cc in AUTO and not re.search(r"\b" + re.escape(AUTO[cc]) + r"\b", it["t"] + " " + it.get("k", ""), re.I): continue
        if not ok(cc, it) or path(it["u"]) in seen or sum(stem(v["t"]) == stem(it["t"]) for v in have) >= 2: continue
        seen.add(path(it["u"])); it.pop("s", None); it.pop("k", None); it["c"] = ""; have.append(it)
    print(cc, len(have), flush=True)
    json.dump(cat, open(CAT, "w"), ensure_ascii=False, separators=(",", ":"))

# Final form for the app: keep only the Commons path ("a/ab/File_name.jpg");
# the launcher asks thumb.wikimedia.org for a standard size that suits the screen.
out = {cc: [{"u": path(x["u"]), **{k: x[k] for k in ("t", "a", "l", "n", "c")}} for x in v] for cc, v in cat.items()}
json.dump(out, open(CAT, "w"), ensure_ascii=False, separators=(",", ":"))
print("countries:", len(out), "images:", sum(map(len, out.values())))
