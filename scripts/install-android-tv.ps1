# Installs YousufOS on an Android TV from a Windows PC and makes it the TV's
# home screen. See docs/android-tv.md. Run it next to YousufOS_<version>_android.apk:
#   powershell -ExecutionPolicy Bypass -File install-android-tv.ps1 [-Ip 192.168.0.105]
param(
  [string]$Ip = "",
  [string]$Apk = "",
  [switch]$Undo
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkg = "com.nyxel.yousufos"

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

# 1. Google's adb tool (downloaded once, next to this script).
$tools = Join-Path $here "platform-tools"
$adb = Join-Path $tools "adb.exe"
if (-not (Test-Path $adb)) {
  Say "Downloading Google's adb tool..."
  $zip = Join-Path $env:TEMP "platform-tools.zip"
  Invoke-WebRequest "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $here -Force
  Remove-Item $zip
}
function Adb { & $adb @args }

# 2. Connect to the TV.
if (-not $Ip) { $Ip = Read-Host "The TV's IP address (Settings > Network & Internet > your Wi-Fi), e.g. 192.168.0.105" }
$target = if ($Ip -match ":\d+$") { $Ip } else { "$($Ip):5555" }
Say "Connecting to $target ..."
Adb connect $target | Out-Host
Say "If the TV asks 'Allow USB debugging?', choose 'Always allow from this computer' and OK." "Yellow"
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  $state = (Adb -s $target get-state 2>$null)
  if ($state -eq "device") { $ok = $true; break }
  Start-Sleep -Seconds 2
  if ($i % 5 -eq 4) { Adb connect $target | Out-Null }
}
if (-not $ok) {
  Say "Couldn't connect. Check that Developer options > USB debugging (and Network debugging) is on, and that the TV and PC are on the same Wi-Fi." "Red"
  exit 1
}
Say "Connected: $(Adb -s $target shell getprop ro.product.model)" "Green"

# YousufOS needs a recent Android System WebView (Chrome 111 or newer).
$wv = (Adb -s $target shell dumpsys webviewupdate | Select-String "Current WebView package" | Select-Object -First 1)
if ($wv) {
  Say "$($wv.ToString().Trim())"
  if ($wv.ToString() -match ", ([0-9]+)\.") {
    if ([int]$Matches[1] -lt 111) {
      Say "This TV's WebView is too old for YousufOS. On the TV open Google Play, search 'Android System WebView' and update it, then run this again." "Red"
      exit 1
    }
  }
}

# The TV's own home screen.
$homeActivity = (Adb -s $target shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME | Select-Object -Last 1).Trim()
$stock = @("com.google.android.apps.tv.launcherx", "com.google.android.tvlauncher", "com.google.android.leanbacklauncher")

if ($Undo) {
  foreach ($p in $stock) { Adb -s $target shell pm enable $p 2>$null | Out-Null }
  Adb -s $target uninstall $pkg | Out-Host
  Say "Done: the TV's own home screen is back." "Green"
  exit 0
}

# 3. Install YousufOS.
if (-not $Apk) { $Apk = Get-ChildItem $here -Filter "YousufOS_*_android.apk" | Sort-Object LastWriteTime | Select-Object -Last 1 -ExpandProperty FullName }
if (-not $Apk -or -not (Test-Path $Apk)) {
  Say "Put YousufOS_<version>_android.apk next to this script (from the GitHub release), then run it again." "Red"
  exit 1
}
Say "Installing $(Split-Path -Leaf $Apk) (this takes a minute)..."
Adb -s $target install -r $Apk | Out-Host

# 4. Permissions: show over other apps (Adhan, doorbell), install its own updates, exact prayer alarms.
foreach ($op in @("SYSTEM_ALERT_WINDOW", "REQUEST_INSTALL_PACKAGES", "SCHEDULE_EXACT_ALARM")) {
  Adb -s $target shell appops set $pkg $op allow 2>$null | Out-Null
}

# Check it works before it becomes the home screen.
Adb -s $target shell am start -n "$pkg/.MainActivity" | Out-Null
$answer = Read-Host "YousufOS should be open on the TV now. Does it show and react to the remote? (y/n)"
if ($answer -notmatch "^[yY]") {
  Say "Left the TV's own home screen as it is. YousufOS is in the TV's app list; send the problem to Yousuf." "Yellow"
  exit 0
}

# 5. YousufOS as the home screen: switch the TV's own launcher off (undo: -Undo).
if ($homeActivity -and -not $homeActivity.StartsWith($pkg)) {
  $current = $homeActivity.Split("/")[0]
  Say "The TV's home screen was $current; switching it off so Home opens YousufOS."
  Adb -s $target shell pm disable-user --user 0 $current | Out-Host
}
foreach ($p in $stock) { Adb -s $target shell pm disable-user --user 0 $p 2>$null | Out-Null }
Adb -s $target shell cmd package set-home-activity "$pkg/.MainActivity" 2>$null | Out-Null
Adb -s $target shell am start -n "$pkg/.MainActivity" | Out-Null

Say ""
Say "YousufOS is installed and is now the TV's home screen." "Green"
Say "To go back to the TV's own home screen later: run this script with -Undo"
