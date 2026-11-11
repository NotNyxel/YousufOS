//! YousufOS native layer: launches streaming apps in a kiosk browser,
//! persists config, fetches news feeds (no CORS), handles Adhan
//! interruptions, power actions and the "back to launcher" shortcuts.

use std::{
    fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

mod admin;
mod cameras;
mod monitor;
mod cdp;
mod embed;
mod gamepad;
mod media;
mod player;
mod quran;

/// The streaming app (Chrome process) currently on screen.
#[derive(Default)]
pub(crate) struct Running(Mutex<Option<Child>>);

/// The DevTools connection to that Chrome window.
#[derive(Default)]
pub(crate) struct ChromeLink(Mutex<Option<cdp::Handle>>);

/// What the open app is (embedded view or Chrome).
#[derive(Default)]
pub(crate) struct Current(Mutex<Option<LaunchOpts>>);

#[derive(Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct LaunchOpts {
    pub url: String,
    pub user_agent: Option<String>,
    pub browser: Option<String>,
    /// Open inside YousufOS instead of Chrome.
    pub embed: bool,
    /// A remote-friendly TV interface (YouTube TV): keys, not a pointer.
    pub tv: bool,
    /// Short message shown when the app opens ("Xbox button = Home").
    pub hint: Option<String>,
    /// Controller help rows [button, action] shown with the Menu button.
    pub help: Option<Vec<(String, String)>>,
    /// Make the page's video fill the screen (YouTube live channels).
    pub video_full: bool,
    /// Up / Down change channel (Live TV opened in the app view).
    pub channel_keys: bool,
    /// On-screen keyboard when the controller lands on a text box.
    pub osk: bool,
    /// Interface language (keyboard layout, labels).
    pub lang: Option<String>,
    /// The YousufOS browser: Menu shows a toolbar.
    pub web_browser: bool,
    /// Translated toolbar labels.
    pub bar_labels: Option<serde_json::Value>,
    /// D-pad moves between the page's buttons and links (not in TV apps).
    #[serde(default = "yes")]
    pub dpad: bool,
}

fn yes() -> bool {
    true
}

const INJECT: &str = include_str!("inject.js");

pub(crate) fn inject_script(opts: &LaunchOpts, embedded: bool) -> String {
    let o = serde_json::json!({
        "cookies": true,
        "embedded": embedded,
        "hint": opts.hint,
        "help": opts.help,
        "videoFull": opts.video_full,
        "channelKeys": opts.channel_keys,
        "osk": opts.osk,
        "lang": opts.lang,
        "browser": opts.web_browser,
        "barLabels": opts.bar_labels,
        "tv": opts.tv,
        "dpad": opts.dpad && !opts.tv,
    });
    INJECT.replace("__OPTS__", &o.to_string())
}

/// Commands sent from inside an app page (`yousufos://home`, `drm?u=..`, ...).
pub(crate) fn handle_page_cmd(app: &AppHandle, cmd: &str) {
    let cmd = cmd.trim_start_matches("yousufos://").trim_start_matches("yousufos:");
    let (name, query) = cmd.split_once('?').unwrap_or((cmd, ""));
    let param = |key: &str| {
        query.split('&').find_map(|kv| {
            let (k, v) = kv.split_once('=')?;
            (k == key).then(|| percent_encoding::percent_decode_str(v).decode_utf8_lossy().into_owned())
        })
    };
    match name.trim_end_matches('/') {
        "home" => go_home(app),
        // Browser toolbar: back to the YousufOS start page.
        "start" => embed::open_start_page(app),
        "drm" => {
            // Protected video: reopen this page in Chrome (has Widevine).
            let current = app.state::<Current>().0.lock().unwrap().clone();
            if let Some(mut opts) = current.filter(|o| o.embed) {
                if let Some(u) = param("u") {
                    opts.url = u;
                }
                opts.embed = false;
                embed::close(app);
                let _ = app.emit("app-moved-to-chrome", ());
                if let Err(e) = start_chrome(app, opts) {
                    let _ = app.emit("app-error", e);
                    go_home(app);
                }
            }
        }
        "key" => {
            // A real key press for the page (e.g. YouTube's "f" for fullscreen).
            let key: Option<&'static str> = match param("k").as_deref() {
                Some("f") => Some("f"),
                Some("Enter") => Some("Enter"),
                Some("Escape") => Some("Escape"),
                Some(" ") => Some(" "),
                _ => None,
            };
            if let Some(k) = key {
                if embed::is_open(app) {
                    embed::key(app, k);
                } else if let Some(h) = app.state::<ChromeLink>().0.lock().unwrap().as_ref() {
                    h.send(cdp::Cmd::Key(k));
                }
            }
        }
        "channel" => {
            let d: i32 = param("d").and_then(|v| v.parse().ok()).unwrap_or(1);
            let _ = app.emit("web-channel", d);
        }
        _ => {}
    }
}

// ---------------------------------------------------------------- helpers

fn home_dir(app: &AppHandle) -> PathBuf {
    app.path().home_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn expand(app: &AppHandle, p: &str) -> PathBuf {
    match p.strip_prefix('~') {
        Some(rest) => home_dir(app).join(rest.trim_start_matches(['/', '\\'])),
        None => PathBuf::from(p),
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub(crate) fn show_launcher(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_fullscreen(true);
        let _ = w.set_focus();
    }
}

/// Ask the browser to quit cleanly (so cookies/logins are saved), then force it.
fn stop_child(mut child: Child) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill").arg("-TERM").arg(child.id().to_string()).status();
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

pub(crate) fn stop_running(state: &Running) -> bool {
    let child = state.0.lock().unwrap().take();
    match child {
        Some(c) => {
            stop_child(c);
            true
        }
        None => false,
    }
}

/// Closes whatever app is open (Chrome or the embedded view).
pub(crate) fn close_apps(app: &AppHandle) -> bool {
    app.state::<ChromeLink>().0.lock().unwrap().take();
    let chrome = stop_running(&app.state::<Running>());
    let embedded = embed::close(app);
    app.state::<Current>().0.lock().unwrap().take();
    chrome || embedded
}

pub(crate) fn go_home(app: &AppHandle) {
    if close_apps(app) {
        let _ = app.emit("app-closed", ());
    }
    if player::stop(app) {
        let _ = app.emit("player-closed", serde_json::json!({ "error": false }));
    }
    show_launcher(app);
    let _ = app.emit("go-home", ());
}

fn browser_candidates(preferred: Option<String>) -> Vec<String> {
    let mut list: Vec<String> = Vec::new();
    if let Some(p) = preferred.filter(|s| !s.trim().is_empty()) {
        list.push(p);
    }
    #[cfg(target_os = "windows")]
    let defaults = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];
    #[cfg(not(target_os = "windows"))]
    let defaults = [
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge-stable",
        "microsoft-edge",
        "brave-browser",
    ];
    for d in defaults {
        if !list.iter().any(|x| x == d) {
            list.push(d.to_string());
        }
    }
    list
}

// --------------------------------------------------------------- commands

/// Opens an app: inside YousufOS (embedded view) when `embed` is set,
/// otherwise fullscreen in a chromeless Chrome window (needed for Netflix and
/// other services whose video needs Widevine DRM).
#[tauri::command]
async fn launch_app(app: AppHandle, opts: LaunchOpts) -> Result<(), String> {
    close_apps(&app);
    player::stop(&app);
    if opts.embed {
        *app.state::<Current>().0.lock().unwrap() = Some(opts.clone());
        return embed::open(&app, &opts);
    }
    start_chrome(&app, opts)
}

pub(crate) fn start_chrome(app: &AppHandle, opts: LaunchOpts) -> Result<(), String> {
    let state = app.state::<Running>();
    stop_running(&state);

    let profile = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("browser-profile");
    fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
    // Chrome writes the DevTools port here once it is up.
    let _ = fs::remove_file(profile.join("DevToolsActivePort"));

    let mut args = vec![
        format!("--app={}", opts.url),
        "--kiosk".into(),
        "--start-fullscreen".into(),
        format!("--user-data-dir={}", profile.display()),
        "--no-first-run".into(),
        "--no-default-browser-check".into(),
        "--noerrdialogs".into(),
        "--disable-infobars".into(),
        "--disable-session-crashed-bubble".into(),
        "--hide-crash-restore-bubble".into(),
        "--disable-features=Translate,MediaRouter,IsolateOrigins,site-per-process,PrivacySandboxSettings4".into(),
        "--disable-popup-blocking".into(),
        "--autoplay-policy=no-user-gesture-required".into(),
        "--password-store=basic".into(),
        "--enable-features=VaapiVideoDecodeLinuxGL,VaapiVideoDecoder".into(),
        // Lets YousufOS accept cookie banners, keep pop-ups in the same
        // window and drive the page with the controller.
        "--remote-debugging-port=0".into(),
        "--remote-allow-origins=*".into(),
    ];
    if let Some(ua) = opts.user_agent.as_ref().filter(|s| !s.is_empty()) {
        args.push(format!("--user-agent={ua}"));
    }

    let mut last_err = None;
    for bin in browser_candidates(opts.browser.clone()) {
        match Command::new(&bin)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => {
                let pid = child.id();
                *state.0.lock().unwrap() = Some(child);
                let script = inject_script(&opts, false);
                *app.state::<ChromeLink>().0.lock().unwrap() = Some(cdp::start(app.clone(), profile.clone(), script));
                *app.state::<Current>().0.lock().unwrap() = Some(opts);
                watch_child(app.clone(), pid);
                return Ok(());
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => last_err = Some(format!("{bin}: {e}")),
        }
    }
    Err(last_err.unwrap_or_else(|| {
        "No supported browser found. Install Google Chrome (needed for Netflix & Prime Video).".into()
    }))
}

/// When the user quits the app (Alt+F4, the site's own exit, a crash),
/// bring the launcher back.
fn watch_child(app: AppHandle, pid: u32) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let state = app.state::<Running>();
        let mut guard = state.0.lock().unwrap();
        let exited = match guard.as_mut() {
            Some(c) if c.id() == pid => matches!(c.try_wait(), Ok(Some(_)) | Err(_)),
            _ => return, // replaced or closed by us; whoever did that emits
        };
        if exited {
            guard.take();
            drop(guard);
            app.state::<ChromeLink>().0.lock().unwrap().take();
            app.state::<Current>().0.lock().unwrap().take();
            show_launcher(&app);
            let _ = app.emit("app-closed", ());
            return;
        }
    });
}

#[tauri::command]
fn close_app(app: AppHandle) {
    go_home(&app);
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 YousufOS/1.8")
            .timeout(Duration::from_secs(25))
            .build()
            .expect("http client")
    })
}

#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    let res = http().get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

/// API calls for the built-in Jellyfin app (any method, headers and JSON body;
/// a plain-http server at home works without CORS or mixed-content limits).
/// Returns (status, body); status 0 = no connection.
#[tauri::command]
async fn http_request(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<(u16, String), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("only http(s) addresses".into());
    }
    let m = reqwest::Method::from_bytes(method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut req = http().request(m, &url).timeout(Duration::from_millis(timeout_ms.unwrap_or(15000)));
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            Ok((status, res.text().await.unwrap_or_default()))
        }
        Err(e) => Ok((0, e.to_string())),
    }
}


#[tauri::command]
fn load_config(app: AppHandle) -> Result<Option<String>, String> {
    let path = config_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_config(app: AppHandle, contents: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&contents).map_err(|e| e.to_string())?;
    let path = config_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Lists wallpaper images in a folder (created if it doesn't exist yet).
#[tauri::command]
fn list_images(app: AppHandle, dir: String) -> Result<Vec<String>, String> {
    let dir = expand(&app, &dir);
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
        return Ok(vec![]);
    }
    let mut out: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .and_then(|x| x.to_str())
                .map(|x| matches!(x.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png" | "webp" | "avif"))
                .unwrap_or(false)
        })
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    out.sort();
    Ok(out)
}

/// Returns a local audio file's bytes. WebKitGTK's media player can't read
/// the asset:// protocol, so the Adhan is played from an in-memory Blob.
#[tauri::command]
fn read_media(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let p = expand(&app, &path);
    let bytes = fs::read(&p).map_err(|e| format!("{}: {e}", p.display()))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn expand_path(app: AppHandle, path: String) -> String {
    expand(&app, &path).to_string_lossy().into_owned()
}

/// Prayer time: pause whatever is playing and put the launcher on top.
#[tauri::command]
fn adhan_begin(app: AppHandle, mute_media: bool) {
    if mute_media {
        #[cfg(target_os = "linux")]
        let _ = Command::new("playerctl").args(["--all-players", "pause"]).status();
    }
    // The embedded app sits on top of the launcher: pause and hide it.
    embed::pause_and_hide(&app);
    if player::stop(&app) {
        let _ = app.emit("player-closed", serde_json::json!({ "error": false }));
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_always_on_top(true);
    }
    show_launcher(&app);
}

/// Adhan finished: close the streaming app and return to the launcher.
#[tauri::command]
fn adhan_end(app: AppHandle) {
    if close_apps(&app) {
        let _ = app.emit("app-closed", ());
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_always_on_top(false);
    }
    show_launcher(&app);
}

#[tauri::command]
fn system_action(app: AppHandle, action: String) -> Result<(), String> {
    do_system_action(app, action)
}

pub(crate) fn do_system_action(app: AppHandle, action: String) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    let cmd: Option<(&str, Vec<&str>)> = match action.as_str() {
        "suspend" => Some(("systemctl", vec!["suspend"])),
        "reboot" => Some(("systemctl", vec!["reboot"])),
        "poweroff" => Some(("systemctl", vec!["poweroff"])),
        _ => None,
    };
    #[cfg(target_os = "windows")]
    let cmd: Option<(&str, Vec<&str>)> = match action.as_str() {
        "suspend" => Some(("rundll32.exe", vec!["powrprof.dll,SetSuspendState", "0,1,0"])),
        "reboot" => Some(("shutdown", vec!["/r", "/t", "0"])),
        "poweroff" => Some(("shutdown", vec!["/s", "/t", "0"])),
        _ => None,
    };
    match (action.as_str(), cmd) {
        // Sleep timer: switch the display off (X11; elsewhere YousufOS just shows black).
        ("screen-off", _) | ("screen-on", _) => {
            let mode = if action == "screen-off" { "off" } else { "on" };
            let _ = Command::new("xset").args(["dpms", "force", mode]).spawn();
            Ok(())
        }
        ("exit", _) => {
            close_apps(&app);
            player::stop(&app);
            app.exit(0);
            Ok(())
        }
        (_, Some((bin, args))) => Command::new(bin).args(args).spawn().map(|_| ()).map_err(|e| e.to_string()),
        _ => Err(format!("unknown action {action}")),
    }
}

// ---------------------------------------------------------- Live TV relay

/// `iptv://localhost/<url-encoded stream url>?ua=..&ref=..`
/// Fetches a playlist/segment for the in-app player. Many free streams
/// don't send CORS headers, so the browser engine can't load them directly.
fn iptv_relay(uri: tauri::http::Uri, range: Option<String>, responder: tauri::UriSchemeResponder) {
    use percent_encoding::percent_decode_str;
    let decode = |s: &str| percent_decode_str(s).decode_utf8_lossy().into_owned();
    let path = uri.path().trim_start_matches('/');
    let (mut ua, mut referer) = (None, None);
    let mut extra: Vec<(String, String)> = Vec::new();
    // Current form: /<hex options or ->/<scheme>/<host>/<path>?<query>.
    // It mirrors the real address, so playlists that list their pieces with
    // relative links ("seg1.ts", "../video/seg.ts") resolve correctly.
    let target = match path.splitn(4, '/').collect::<Vec<_>>()[..] {
        [opts, scheme @ ("http" | "https"), host, rest] => {
            if opts != "-" {
                let bytes: Option<Vec<u8>> = (0..opts.len())
                    .step_by(2)
                    .map(|i| opts.get(i..i + 2).and_then(|h| u8::from_str_radix(h, 16).ok()))
                    .collect();
                if let Some(v) = bytes.and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok()) {
                    ua = v["ua"].as_str().map(String::from);
                    referer = v["ref"].as_str().map(String::from);
                    if let Some(h) = v["h"].as_object() {
                        extra = h.iter().filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string()))).collect();
                    }
                }
            }
            let mut t = format!("{scheme}://{host}/{rest}");
            if let Some(q) = uri.query() {
                t.push('?');
                t.push_str(q);
            }
            t
        }
        // Older form: the whole address percent-encoded, options in the query.
        _ => {
            if let Some(q) = uri.query() {
                for kv in q.split('&') {
                    if let Some((k, v)) = kv.split_once('=') {
                        match k {
                            "ua" => ua = Some(decode(v)),
                            "ref" => referer = Some(decode(v)),
                            _ => {}
                        }
                    }
                }
            }
            decode(path)
        }
    };
    tauri::async_runtime::spawn(async move {
        let mut req = http().get(&target);
        if let Some(ua) = ua {
            req = req.header("User-Agent", ua);
        }
        if let Some(r) = referer {
            req = req.header("Referer", r);
        }
        for (k, v) in &extra {
            req = req.header(k.as_str(), v.as_str());
        }
        // Seeking in music / video served by the relay.
        if let Some(r) = &range {
            req = req.header("Range", r.as_str());
        }
        let mut builder = tauri::http::Response::builder().header("Access-Control-Allow-Origin", "*").header("Accept-Ranges", "bytes");
        let debug = std::env::var("YOUSUFOS_DEBUG").is_ok();
        let response = match req.send().await {
            Ok(res) => {
                let status = res.status().as_u16();
                if debug {
                    eprintln!("[relay] {status} {target}");
                }
                let ct = res
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("application/octet-stream")
                    .to_string();
                if let Some(cr) = res.headers().get("content-range").and_then(|v| v.to_str().ok()) {
                    builder = builder.header("Content-Range", cr);
                }
                match res.bytes().await {
                    Ok(b) => builder.status(status).header("Content-Type", ct).body(b.to_vec()),
                    Err(e) => builder.status(502).body(e.to_string().into_bytes()),
                }
            }
            Err(e) => {
                if debug {
                    eprintln!("[relay] ERR {target}: {e}");
                }
                builder.status(502).body(e.to_string().into_bytes())
            }
        };
        responder.respond(response.unwrap_or_else(|_| tauri::http::Response::new(Vec::new())));
    });
}

// ------------------------------------------------------------------ volume

/// Changes the system volume by `step` percent; returns the new level.
pub(crate) fn volume_step(step: i32) -> Option<u32> {
    #[cfg(target_os = "linux")]
    {
        let arg = format!("{}{}%", if step >= 0 { "+" } else { "-" }, step.abs());
        let pactl = Command::new("pactl")
            .args(["set-sink-volume", "@DEFAULT_SINK@", &arg])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if pactl {
            let read = || -> Option<u32> {
                let out = Command::new("pactl").args(["get-sink-volume", "@DEFAULT_SINK@"]).output().ok()?;
                let s = String::from_utf8_lossy(&out.stdout).to_string();
                let pct = s.split('/').nth(1)?.trim().trim_end_matches('%').trim().parse().ok()?;
                Some(pct)
            };
            let mut level = read()?;
            if level > 100 {
                let _ = Command::new("pactl").args(["set-sink-volume", "@DEFAULT_SINK@", "100%"]).status();
                level = 100;
            }
            return Some(level);
        }
        let arg = format!("{}%{}", step.abs(), if step >= 0 { "+" } else { "-" });
        Command::new("wpctl")
            .args(["set-volume", "-l", "1.0", "@DEFAULT_AUDIO_SINK@", &arg])
            .status()
            .ok()?;
        let out = Command::new("wpctl").args(["get-volume", "@DEFAULT_AUDIO_SINK@"]).output().ok()?;
        let s = String::from_utf8_lossy(&out.stdout).to_string();
        let v: f32 = s.split_whitespace().nth(1)?.parse().ok()?;
        Some((v * 100.0).round() as u32)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = step;
        None
    }
}

#[tauri::command]
fn change_volume(step: i32) -> Option<u32> {
    volume_step(step)
}

// ------------------------------------------------------------------- setup

pub(crate) fn read_config_value(app: &AppHandle) -> Option<serde_json::Value> {
    config_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
}

/// Big TVs mean many more pixels to draw. WebKitGTK often falls back to
/// software rendering; force GPU compositing unless `"gpu": false` is set in
/// config.json (for drivers that misbehave).
#[cfg(target_os = "linux")]
fn enable_gpu(app: &AppHandle) {
    let gpu = read_config_value(app)
        .and_then(|v| v.get("gpu").and_then(|g| g.as_bool()))
        .unwrap_or(true);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.with_webview(move |wv| {
            use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};
            if let Some(settings) = wv.inner().settings() {
                if gpu {
                    settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Always);
                }
                settings.set_enable_smooth_scrolling(true);
                // The Adhan, takbir and ambient sound start on their own.
                settings.set_media_playback_requires_user_gesture(false);
            }
        });
    }
}

fn home_shortcuts(app: &AppHandle) -> Vec<String> {
    let from_config = read_config_value(app)
        .and_then(|v| v.get("homeShortcuts").cloned())
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok());
    from_config.unwrap_or_else(|| vec!["F12".into(), "Ctrl+Alt+Home".into()])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]

// ---------------------------------------------------------- event log
// The last few hundred things that happened (for the admin panel).

fn log_buf() -> &'static Mutex<std::collections::VecDeque<String>> {
    static L: OnceLock<Mutex<std::collections::VecDeque<String>>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(std::collections::VecDeque::new()))
}
pub(crate) fn log_line(line: &str) {
    let t = std::process::Command::new("date").arg("+%H:%M:%S").output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
    let mut b = log_buf().lock().unwrap();
    b.push_back(format!("{t}  {}", line.chars().take(400).collect::<String>()));
    while b.len() > 400 {
        b.pop_front();
    }
}
pub(crate) fn log_lines() -> Vec<String> {
    log_buf().lock().unwrap().iter().cloned().collect()
}
#[tauri::command]
fn app_log(line: String) {
    log_line(&line);
}

pub(crate) fn volume_get() -> Option<u32> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("pactl").args(["get-sink-volume", "@DEFAULT_SINK@"]).output() {
            let s = String::from_utf8_lossy(&out.stdout).to_string();
            if let Some(v) = s.split('/').nth(1).and_then(|x| x.trim().trim_end_matches('%').trim().parse().ok()) {
                return Some(v);
            }
        }
        let out = Command::new("wpctl").args(["get-volume", "@DEFAULT_AUDIO_SINK@"]).output().ok()?;
        let v: f32 = String::from_utf8_lossy(&out.stdout).split_whitespace().nth(1)?.parse().ok()?;
        return Some((v * 100.0).round() as u32);
    }
    #[allow(unreachable_code)]
    None
}

// ---------------------------------------------------------- Wake-on-LAN

/// Wakes a sleeping computer (the Jellyfin PC) with a "magic packet".
#[tauri::command]
fn wake_on_lan(mac: String, host: Option<String>) -> Result<(), String> {
    let bytes: Vec<u8> = mac.split(|c| c == ':' || c == '-').filter_map(|h| u8::from_str_radix(h, 16).ok()).collect();
    if bytes.len() != 6 {
        return Err("That doesn't look like a network (MAC) address.".into());
    }
    let mut packet = vec![0xffu8; 6];
    for _ in 0..16 {
        packet.extend_from_slice(&bytes);
    }
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    sock.set_broadcast(true).map_err(|e| e.to_string())?;
    let mut targets = vec!["255.255.255.255".to_string()];
    // The PC's own subnet broadcast (x.y.z.255) too, for routers that drop the global one.
    if let Some(h) = host.as_deref() {
        if let Ok(ip) = h.parse::<std::net::Ipv4Addr>() {
            let o = ip.octets();
            targets.push(format!("{}.{}.{}.255", o[0], o[1], o[2]));
        }
    }
    for t in &targets {
        for port in [9, 7] {
            let _ = sock.send_to(&packet, (t.as_str(), port));
        }
    }
    log_line(&format!("Wake-on-LAN sent to {mac}"));
    Ok(())
}

/// The network (MAC) address of a computer on the home network, learnt
/// while it's awake, so it can be woken later.
#[tauri::command]
fn mac_for_host(host: String) -> Option<String> {
    use std::net::ToSocketAddrs;
    let ip = format!("{host}:80").to_socket_addrs().ok()?.find(|a| a.is_ipv4())?.ip().to_string();
    let arp = std::fs::read_to_string("/proc/net/arp").ok()?;
    arp.lines().skip(1).find_map(|l| {
        let f: Vec<&str> = l.split_whitespace().collect();
        (f.first() == Some(&ip.as_str()) && f.get(3).map(|m| *m != "00:00:00:00:00:00").unwrap_or(false)).then(|| f[3].to_string())
    })
}

// ---------------------------------------------------------- backups

/// Where backups can go: a folder in your home, and any USB drive plugged in.
#[tauri::command]
fn backup_targets() -> Vec<serde_json::Value> {
    let home = std::env::var("HOME").unwrap_or_default();
    let user = std::env::var("USER").unwrap_or_default();
    let mut out = vec![serde_json::json!({ "label": "Home folder", "path": format!("{home}/YousufOS-Backups"), "usb": false })];
    for root in [format!("/media/{user}"), format!("/run/media/{user}")] {
        if let Ok(rd) = std::fs::read_dir(&root) {
            for e in rd.flatten() {
                if e.path().is_dir() {
                    out.push(serde_json::json!({ "label": e.file_name().to_string_lossy(), "path": e.path().join("YousufOS-Backups").display().to_string(), "usb": true }));
                }
            }
        }
    }
    out
}
fn backup_dir_ok(path: &std::path::Path) -> bool {
    let p = path.display().to_string();
    backup_targets().iter().any(|t| t["path"].as_str().map(|b| p.starts_with(b)).unwrap_or(false))
}
#[tauri::command]
fn backup_write(dir: String, name: String, contents: String) -> Result<String, String> {
    let d = std::path::PathBuf::from(&dir);
    if !backup_dir_ok(&d) {
        return Err("Not a backup folder.".into());
    }
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let p = d.join(media::safe_name(&name));
    std::fs::write(&p, contents).map_err(|e| e.to_string())?;
    log_line(&format!("Backup saved: {}", p.display()));
    Ok(p.display().to_string())
}
#[tauri::command]
fn backup_list() -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for t in backup_targets() {
        let dir = t["path"].as_str().unwrap_or("").to_string();
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if !n.ends_with(".json") {
                    continue;
                }
                let modified = e.metadata().ok().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
                out.push(serde_json::json!({ "name": n, "path": e.path().display().to_string(), "where": t["label"], "modified": modified }));
            }
        }
    }
    out.sort_by_key(|v| std::cmp::Reverse(v["modified"].as_u64().unwrap_or(0)));
    out
}
#[tauri::command]
fn backup_read(path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    let uploads = admin::app_data_dir_static().join("uploads");
    if !(backup_dir_ok(&p) || p.starts_with(&uploads)) || !path.ends_with(".json") && !p.starts_with(&uploads) {
        return Err("Not a backup file.".into());
    }
    std::fs::read_to_string(&p).map_err(|e| e.to_string())
}

// ---------------------------------------------------------- updates
// New versions are GitHub releases (a private repository: a read-only token
// lets the TV see them). The .deb is checked against the release's
// SHA256SUMS before it's installed; installing asks for the password.

fn gh(token: &str, url: &str, accept: &str) -> reqwest::RequestBuilder {
    let mut r = http().get(url).header("Accept", accept).header("X-GitHub-Api-Version", "2022-11-28");
    if !token.is_empty() {
        r = r.header("Authorization", format!("Bearer {token}"));
    }
    r
}

#[tauri::command]
async fn update_check(repo: String, token: String) -> Result<serde_json::Value, String> {
    if !repo.contains('/') {
        return Err("Set the GitHub repository (owner/name) first.".into());
    }
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let res = gh(&token, &url, "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| "Couldn't reach GitHub. Check the internet connection.".to_string())?;
    match res.status().as_u16() {
        200 => {}
        401 => return Err("GitHub says the token is wrong or expired. Make a new one and save it again.".into()),
        403 => return Err(format!("GitHub refused the token for {repo}. It needs Contents: Read-only on that repository.")),
        404 if token.is_empty() => return Err(format!("{repo} is private: save a GitHub token to check for updates.")),
        404 => return Err(format!("The token can't see {repo}. When making it, choose that repository under Repository access and give it Contents: Read-only.")),
        s => return Err(format!("GitHub answered {s}")),
    }
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let assets = v["assets"].as_array().cloned().unwrap_or_default();
    let pick = |pred: &dyn Fn(&str) -> bool| assets.iter().find(|a| pred(a["name"].as_str().unwrap_or(""))).cloned();
    let deb = pick(&|n| n.ends_with("_amd64.deb"));
    let sums = pick(&|n| n.eq_ignore_ascii_case("SHA256SUMS") || n.ends_with(".sha256"));
    Ok(serde_json::json!({
        "version": v["tag_name"].as_str().unwrap_or("").trim_start_matches('v'),
        "name": v["name"], "notes": v["body"], "published": v["published_at"],
        "deb": deb.as_ref().map(|a| serde_json::json!({ "url": a["url"], "name": a["name"], "size": a["size"] })),
        "sums": sums.as_ref().map(|a| a["url"].clone()),
    }))
}

#[tauri::command]
async fn update_download(app: AppHandle, token: String, deb_url: String, deb_name: String, sums_url: Option<String>) -> Result<String, String> {
    let dir = admin::app_data_dir(&app).join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(media::safe_name(&deb_name));
    let mut res = gh(&token, &deb_url, "application/octet-stream").send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Download failed: HTTP {}", res.status()));
    }
    let total = res.content_length().unwrap_or(0);
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut last = std::time::Instant::now();
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        buf.extend_from_slice(&chunk);
        if last.elapsed() > Duration::from_millis(500) {
            last = std::time::Instant::now();
            let _ = app.emit("update-progress", serde_json::json!({ "done": buf.len(), "total": total }));
        }
    }
    // Checksum.
    if let Some(su) = sums_url {
        let sums = gh(&token, &su, "application/octet-stream").send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
        let want = sums
            .lines()
            .find(|l| l.trim_end().ends_with(&deb_name))
            .and_then(|l| l.split_whitespace().next())
            .ok_or("The release has no checksum for this file.")?
            .to_lowercase();
        let got = sha256_hex(&buf);
        if got != want {
            return Err("The download is damaged (checksum doesn't match). Nothing was installed.".into());
        }
    }
    std::fs::write(&path, &buf).map_err(|e| e.to_string())?;
    log_line(&format!("Update downloaded: {deb_name}"));
    Ok(path.display().to_string())
}

/// Installs a downloaded / uploaded YousufOS package (asks for the password
/// on the TV), then restarts the launcher.
#[tauri::command]
async fn update_install(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let allowed = admin::app_data_dir(&app);
    if !p.starts_with(&allowed) || !path.ends_with(".deb") {
        return Err("Only a package YousufOS downloaded or received can be installed.".into());
    }
    // It must be YousufOS itself.
    let pkg = Command::new("dpkg-deb").args(["-f", &path, "Package"]).output().map_err(|e| e.to_string())?;
    let name = String::from_utf8_lossy(&pkg.stdout).trim().to_string();
    if name != "yousuf-os" {
        return Err(format!("This package is \"{name}\", not YousufOS."));
    }
    log_line("Installing update…");
    let st = Command::new("pkexec")
        .args(["apt-get", "install", "-y", "--allow-downgrades", &path])
        .status()
        .map_err(|e| e.to_string())?;
    if !st.success() {
        return Err("The update wasn't installed (password not given, or apt failed).".into());
    }
    log_line("Update installed; restarting");
    app.restart();
}

// Small SHA-256 (no extra crate).
fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let mut msg = data.to_vec();
    let bits = (data.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bits.to_be_bytes());
    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
            v = [t1.wrapping_add(t2), v[0], v[1], v[2], v[3].wrapping_add(t1), v[4], v[5], v[6]];
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn sha256_known() {
        assert_eq!(super::sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(super::sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }
}

pub fn run() {
    tauri::Builder::default()
        // Running `yousufos` again (e.g. bound to the remote's Home key in
        // GNOME Settings > Keyboard) brings you back to the launcher.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| go_home(app)))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(Running::default())
        .manage(ChromeLink::default())
        .manage(Current::default())
        .manage(player::Player::default())
        .register_asynchronous_uri_scheme_protocol("iptv", |_ctx, request, responder| {
            let range = request.headers().get("range").and_then(|v| v.to_str().ok()).map(String::from);
            iptv_relay(request.uri().clone(), range, responder)
        })
        .setup(|app| {
            let _ = admin::app_data_dir(app.handle());
            #[cfg(target_os = "linux")]
            enable_gpu(app.handle());
            gamepad::spawn(app.handle().clone());
            gamepad::self_test(app.handle().clone());
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Builder, ShortcutState};
                let shortcuts = home_shortcuts(app.handle());
                app.handle().plugin(
                    Builder::new()
                        .with_handler(|app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                go_home(app);
                            }
                        })
                        .build(),
                )?;
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                for s in shortcuts {
                    // Global shortcuts need X11; on Wayland use the
                    // single-instance route described above instead.
                    if let Err(e) = app.global_shortcut().register(s.as_str()) {
                        eprintln!("[yousufos] could not register shortcut {s}: {e}");
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    stop_running(&window.app_handle().state::<Running>());
                    player::stop(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            launch_app,
            close_app,
            fetch_text,
            http_request,
            load_config,
            save_config,
            list_images,
            expand_path,
            read_media,
            adhan_begin,
            adhan_end,
            system_action,
            change_volume,
            player::play_external,
            player::player_command,
            player::play_media,
            app_log,
            wake_on_lan,
            mac_for_host,
            backup_targets,
            backup_write,
            backup_list,
            backup_read,
            update_check,
            update_download,
            update_install,
            admin::admin_configure,
            admin::admin_reply,
            admin::admin_info,
            media::media_jobs,
            media::record_start,
            media::job_stop,
            media::jobs_clear,
            media::download_start,
            media::media_files,
            media::media_delete,
            media::media_write_json,
            media::media_read_json,
            media::pip_start,
            media::pip_stop,
            media::pip_running,
            media::jf_socket_open,
            media::jf_socket_send,
            media::jf_socket_close,
            cameras::camera_snapshot,
            quran::quran_dir,
            quran::quran_text_save,
            quran::quran_text_read,
            quran::quran_text_delete,
            quran::quran_status,
            quran::quran_audio_have,
            quran::quran_audio_get,
            quran::quran_audio_cancel,
            quran::quran_audio_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running YousufOS");
}
