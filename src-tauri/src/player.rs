//! Live TV through mpv: plays almost any stream (codecs the built-in player
//! can't, picky servers) and is used automatically when a channel won't play
//! in the built-in player.

use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Player(Mutex<Option<Mpv>>);

pub struct Mpv {
    child: Child,
    socket: PathBuf,
}

#[derive(Deserialize)]
pub struct Channel {
    name: String,
    url: String,
}

pub fn is_running(app: &AppHandle) -> bool {
    app.state::<Player>().0.lock().unwrap().is_some()
}

pub fn stop(app: &AppHandle) -> bool {
    let taken = app.state::<Player>().0.lock().unwrap().take();
    match taken {
        Some(mut p) => {
            let _ = p.child.kill();
            let _ = p.child.wait();
            let _ = fs::remove_file(&p.socket);
            true
        }
        None => false,
    }
}

/// Sends an mpv input command, e.g. ["playlist-next"].
pub fn command(app: &AppHandle, args: &[&str]) {
    #[cfg(unix)]
    {
        let socket = match app.state::<Player>().0.lock().unwrap().as_ref() {
            Some(p) => p.socket.clone(),
            None => return,
        };
        if let Ok(mut s) = std::os::unix::net::UnixStream::connect(socket) {
            let line = serde_json::json!({ "command": args }).to_string() + "\n";
            let _ = s.write_all(line.as_bytes());
        }
    }
    #[cfg(not(unix))]
    let _ = (app, args);
}

const INPUT_CONF: &str = r#"UP playlist-prev
DOWN playlist-next
WHEEL_UP playlist-prev
WHEEL_DOWN playlist-next
PGUP playlist-prev
PGDWN playlist-next
LEFT ignore
RIGHT ignore
ENTER show-text "${playlist-pos-1} / ${playlist-count}   ${media-title}" 3000
y show-text "${playlist-pos-1} / ${playlist-count}   ${media-title}" 3000
m show-text "${playlist-pos-1} / ${playlist-count}   ${media-title}" 3000
SPACE cycle pause
ESC quit 4
BS quit 4
q quit 4
"#;

#[tauri::command]
pub fn play_external(app: AppHandle, channels: Vec<Channel>, index: usize) -> Result<(), String> {
    stop(&app);
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let playlist = dir.join("livetv.m3u");
    let conf = dir.join("mpv-input.conf");
    let socket = dir.join("mpv.sock");
    let mut m3u = String::from("#EXTM3U\n");
    for c in &channels {
        m3u.push_str(&format!("#EXTINF:-1,{}\n{}\n", c.name.replace(['\n', '\r'], " "), c.url.trim()));
    }
    fs::write(&playlist, m3u).map_err(|e| e.to_string())?;
    fs::write(&conf, INPUT_CONF).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&socket);

    let child = Command::new("mpv")
        .args([
            "--fs",
            "--ontop",
            "--force-window=immediate",
            "--keep-open=no",
            "--idle=no",
            "--no-terminal",
            "--hwdec=auto-safe",
            "--cache=yes",
            "--demuxer-max-bytes=64MiB",
            "--network-timeout=15",
            "--osd-font-size=44",
            "--osd-duration=2500",
            "--osd-playing-msg=${playlist-pos-1} / ${playlist-count}   ${media-title}",
            "--title=YousufOS Live TV",
            "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
            "--no-input-default-bindings",
            "--cursor-autohide=1000",
        ])
        .arg(format!("--input-conf={}", conf.display()))
        .arg(format!("--input-ipc-server={}", socket.display()))
        .arg(format!("--playlist={}", playlist.display()))
        .arg(format!("--playlist-start={index}"))
        .args(crate::stream_proxy().map(|p| format!("--http-proxy={p}")))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "mpv is not installed. Install it with: sudo apt install mpv".to_string()
            } else {
                e.to_string()
            }
        })?;
    let pid = child.id();
    *app.state::<Player>().0.lock().unwrap() = Some(Mpv { child, socket });

    // Back to the channel list when mpv quits (Back pressed, or nothing played).
    let started = std::time::Instant::now();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(400));
        let state = app.state::<Player>();
        let mut guard = state.0.lock().unwrap();
        let status = match guard.as_mut() {
            Some(p) if p.child.id() == pid => p.child.try_wait(),
            _ => return,
        };
        if let Ok(Some(st)) = status {
            guard.take();
            drop(guard);
            // Quitting within a few seconds with an error = nothing could play.
            let error = !matches!(st.code(), Some(0) | Some(4)) && started.elapsed() < Duration::from_secs(90);
            crate::show_launcher(&app);
            let _ = app.emit("player-closed", serde_json::json!({ "error": error }));
            return;
        }
    });
    Ok(())
}

#[tauri::command]
pub fn player_command(app: AppHandle, args: Vec<String>) {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    command(&app, &refs);
}

// ------------------------------------------------------------------ media
// Films, episodes and videos from the built-in Jellyfin app. The app is told
// the position every second ("media-progress") so it can save resume points,
// and OK goes back to the app ("media-key") so it can skip intros.

// Watch together: pause and seeking go to the group, which then tells every
// screen (this one included) what to do.
const SYNC_CONF: &str = r#"LEFT script-message yousufos back10
RIGHT script-message yousufos fwd10
UP show-progress
DOWN show-progress
ENTER script-message yousufos ok
SPACE script-message yousufos playpause
MBTN_LEFT script-message yousufos playpause
y cycle sub
m cycle audio
PGUP script-message yousufos prev
PGDWN script-message yousufos next
ESC quit 4
BS quit 4
q quit 4
"#;

const MEDIA_CONF: &str = r#"LEFT seek -10
RIGHT seek 10
UP show-progress
DOWN show-progress
ENTER script-message yousufos ok
SPACE cycle pause
y cycle sub
m cycle audio
PGUP playlist-prev
PGDWN playlist-next
WHEEL_UP seek 10
WHEEL_DOWN seek -10
MBTN_LEFT cycle pause
ESC quit 4
BS quit 4
q quit 4
"#;

#[derive(Deserialize)]
pub struct MediaEntry {
    url: String,
    title: String,
    start: Option<f64>,
    aid: Option<i64>,
    sid: Option<i64>,
    #[serde(default)]
    sub_files: Vec<String>,
    /// Start paused (Watch together: everyone starts at the same moment).
    #[serde(default)]
    pause: bool,
}

#[tauri::command]
pub fn play_media(app: AppHandle, entries: Vec<MediaEntry>, headers: Vec<String>, audio_only: Option<bool>, sync: Option<bool>) -> Result<u32, String> {
    if entries.is_empty() {
        return Err("nothing to play".into());
    }
    stop(&app);
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conf = dir.join("mpv-media-input.conf");
    let socket = dir.join("mpv-media.sock");
    fs::write(&conf, if sync == Some(true) { SYNC_CONF } else { MEDIA_CONF }).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&socket);

    let mut cmd = Command::new("mpv");
    cmd.args([
        "--fs",
        "--ontop",
        "--force-window=immediate",
        "--keep-open=no",
        "--idle=no",
        "--no-terminal",
        "--hwdec=auto-safe",
        "--cache=yes",
        "--demuxer-max-bytes=256MiB",
        "--network-timeout=20",
        "--osd-font-size=44",
        "--osd-duration=2500",
        "--osd-bar-h=2.2",
        "--osd-playing-msg=${media-title}",
        "--title=YousufOS",
        "--no-input-default-bindings",
        "--cursor-autohide=1000",
        "--sub-auto=fuzzy",
        "--slang=en,eng,ar,ara",
    ]);
    if audio_only == Some(true) {
        cmd.arg("--audio-display=embedded-first");
    }
    for h in &headers {
        // One header per flag: the value may contain commas.
        cmd.arg(format!("--http-header-fields-append={h}"));
    }
    cmd.arg(format!("--input-conf={}", conf.display()));
    cmd.arg(format!("--input-ipc-server={}", socket.display()));
    // Per-file options (resume point, tracks, title) in --{ ... --} groups.
    for e in &entries {
        cmd.arg("--{");
        cmd.arg(format!("--force-media-title={}", e.title.replace(['\n', '\r'], " ")));
        cmd.arg(format!("--start={}", e.start.unwrap_or(0.0).max(0.0)));
        if e.pause {
            cmd.arg("--pause=yes");
        }
        if let Some(a) = e.aid {
            cmd.arg(format!("--aid={a}"));
        }
        match e.sid {
            Some(s) if s > 0 => {
                cmd.arg(format!("--sid={s}"));
            }
            Some(_) => {
                cmd.arg("--sid=no");
            }
            None => {}
        }
        for f in &e.sub_files {
            cmd.arg(format!("--sub-file-append={f}"));
        }
        cmd.arg(e.url.trim());
        cmd.arg("--}");
    }
    let child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "mpv is not installed. Install it with: sudo apt install mpv".to_string()
            } else {
                e.to_string()
            }
        })?;
    let pid = child.id();
    *app.state::<Player>().0.lock().unwrap() = Some(Mpv { child, socket: socket.clone() });

    let state = std::sync::Arc::new(Mutex::new(serde_json::json!({ "pos": 0.0, "duration": 0.0, "paused": false, "index": 0, "pid": pid })));
    #[cfg(unix)]
    {
        let (app, state, socket) = (app.clone(), state.clone(), socket.clone());
        thread::spawn(move || watch_ipc(app, pid, socket, state));
    }

    let started = std::time::Instant::now();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(400));
        let player = app.state::<Player>();
        let mut guard = player.0.lock().unwrap();
        let status = match guard.as_mut() {
            Some(p) if p.child.id() == pid => p.child.try_wait(),
            _ => {
                // Replaced or stopped from the app: still report where it got to.
                drop(guard);
                let _ = app.emit("media-closed", serde_json::json!({ "error": false, "state": *state.lock().unwrap() }));
                return;
            }
        };
        if let Ok(Some(st)) = status {
            guard.take();
            drop(guard);
            let error = !matches!(st.code(), Some(0) | Some(4)) && started.elapsed() < Duration::from_secs(20);
            crate::show_launcher(&app);
            let _ = app.emit("media-closed", serde_json::json!({ "error": error, "state": *state.lock().unwrap() }));
            return;
        }
    });
    Ok(pid)
}

#[cfg(unix)]
fn watch_ipc(app: AppHandle, pid: u32, socket: PathBuf, state: std::sync::Arc<Mutex<serde_json::Value>>) {
    use std::io::{BufRead, BufReader};
    let mut stream = None;
    for _ in 0..100 {
        if let Ok(s) = std::os::unix::net::UnixStream::connect(&socket) {
            stream = Some(s);
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let Some(mut s) = stream else { return };
    for (i, prop) in ["time-pos", "duration", "pause", "playlist-pos"].iter().enumerate() {
        let _ = s.write_all(format!("{}\n", serde_json::json!({ "command": ["observe_property", i + 1, prop] })).as_bytes());
    }
    let reader = BufReader::new(match s.try_clone() {
        Ok(r) => r,
        Err(_) => return,
    });
    let mut last_emit = std::time::Instant::now() - Duration::from_secs(5);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        let still_ours = app.state::<Player>().0.lock().unwrap().as_ref().map(|p| p.child.id() == pid).unwrap_or(false);
        if !still_ours {
            break;
        }
        match v["event"].as_str() {
            Some("property-change") => {
                let mut st = state.lock().unwrap();
                let key = match v["name"].as_str() {
                    Some("time-pos") => "pos",
                    Some("duration") => "duration",
                    Some("pause") => "paused",
                    Some("playlist-pos") => "index",
                    _ => continue,
                };
                if v["data"].is_null() {
                    continue;
                }
                let changed_item = key == "index" && st["index"] != v["data"];
                st[key] = v["data"].clone();
                if key == "index" {
                    st["pos"] = serde_json::json!(0.0);
                }
                // The length arriving means the video is loaded: say so straight away
                // (Watch together waits for it, even while paused).
                if changed_item || key == "paused" || key == "duration" || last_emit.elapsed() >= Duration::from_secs(1) {
                    last_emit = std::time::Instant::now();
                    let _ = app.emit("media-progress", st.clone());
                }
            }
            Some("client-message") => {
                if let Some(args) = v["args"].as_array() {
                    if args.first().and_then(|a| a.as_str()) == Some("yousufos") {
                        let key = args.get(1).and_then(|a| a.as_str()).unwrap_or("").to_string();
                        let _ = app.emit("media-key", serde_json::json!({ "key": key, "pid": pid }));
                    }
                }
            }
            _ => {}
        }
    }
}
