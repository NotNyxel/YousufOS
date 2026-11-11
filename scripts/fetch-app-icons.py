#!/usr/bin/env python3
"""Refreshes the square app icons in src/assets/apps/ from the App Store
(public iTunes Search API). Run from the project root:
    pip install pillow && python3 scripts/fetch-app-icons.py
Wide wordmark logos (youtube, netflix, primevideo, shahid) are not touched.
"""
import io, json, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw

APPS = {  # file id -> App Store search term
    "disneyplus": "Disney+", "osnplus": "OSN+", "starzplay": "STARZPLAY", "appletv": "Apple TV",
    "tod": "TOD by beIN", "weyyak": "Weyyak", "dubaiplus": "Dubai+ Dubai Media", "crunchyroll": "Crunchyroll",
    "twitch": "Twitch", "youtubekids": "YouTube Kids", "plex": "Plex", "jellyfin": "Jellyfin Mobile",
    "spotify": "Spotify", "anghami": "Anghami", "youtubemusic": "YouTube Music", "quran": "Quran.com",
    "googlephotos": "Google Photos", "homeassistant": "Home Assistant",
}

for fid, term in APPS.items():
    url = "https://itunes.apple.com/search?" + urllib.parse.urlencode({"term": term, "entity": "software", "country": "ae", "limit": 1})
    results = json.load(urllib.request.urlopen(url, timeout=20))["results"]
    if not results:
        print("not found:", fid)
        continue
    art = results[0]["artworkUrl512"]
    im = Image.open(io.BytesIO(urllib.request.urlopen(art, timeout=30).read())).convert("RGB").resize((512, 512), Image.LANCZOS)
    mask = Image.new("L", (512, 512), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 511, 511), radius=112, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    out.save(f"src/assets/apps/{fid}.png", optimize=True)
    print("ok", fid, "-", results[0]["trackName"])
    time.sleep(3)  # the API rate-limits bursts
