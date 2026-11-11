import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
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
