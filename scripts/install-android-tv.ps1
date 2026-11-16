# Installs YousufOS on an Android TV from a Windows PC and makes it the TV's
# home screen. See docs/android-tv.md. Run it next to YousufOS_<version>_android.apk:
#   powershell -ExecutionPolicy Bypass -File install-android-tv.ps1 [-Ip 192.168.0.105]
param(
  [string]$Ip = "",
  [string]$Apk = "",
  [switch]$Undo
)
# adb writes normal messages to stderr; don't treat them as failures.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkg = "com.nyxel.yousufos"

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

# 1. Google's adb tool (downloaded once, next to this script).
$tools = Join-Path $here "platform-tools"
$adb = Join-Path $tools "adb.exe"
if (-not (Test-Path $adb)) {
  Say "Downloading Google's adb tool..."
  $zip = Join-Path $env:TEMP "platform-tools.zip"
  $ProgressPreference = "SilentlyContinue"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  try {
    Invoke-WebRequest "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile $zip -UseBasicParsing
  } catch {
    Say "Couldn't download adb. Check the laptop is connected to the internet, then try again." "Red"
    exit 1
  }
  Expand-Archive $zip -DestinationPath $here -Force
  Remove-Item $zip
}
function Adb { & $adb @args 2>&1 | ForEach-Object { "$_" } }

# 2. Connect to the TV.
if (-not $Ip) { $Ip = Read-Host "The TV's IP address (Settings > Network & Internet > your Wi-Fi), e.g. 192.168.0.105" }
$Ip = $Ip.Trim()
$target = if ($Ip -match ":\d+$") { $Ip } else { "$($Ip):5555" }
Say "Connecting to $target ..."
Adb connect $target | Out-Host
Say "If the TV asks 'Allow USB debugging?', choose 'Always allow from this computer' and OK." "Yellow"
function WaitFor($t, $tries) {
  for ($i = 0; $i -lt $tries; $i++) {
    if ((Adb -s $t get-state) -eq "device") { return $true }
    Start-Sleep -Seconds 2
    if ($i % 5 -eq 4) { Adb connect $t | Out-Null }
  }
  return $false
}
$ok = WaitFor $target 30
if (-not $ok) {
  # Newer TVs: Developer options > Wireless debugging, with a pairing code.
  Say ""
  Say "The TV didn't answer on the usual port." "Yellow"
  Say "On the TV: Settings > System > Developer options > Wireless debugging > turn it ON," "Yellow"
  Say "then choose 'Pair device with pairing code'. The TV shows an IP address & port and a 6-digit code." "Yellow"
  $pairAt = Read-Host "Type the IP address & port shown under the pairing code (e.g. 192.168.0.105:41235), or press Enter to stop"
  if ($pairAt) {
    $code = Read-Host "Type the 6-digit pairing code"
    Adb pair $pairAt $code | Out-Host
    $target = Read-Host "Now type the IP address & port shown at the top of the Wireless debugging screen (e.g. 192.168.0.105:37099)"
    Adb connect $target | Out-Host
    $ok = WaitFor $target 15
  }
}
if (-not $ok) {
  Say "Couldn't connect to the TV. Check that Developer options > USB debugging is ON, that the TV and laptop are on the same Wi-Fi, and that you chose 'Allow' on the TV. Then run this again." "Red"
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
$homeActivity = "$(Adb -s $target shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME | Select-Object -Last 1)".Trim()
$stock = @("com.google.android.apps.tv.launcherx", "com.google.android.tvlauncher", "com.google.android.leanbacklauncher")

if ($Undo) {
  $saved = Join-Path $here "disabled-launcher.txt"
  if (Test-Path $saved) { $stock += (Get-Content $saved | Where-Object { $_ }) }
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
$result = Adb -s $target install -r $Apk
$result | Out-Host
if (-not ($result -match "Success")) {
  Say "Installing didn't work (see the message above). Send a photo of this window to Yousuf." "Red"
  exit 1
}

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
$current = if ($homeActivity -match "^[\w.]+/") { $homeActivity.Split("/")[0] } else { "" }
if ($current -and $current -ne $pkg -and $current -ne "android" -and $current -notlike "com.android.settings*") {
  Say "The TV's home screen was $current; switching it off so Home opens YousufOS."
  Adb -s $target shell pm disable-user --user 0 $current | Out-Host
  # Remembered so "Undo YousufOS" can switch it back on.
  Add-Content -Path (Join-Path $here "disabled-launcher.txt") -Value $current
}
foreach ($p in $stock) { Adb -s $target shell pm disable-user --user 0 $p 2>$null | Out-Null }
Adb -s $target shell cmd package set-home-activity "$pkg/.MainActivity" 2>$null | Out-Null
Adb -s $target shell am start -n "$pkg/.MainActivity" | Out-Null

Say ""
Say "YousufOS is installed and is now the TV's home screen." "Green"
Say "To go back to the TV's own home screen later: double-click 'Undo YousufOS.bat' in this folder."
