# Usage: python3 scripts/world-countries-wikidata.py countries.json  (country names in Arabic, capitals, coordinates)
import json, sys, urllib.parse, urllib.request
UA = "YousufOS-build/1.5 (personal TV launcher; contact via github)"
def sparql(q):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    return json.load(urllib.request.urlopen(req, timeout=120))["results"]["bindings"]
out = sys.argv[1]
countries = sparql("""
SELECT ?c ?iso ?en ?ar ?cap ?capEn ?capAr ?coord ?ccoord WHERE {
  ?c wdt:P297 ?iso .
  FILTER NOT EXISTS { ?c wdt:P576 ?end }
  OPTIONAL { ?c rdfs:label ?en FILTER(lang(?en)="en") }
  OPTIONAL { ?c rdfs:label ?ar FILTER(lang(?ar)="ar") }
  OPTIONAL { ?c wdt:P625 ?ccoord }
  OPTIONAL { ?c wdt:P36 ?cap . ?cap wdt:P625 ?coord .
             OPTIONAL { ?cap rdfs:label ?capEn FILTER(lang(?capEn)="en") }
             OPTIONAL { ?cap rdfs:label ?capAr FILTER(lang(?capAr)="ar") } }
}""")
cities = sparql("""
SELECT ?city ?iso ?en ?ar ?coord ?pop WHERE {
  ?city wdt:P31 wd:Q1637706 ; wdt:P17 ?c ; wdt:P625 ?coord ; wdt:P1082 ?pop .
  ?c wdt:P297 ?iso .
  OPTIONAL { ?city rdfs:label ?en FILTER(lang(?en)="en") }
  OPTIONAL { ?city rdfs:label ?ar FILTER(lang(?ar)="ar") }
}""")
json.dump({"countries": countries, "cities": cities}, open(out, "w"))
print(len(countries), len(cities))
