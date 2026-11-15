# YousufOS on Android TV

YousufOS 1.9 also runs on Android TV and Google TV: TVs with Android built in
(for example ClassPro, TCL, Sony, Hisense) and boxes such as the Chromecast
with Google TV, Nvidia Shield or Mi Box. It replaces the TV's home screen, so
the TV starts in YousufOS and the remote's **Home** button comes back to it.

Nothing on the TV is changed permanently: the TV's own home screen is only
switched off, and one command switches it back on (see *Undo* below).

## What works

- Home, Prayer and the Adhan (YousufOS comes to the front at prayer time, even
  over Netflix or YouTube), Qur'an with downloads, Ramadan, Kids profile,
  News, Games, Search, Weather, the screensaver and the sleep timer.
- **Apps:** the TV's own Android apps. Apps YousufOS knows (YouTube, Netflix,
  Shahid, Prime Video…) show with their YousufOS tiles; everything else
  installed is listed too. Known apps that aren't installed open in Google Play.
- **Live TV, Jellyfin, cameras:** played in YousufOS's Android video player
  (hardware decoding, subtitles and audio tracks, up to 4K).
- **Phone remote and admin panel** (`http://<TV address>:8686`), including
  the doorbell and the camera window over other apps.
- **Updates** from GitHub, like on the laptop.

Not on Android: recording Live TV, Jellyfin downloads, the server monitor
(that's for the laptop), and turning the TV off (the sleep timer darkens the
screen and lets the TV switch itself off).

## The remote

| Button | In YousufOS | In the video player |
| --- | --- | --- |
| Arrows, OK | Move, select | ◀ ▶ −10 s / +10 s · OK pause |
| Back | Back | Close the video |
| Home | Back to YousufOS | Back to YousufOS |
| Channel ▲ ▼ | Switch pages | Change channel (Live TV) |
| Menu / Info | Jump to the sidebar | Show the controls |
| Play / Pause | Play or pause the recitation | Play or pause |
| Red · Green · Yellow · Blue | Live TV · Qur'an · Prayer · Apps | |

Volume, Power, Input and the remote's Netflix / YouTube buttons are handled
by the TV itself, as before.

## First install (about 10 minutes, from a Windows PC)

You need the TV and the PC on the same Wi-Fi, and the file
`YousufOS_<version>_android.apk` from the
[latest release](https://github.com/NotNyxel/YousufOS/releases/latest).

### 1. Turn on developer options on the TV

1. **Settings → System → About** (on some TVs: **Settings → Device Preferences → About**).
2. Select **Android TV OS build** 7 times, until it says *You are now a developer*.
3. Back to **Settings → System → Developer options** (or **Device Preferences → Developer options**).
4. Turn on **USB debugging** and, if it's listed, **Network debugging** /
   **Wireless debugging**.
5. Note the TV's IP address: **Settings → Network & Internet → (your Wi-Fi)**,
   for example `192.168.0.105`.

YousufOS also needs a recent **Android System WebView** (version 111 or
newer). The installer checks it; if it's too old, update *Android System
WebView* from Google Play on the TV.

### 2. Run the installer on the PC

Put `YousufOS_<version>_android.apk` and `scripts\install-android-tv.ps1` in
the same folder, then right-click the script → **Run with PowerShell**
(or run `powershell -ExecutionPolicy Bypass -File install-android-tv.ps1`).
It asks for the TV's IP address, then:

1. downloads Google's `adb` tool (once),
2. connects to the TV. **The TV asks "Allow USB debugging?": choose
   *Always allow from this computer* → OK,**
3. installs YousufOS,
4. lets it show over other apps (Adhan, doorbell), install its own updates
   and keep exact prayer-time alarms,
5. makes YousufOS the home screen (switches the TV's own home screen off).

Press **Home** on the remote: YousufOS opens. The first start asks for the
location like on the laptop.

### Doing it by hand

```
adb connect 192.168.0.105
adb install -r YousufOS_1.9.0_android.apk
adb shell appops set com.nyxel.yousufos SYSTEM_ALERT_WINDOW allow
adb shell appops set com.nyxel.yousufos REQUEST_INSTALL_PACKAGES allow
adb shell appops set com.nyxel.yousufos SCHEDULE_EXACT_ALARM allow
# Which app is the home screen now?
adb shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME
# Switch it off (Android TV: com.google.android.tvlauncher · Google TV: com.google.android.apps.tv.launcherx)
adb shell pm disable-user --user 0 com.google.android.tvlauncher
```

## Undo (back to the TV's own home screen)

```
adb shell pm enable com.google.android.tvlauncher
adb uninstall com.nyxel.yousufos
```

(Use the launcher name the installer printed, e.g.
`com.google.android.apps.tv.launcherx` on Google TV.) A factory reset of the
TV also brings everything back.

## Updates

**Settings → System → Updates** works as on the laptop: add the GitHub token,
then *Install the update*. Android shows its own *Do you want to update this
app?* screen; choose **Update**. The phone admin panel can also send an
`.apk` to the TV (**System → Updates → Install a file**).
