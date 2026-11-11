#!/usr/bin/env python3
"""Builds the Qur'an that ships with YousufOS (public/quran/):
  quran.json     Uthmani text (Tanzil, via api.alquran.cloud) with surah names,
                 juz, page (Madinah mushaf, 604 pages), hizb quarter and sajda
  en.sahih.json  Sahih International translation, one string per verse
Other translations, tafsir and recitations are downloaded on the TV.
Run from the project root:  python3 scripts/fetch-quran-full.py
"""
import json, os, urllib.request

OUT = "public/quran"
API = "https://api.alquran.cloud/v1/quran/"


def get(edition):
    req = urllib.request.Request(API + edition, headers={"User-Agent": "YousufOS"})
    return json.load(urllib.request.urlopen(req, timeout=120))["data"]


os.makedirs(OUT, exist_ok=True)
q = get("quran-uthmani")
# Al-Fatihah 1:1 is the basmala, in exactly the same letters and marks.
BISMILLAH = q["surahs"][0]["ayahs"][0]["text"].replace("\ufeff", "").strip()
surahs, ayahs = [], []
for s in q["surahs"]:
    name = s["name"].replace("سُورَةُ ", "").strip()
    surahs.append([s["number"], name, s["englishName"], s["englishNameTranslation"], 1 if s["revelationType"] == "Medinan" else 0, len(s["ayahs"])])
    for a in s["ayahs"]:
        text = a["text"].replace("\ufeff", "").strip()
        # The API puts the basmala in front of verse 1; YousufOS shows it as a heading.
        if a["numberInSurah"] == 1 and s["number"] not in (1, 9) and text.startswith(BISMILLAH):
            text = text[len(BISMILLAH):].strip()
        sajda = 1 if a["sajda"] else 0
        ayahs.append([text, a["juz"], a["page"], a["hizbQuarter"], sajda])
assert len(ayahs) == 6236, len(ayahs)
meta = {"source": "Tanzil Uthmani text via api.alquran.cloud", "bismillah": BISMILLAH}
with open(f"{OUT}/quran.json", "w", encoding="utf8") as f:
    json.dump({"meta": meta, "surahs": surahs, "ayahs": ayahs}, f, ensure_ascii=False, separators=(",", ":"))

en = get("en.sahih")
lines = [a["text"].strip() for s in en["surahs"] for a in s["ayahs"]]
assert len(lines) == 6236
with open(f"{OUT}/en.sahih.json", "w", encoding="utf8") as f:
    json.dump(lines, f, ensure_ascii=False, separators=(",", ":"))
print("ok", os.path.getsize(f"{OUT}/quran.json"), os.path.getsize(f"{OUT}/en.sahih.json"))
