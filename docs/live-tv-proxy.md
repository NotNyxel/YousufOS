# Live TV through another country (Tailscale)

Some channels only play inside their own country. YousufOS can send **Live TV
only** (the channels, their small window and recordings) through a computer
in that country, over [Tailscale](https://tailscale.com) (free for personal
use). Everything else on the TV stays direct. It's off until you set it up.

> Check the local rules first: some countries, including the UAE, restrict
> using a VPN or proxy to reach blocked content.

## What you need

- **A computer that stays on in the other country** (for example at a
  relative's home in Saudi Arabia): an old laptop, a mini PC or a Raspberry Pi
  with Ubuntu / Raspberry Pi OS. A Windows PC works too (see below).
- **A Tailscale account** (sign in with Google, Microsoft or GitHub).

## 1. The computer in the other country

1. Install Tailscale and sign in:
   ```
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```
   Open the link it prints and sign in with your Tailscale account.
2. Note its Tailscale address: `tailscale ip -4` (it starts with `100.`).
3. Install a small web proxy, only reachable over Tailscale:
   ```
   sudo apt install tinyproxy
   sudo sed -i 's/^#\?Port .*/Port 8888/; s/^Allow .*/Allow 100.64.0.0\/10/' /etc/tinyproxy/tinyproxy.conf
   sudo systemctl restart tinyproxy
   ```
   (`Allow 100.64.0.0/10` means only devices on your Tailscale network can use it.)
4. Set it to start by itself after a power cut: in the BIOS, *Restore on AC
   power loss → On* (or for a Raspberry Pi, nothing to do).

**Windows instead:** install Tailscale from tailscale.com/download, then a
proxy such as *3proxy* listening on port 8888, and allow it in Windows
Firewall for the Tailscale network only.

## 2. The TV (and/or the laptop)

1. **Android TV:** install **Tailscale** from Google Play and sign in with the
   same account. **Ubuntu laptop:** `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`.
2. In YousufOS: **Settings → Live TV → Through another country (Tailscale)**
   - **Computer's address:** the `100.x.y.z` address from step 1, with the
     port: `100.101.102.103:8888`
   - **Use it:** *Automatic* (only while the TV's internet is in the countries
     under **Only in**, the UAE by default) or *Always*.

The line under **Use it** says whether it's on right now. If the computer in
the other country is off, Live TV simply won't play until you set **Use it**
to *Off*.

## Notes

- Delay: Tailscale connects the two directly when it can; live TV is a few
  hundredths of a second "further away", which you won't notice.
- Only HTTP(S) streams go through it (nearly all channels). The laptop's mpv
  player needs an `http://` proxy address; Android also accepts `socks5://`.
