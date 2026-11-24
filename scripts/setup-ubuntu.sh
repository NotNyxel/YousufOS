#!/usr/bin/env bash
# One-time setup to turn an Ubuntu laptop into a YousufOS TV box.
# Run as your normal user (it will ask for sudo where needed):
#   bash scripts/setup-ubuntu.sh            # runtime setup only
#   bash scripts/setup-ubuntu.sh --dev      # also install build tools (Rust, Node, WebKitGTK headers)
set -euo pipefail

DEV=0
[[ "${1:-}" == "--dev" ]] && DEV=1

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

say "Installing runtime packages (playerctl pauses media during the Adhan)"
sudo apt-get update
sudo apt-get install -y playerctl libwebkit2gtk-4.1-0 wget gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav mpv ffmpeg pulseaudio-utils

if ! command -v google-chrome-stable >/dev/null 2>&1; then
  say "Installing Google Chrome (needed for Netflix / Prime Video DRM)"
  tmp=$(mktemp -d)
  wget -q -O "$tmp/chrome.deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt-get install -y "$tmp/chrome.deb"
  rm -rf "$tmp"
fi

if [[ $DEV == 1 ]]; then
  say "Installing build tools"
  sudo apt-get install -y build-essential curl file libwebkit2gtk-4.1-dev libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev libudev-dev
  if ! command -v cargo >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  fi
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
fi

say "Creating folders"
mkdir -p "$HOME/Pictures/YousufOS"   # custom wallpapers go here
mkdir -p "$HOME/Music/Adhan"          # makkah.mp3, madinah.mp3, mishary.mp3, fajr.mp3
mkdir -p "$HOME/.config/autostart"

say "TV-friendly GNOME settings (no screen blanking, no lock screen)"
if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.session idle-delay 0 || true
  gsettings set org.gnome.desktop.screensaver lock-enabled false || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' || true
  gsettings set org.gnome.desktop.notifications show-banners false || true
fi

say "Starting YousufOS at login"
cat > "$HOME/.config/autostart/yousufos.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=YousufOS
Exec=yousufos
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=3
DESKTOP

say "Done"
cat <<'MSG'
Next steps:
  1. Install YousufOS:   sudo apt install ./YousufOS_1.9.1_amd64.deb
     (or build it:       npm install && npm run bundle)
  2. Settings > Users > Automatic Login  -> ON   (boots straight to YousufOS)
  3. On the login screen, click the gear and pick "Ubuntu on Xorg"
     (needed for the back-to-launcher keys and for using an Xbox
     controller inside Netflix/YouTube).
  4. Settings > Keyboard > Custom Shortcuts: add command "yousufos" and
     bind it to your remote's Home button. Pressing it closes the
     current app and returns to the launcher (works on Wayland too).
  5. Copy adhan MP3s into ~/Music/Adhan (makkah.mp3, madinah.mp3, mishary.mp3, fajr.mp3).
MSG
