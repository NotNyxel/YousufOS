# Changelog

Every YousufOS release. Install a release on the TV laptop with
`sudo apt install ./YousufOS_<version>_amd64.deb`, or let the TV update itself
(Settings → System → Updates, from 1.7.0).

The source code in this repository starts with 1.7.0. Earlier versions are available as installers on their releases.

## 1.8.0 · 11 November 2026

The Ramadan-ready update.

### Qur'an
- A new **Qur'an** page in the sidebar: the 114 surahs, the 30 juz, bookmarks and downloads. The Uthmani text is built in, so reading works without internet.
- Read a surah verse by verse with a translation under each verse, or switch to **Mushaf** view and turn the pages of the Madinah mushaf with ← →.
- Recitation verse by verse from 16 reciters (Mishary Alafasy, Abdul Rahman Al-Sudais, Saud Al-Shuraim, Maher Al-Muaiqly, Al-Husary, Abdul Basit and more), plus English and Urdu translation recitations. The verse being recited is highlighted and the page follows it. The basmala is recited before each surah.
- OK on a verse: play from here, play only this verse, repeat it 3 times, bookmark it, or read its tafsir.
- Recitation keeps playing on other pages (a small chip at the top), and pauses for the Adhan, Live TV, films and apps.
- Downloads: whole reciters or single surahs for listening offline, and any of 118 translations in 48 languages and 6 tafsir for reading offline.
- YousufOS remembers where you stopped reading.

### Ramadan mode
- Turns on by itself when Ramadan begins, or switch it on any time to try it (Settings → Prayer & Adhan).
- Home: the day of Ramadan and a countdown to iftar or to the end of suhoor.
- Suhoor alarm before Fajr (15–90 minutes before), on the TV and on your phones.
- The Maghrib Adhan screen shows the dua for breaking the fast; an "Iftar time" message on your phones.
- Laylat al-Qadr reminders with its dua on the odd nights of the last ten.
- Prayer page: Taraweeh tracker (30 nights) and Qur'an khatm tracker (a juz a day, with "Read juz N").

### Kids profile
- Only the apps you allow, Live TV with children's and Qur'an channels only, games and the Qur'an, and optionally a child's Jellyfin account.
- A daily time limit and a bedtime; when time is up everything stops and a friendly screen appears.
- A 4-digit parent PIN to leave the profile or add 30 minutes. The phone panel can switch it on and off and add time too.

### Sleep timer
- In the sidebar and on the phone: in 15–120 minutes or at the end of what's playing.
- Then stop and turn the screen off, put the laptop to sleep, or just stop playing. A minute before, it offers 15 more minutes.

### Cameras and the doorbell
- A **Cameras** page with live pictures from cameras with a stream address (RTSP, HLS, MJPEG, picture links) or from Home Assistant; OK watches one full screen.
- When the doorbell rings, its camera pops up in a corner with a chime and a message on your phones. Rings come from a Home Assistant entity or from `/api/doorbell` on the TV.
- The phone panel shows camera pictures, puts a camera on the TV and can test the doorbell.

### Server monitor (phone panel)
- A new **Server** tab: each processor core, memory, storage, network speed, temperatures, the busiest programs, Docker containers (start / stop / restart), services and Tailscale.

### Fixes
- Qur'an text in the Amiri font: some letters (like ىٰ) were drawn below the line on the TV. The Ayah of the day card had this too.

## 1.7.1 · 11 November 2026

### Fixes
- Home: with Jellyfin's Continue Watching row showing, the app card at the bottom was pushed off the screen. The clock now gets smaller while the row is there, so everything fits.
- Phone panel: the pairing screen now points to Settings → Phone & Remote (it named a menu that doesn't exist).
- The version shown in Settings and sent to Jellyfin now always matches the installed version.

## 1.7.0 · 11 November 2026

The biggest update so far: YousufOS can now be controlled, updated and backed up from any device in the house.

### Phone & Remote (admin panel)
- A control panel for phones, tablets and computers on the same Wi-Fi at `http://<TV-IP>:8686`. Settings → Phone & Remote shows the address, a QR code and a 6-digit PIN.
- Works as an installable app on iPhone, iPad and Android: Share → Add to Home Screen.
- **Remote:** D-pad, OK, Back, Home, media keys and volume. Type into the TV from your phone keyboard.
- **Watch:** open apps, change Live TV channels, start recordings, cast a YouTube link, video link or photo to the TV.
- **Files:** recordings and Jellyfin downloads, with delete.
- **Settings:** edit YousufOS settings, back up and restore.
- **System:** CPU, memory, disk, temperature and uptime, the activity log, restart or shut down, check for updates.
- Each device pairs once with the PIN. Paired devices can be removed on the TV. Wrong PINs are rate-limited.

### Phone notifications
- Prayer-time notifications on your phones through the free ntfy app (Android and iPhone).
- Optional notification when a recording finishes, and a test button.

### Search
- A new Search page in the sidebar: one search across apps, YouTube, Jellyfin and Live TV channels.
- English and Arabic on-screen keyboard, or type from your phone.

### Live TV
- Picture-in-picture: press X on a channel to keep it playing in a small window. Corner, size and mute are adjustable.
- Record a channel now or schedule a recording. Files go to `~/Videos/YousufOS/Recordings`.

### Jellyfin
- Continue Watching row on Home.
- Profiles: "Who's watching?" with several Jellyfin accounts.
- Downloads: single episodes, films or whole seasons, which play offline when the server is off.
- Wake-on-LAN: wakes the Jellyfin PC automatically when it's unreachable.
- Watch together (Jellyfin SyncPlay): play, pause and seek stay in sync with other devices.

### Morning screen
- At a time and on days you choose: date, prayer times and weather, with an optional chime.

### Updates and backups
- Automatic updates from GitHub releases. The TV checks daily, verifies the download against SHA256SUMS and asks for the Ubuntu password before installing.
- Backup and restore of all settings to the laptop or a USB stick, or from your phone.

### Other
- The admin panel, phone notifications, morning screen, Jellyfin Home row, profile picker, Wake-on-LAN and auto-updates can all be switched on or off.
- 155 new Arabic translations.
- New package dependencies: `ffmpeg` (recording) and `pkexec` (installing updates).

## 1.6.0 · 11 November 2026

### The YousufOS Jellyfin app
- Jellyfin rebuilt in the YousufOS style, made for the remote and the Xbox controller instead of a mouse.
- Sign in with Quick Connect (enter a code on your phone) or a user name and password.
- Home with Continue watching, Next up and Recently added in each library. Categories appear only for libraries you have (films, shows, music and more).
- Film and show pages with seasons, episodes, "More like this", favourites and watched/unwatched.
- Playback in mpv for every format, with resume, audio and subtitle choice, "Skip intro", and progress synced back to the server.
- Music: albums, shuffle and playback inside YousufOS.
- Search across films, shows and music.
- Full Arabic and right-to-left support.
- Jellyfin's own web page is still one switch (or Y on the tile) away.

### Remote navigation in web apps
- The D-pad and remote arrows jump between buttons, posters and links in web apps like Netflix, Shahid and YouTube, with a visible highlight. The left stick still moves a pointer.
- Fixes for Shahid cards, page jumps when scrolling and carousel arrows that only appeared on hover.

## 1.5.0 · 11 November 2026

### Wallpapers from your location
- Photos of your city and the rest of your country from Wikimedia Commons, changing through the day: 3,580 photos covering 250 countries and territories.
- Photo credit shown on screen.
- The built-in UAE photos are used when the location's photos can't load.

### Location and prayer times
- Choose any country, then a city.
- More calculation methods: Moonsighting Committee, Turkey (Diyanet), Tehran, and Singapore / Malaysia / Indonesia.
- A confirmation of the location and calculation method after setting it.

## 1.4.0 · 1 November 2026

### New
- **Browser:** a TV-friendly web browser inside YousufOS with search, quick links, back, forward and reload.
- **On-screen keyboard:** opens when the controller selects a text box in any app (X also opens it), in English and Arabic.
- **Weather:** today's temperature and conditions under the clock.
- **Home layouts:** one large app card (← → to switch) next to the Ayah of the day, with switches for app cards, the Ayah and today's hadith.
- **Servers on your network:** set the Jellyfin and Home Assistant addresses in Settings → Apps.

### Live TV
- More official channels: Al Saudiya, Al Ekhbariya, Sharjah TV, Sharjah 2, CNBC Arabia and Al Jazeera Mubasher.

## 1.3.0 · 1 November 2026

### Apps open inside YousufOS
- Apps now open inside YousufOS: no extra windows, cookie pop-ups accepted automatically, links stay on screen.
- Protected services (Netflix, Shahid and others) open in full-screen Chrome. Each app can be set to open in Chrome, and Y on a tile opens it there once.
- Xbox controller inside apps: left stick pointer, A to click, right stick to scroll, X play/pause, Y fullscreen, LB / RB to skip 10 seconds. The Xbox button or F12 returns to YousufOS.

### New free-to-watch apps
- tabii (TRT), Dubai+ (Awaan), Al Jazeera 360, Weyyak, Plex Free Movies, Viki, NASA+, Red Bull TV, TED and Classic Films (Internet Archive).

### Live TV
- **Official channels** straight from the broadcasters: Makkah (Qur'an TV), Madinah (Sunnah TV), Al Jazeera, Al Jazeera English, Al Arabiya, Al Hadath, Sky News Arabia, Asharq News, France 24 Arabic, DW Arabic and TRT Arabi.
- If the built-in player can't play a channel, mpv takes over automatically.
- Favourites with Y, and clearer messages when a channel is offline or blocked in your country.

### Other
- Controller help screen and on-screen controls guide.
- New package dependencies: `mpv` and audio utilities.

## 1.2.0 · 31 October 2026

### New sections
- **Live TV:** free channel lists from iptv-org (UAE, Saudi, Arabic, Religious, News, Kids, Documentary, Sports), favourites, ▲ ▼ to change channel.
- **Games:** Snake, Blocks, 2048, Memory Match and Tic-Tac-Toe, with best scores.
- **22 languages**, with Arabic, Urdu and Persian switching the whole screen to right-to-left.

### Prayer and reminders
- Choice of Adhan voice: Makkah, Madinah, Sheikh Zayed Mosque, Mishary Alafasy and more, with a special Fajr Adhan.
- The Adhan pauses other media and brings YousufOS to the front.
- Eid takbir with audio during the takbir days, and "Eid Mubarak" on Eid days.
- Istighfar reminders with quiet hours at night.
- Hijri date adjustment and Asr method.

### Look and feel
- 14 themes, including Abyss (AMOLED), Liwa Sands, Oasis Palm, Arabian Gulf, Corniche Sunset, Old Souq and Mint Tea.
- Interface and Qur'an fonts, accent colour, card opacity and blur, wallpaper dimming, interface size and visual-effects level (Performance mode for slower laptops).
- Ambient sound: calm music, rain, ocean, desert wind and desert night generated live, or Qur'an recitation.
- Screensaver: Clock, Prayer Focus or UAE Photography, with OLED drift protection.
- More apps with their real logos, including Apple TV, Anghami, Crunchyroll, Google Photos, Home Assistant, Plex and Quran.com.

### System
- Launch at login, restart, shut down and exit to the Ubuntu desktop.
- Xbox controller support across YousufOS.
- New package dependencies: GStreamer plugins for the built-in video player.

## 1.1.0 · 31 October 2026

- **Ayah of the day** on Home: a Qur'an verse in Arabic with English translation and tafsir.
- **Istighfar reminders:** a gentle reminder to say Astaghfirullah.
- More UAE photo wallpapers.
- New themes: Onyx (AMOLED), Crimson Moon, Desert Khaki, Under the Sea and Cotton Candy.
- Amiri Qur'an font.
- Home screen settings, including pinned apps side by side.
- Netflix and Prime Video open in Google Chrome so protected video plays.

## 1.0.0 · 31 October 2026

The first release.

- Google TV-style Home with a large clock, Gregorian and Hijri date, location, next-prayer countdown and UAE photo wallpapers.
- Prayer page with Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha, the current prayer highlighted, and countdowns to Ramadan, the Eids, Arafah, Islamic New Year and Ashura.
- Adhan at prayer times with a full-screen notice.
- Today's hadith: 30 short authentic hadith, changing daily.
- News page and app shortcuts (YouTube, Netflix, Prime Video, Shahid, Disney+, OSN+, STARZPLAY, Jellyfin).
- Settings for appearance, backgrounds, location, prayer (UAE Awqaf, Umm Al-Qura, Muslim World League and more), screensaver and system.
- Location detected automatically, or chosen from UAE emirates, Gulf and other cities.
