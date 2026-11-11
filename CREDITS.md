# Credits

## Wallpapers (`src/assets/wallpapers/`)
New photos are from **Pexels** (free to use under the [Pexels licence](https://www.pexels.com/license/)), resized to 3840 px:

| File | Source |
|---|---|
| desert-camel-in-the-dunes | https://www.pexels.com/photo/a-camel-at-a-desert-10794659/ |
| desert-camels-at-sunset | https://www.pexels.com/photo/camel-on-desert-at-sunset-17887613/ |
| desert-al-ain-dunes | https://www.pexels.com/photo/golden-sand-dunes-in-al-ain-desert-at-sunset-28718301/ |
| mosques-sharjah-grand-mosque | https://www.pexels.com/photo/sharjah-grand-mosque-in-united-arab-emirates-11143082/ |
| mosques-sheikh-zayed-grand-mosque-2-night | https://www.pexels.com/photo/the-sheikh-zayed-grand-mosque-at-night-13299493/ |
| mosques-sheikh-zayed-grand-mosque-illuminated-night | https://www.pexels.com/photo/sheikh-zayed-grand-mosque-illuminated-at-night-30667319/ |
| mosques-sheikh-zayed-grand-mosque-courtyard | https://www.pexels.com/photo/white-mosque-under-blue-sky-5075318/ |
| landmarks-dubai-marina | https://www.pexels.com/photo/stunning-aerial-view-of-dubai-marina-skyline-29470811/ |
| landmarks-dubai-marina-sunset-night | https://www.pexels.com/photo/amazing-dubai-marina-skyline-at-sunset-united-arab-emirates-5686514/ |
| landmarks-louvre-abu-dhabi | https://www.pexels.com/photo/the-louvre-abu-dhabi-in-united-arab-emirates-15127414/ |
| desert-rippled-sand | https://www.pexels.com/photo/16726602/ |
| mosques-sheikh-zayed-grand-mosque-arcade | https://www.pexels.com/photo/33105187/ |
| mosques-mosque-interior-dubai | https://www.pexels.com/photo/33276338/ |
| mosques-minarets-at-sunset | https://www.pexels.com/photo/7539843/ |
| landmarks-dubai-miracle-garden | https://www.pexels.com/photo/14100885/ |
| mosques-mosque-at-sunset-night | https://www.pexels.com/photo/1631676/ |
| desert-wind-sculpted-dunes | https://www.pexels.com/photo/3521944/ |
| landmarks-dubai-fountain-night | https://www.pexels.com/photo/692104/ |
| mosques-sheikh-zayed-grand-mosque-reflections | https://www.pexels.com/photo/14232531/ |
| desert-red-dunes-from-above | https://www.pexels.com/photo/8982040/ |
| mosques-the-kaaba-makkah-night | https://www.pexels.com/photo/26436656/ |
| landmarks-burj-al-arab-beach | https://www.pexels.com/photo/2857716/ |
| desert-emirati-falconer | https://www.pexels.com/photo/31356039/ |
| landmarks-qasr-al-watan | https://www.pexels.com/photo/15128974/ |
| landmarks-qasr-al-watan-2 | https://www.pexels.com/photo/15129763/ |
| landmarks-burj-al-arab | https://www.pexels.com/photo/2044434/ |
| desert-camels-at-dusk | https://www.pexels.com/photo/28902520/ |
| landmarks-ain-dubai | https://www.pexels.com/photo/4531669/ |
| desert-camel-caravan | https://www.pexels.com/photo/15848441/ |
| landmarks-abu-dhabi-skyline-night | https://www.pexels.com/photo/28406821/ |
| landmarks-hatta-mountains | https://www.pexels.com/photo/10004805/ |
| landmarks-qasr-al-watan-domes | https://www.pexels.com/photo/15129759/ |
| landmarks-dubai-miracle-garden-2 | https://www.pexels.com/photo/15131322/ |
| desert-caravan-in-the-valley | https://www.pexels.com/photo/17472762/ |

The other eight are Yousuf's original photos (originals kept in `src/assets/backgrounds/`).

## Adhan & takbir audio (`public/adhan/`)
Downloaded from the Internet Archive, loudness-normalised and trimmed:

| File | Recording | Source |
|---|---|---|
| makkah.mp3 | Adhan, Masjid al-Haram | https://archive.org/details/full-madinah.mp3 (full-makkah) |
| madinah.mp3 | Adhan, Masjid an-Nabawi | https://archive.org/details/full-madinah.mp3 |
| mishary.mp3 | Sheikh Mishary Rashid Alafasy | https://archive.org/details/AdhanMisharyRashid |
| fajr.mp3 | Mishary Alafasy, Fajr, maqam Hijaz | https://archive.org/details/adhan-call-to-prayer-mishary-rashid-alafasy-fajr-maqam-hijaz-hd-320-kbps-1 |
| dubai.mp3 | Sheikh Abdulrahman Al Hindi | https://archive.org/details/dubai-athan_202603 |
| takbir.mp3 | Eid takbeerat, Sheikh Ali Ahmed Mullah (Masjid al-Haram) | https://archive.org/details/MuadhinsMakkah |

No Sheikh Zayed Grand Mosque recording with a clear source was found; put one at `~/Music/Adhan/sheikhzayed.mp3`.

## Qur'an (`src/data/quran.js`)
Uthmani text from Tanzil, Sahih International translation and Tafsir al-Muyassar, retrieved from https://alquran.cloud (see `scripts/fetch-quran.py`).

## App logos (`src/assets/apps/`)
Square app icons are the official App Store icons (via the public iTunes Search API, `scripts/fetch-app-icons.py`); wordmarks for YouTube, Netflix, Prime Video and Shahid are Yousuf's originals. All logos are trademarks of their owners and are used only to label the apps.

## Live TV
Channel lists: https://github.com/iptv-org/iptv (public, freely available streams).

## Ambient sound
Rain, ocean, wind, night and the calm music are synthesised in `src/lib/ambient.js`. Qur'an recitation streams from https://quranicaudio.com.

## 1.3 additions
* Free app icons (tabii, Al Jazeera 360, NASA, Internet Archive, TED, Red Bull TV, Viki): App Store artwork via the public iTunes Search API.
* Channel logos: from the iptv-org channel database (imgur), Saudi Broadcasting Authority (aloula.faulio.com) and Wikimedia Commons (Al Arabiya, TRT World).
* Live TV fallback player: [mpv](https://mpv.io) (GPL/LGPL), installed as a system package.

## 1.5 additions
* Location wallpapers: photographs from [Wikimedia Commons](https://commons.wikimedia.org), each under its own free licence (CC BY, CC BY-SA, CC0 or public domain). The photographer and licence are shown on screen with every photo; the file page is listed in `src/data/world-wallpapers.json` (`p`). Places were chosen through [Wikidata](https://www.wikidata.org) (CC0).
* Countries, capitals and cities: [GeoNames](https://www.geonames.org) (CC BY 4.0) and Wikidata (CC0).
