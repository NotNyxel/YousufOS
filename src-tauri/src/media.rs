//! Files YousufOS keeps on the TV: Live TV recordings (ffmpeg) and Jellyfin
//! downloads for watching offline, in ~/Videos/YousufOS. Also uploads from
//! the admin panel and the picture-in-picture Live TV window.

use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

pub fn base_dir() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    // ~/Videos (or the localised name XDG gives it).
    let videos = std::process::Command::new("xdg-user-dir")
        .arg("VIDEOS")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty() && Path::new(s).is_dir() && s != &home.display().to_string())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join("Videos"));
    videos.join("YousufOS")
}
fn dir_for(kind: &str) -> PathBuf {
    base_dir().join(match kind {
        "downloads" => "Jellyfin",
        _ => "Recordings",
    })
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// A name that's safe as a file name.
pub fn safe_name(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| if c.is_alphanumeric() || " -_.,()'&+".contains(c) || (c as u32) > 0x7f { c } else { '_' })
        .collect();
    let t = cleaned.trim().trim_matches('.').to_string();
    if t.is_empty() { "untitled".into() } else { t.chars().take(120).collect() }
}

// ---------------------------------------------------------------- jobs

#[derive(Clone)]
struct JobInfo {
    kind: &'static str, // "record" | "download"
    name: String,
    path: PathBuf,
    started: u64,
    until: Option<u64>,
    done: u64,
    total: u64,
    state: String, // running | done | failed | stopped
}
struct Job {
    info: JobInfo,
    child: Option<Child>,
    cancel: Arc<AtomicBool>,
}
fn jobs() -> &'static Mutex<HashMap<String, Job>> {
    static J: OnceLock<Mutex<HashMap<String, Job>>> = OnceLock::new();
    J.get_or_init(|| Mutex::new(HashMap::new()))
}
fn job_json(id: &str, j: &JobInfo) -> Value {
    json!({
        "id": id, "kind": j.kind, "name": j.name, "path": j.path.display().to_string(), "started": j.started,
        "until": j.until, "done": j.done, "total": j.total, "state": j.state,
    })
}
fn notify(app: &AppHandle) {
    let _ = app.emit("media-jobs", media_jobs());
}

#[tauri::command]
pub fn media_jobs() -> Vec<Value> {
    let mut v: Vec<Value> = jobs().lock().unwrap().iter().map(|(id, j)| job_json(id, &j.info)).collect();
    v.sort_by_key(|j| std::cmp::Reverse(j["started"].as_u64().unwrap_or(0)));
    v
}

/// Records a stream with ffmpeg (copies it as it is, no re-encoding) for
/// `minutes`, or until stopped. Returns the job id.
#[tauri::command]
pub fn record_start(app: AppHandle, url: String, name: String, minutes: u32, user_agent: Option<String>) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("This channel can't be recorded.".into());
    }
    let dir = dir_for("recordings");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono_stamp();
    let path = dir.join(format!("{} {}.ts", safe_name(&name), stamp));
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10"]);
    if let Some(ua) = user_agent.filter(|u| !u.is_empty()) {
        cmd.args(["-user_agent", &ua]);
    }
    cmd.args(["-i", &url, "-map", "0", "-c", "copy", "-f", "mpegts"]);
    let minutes = minutes.clamp(1, 600);
    cmd.args(["-t", &(minutes * 60).to_string()]);
    cmd.arg(&path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "ffmpeg is not installed. Install it with: sudo apt install ffmpeg".to_string()
        } else {
            e.to_string()
        }
    })?;
    let id = crate::admin::random_hex(6);
    let started = now_secs();
    let info = JobInfo { kind: "record", name, path, started, until: Some(started + minutes as u64 * 60), done: 0, total: 0, state: "running".into() };
    jobs().lock().unwrap().insert(id.clone(), Job { info, child: Some(child), cancel: Arc::new(AtomicBool::new(false)) });
    notify(&app);
    let id2 = id.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));
        let mut all = jobs().lock().unwrap();
        let Some(j) = all.get_mut(&id2) else { return };
        let size = fs::metadata(&j.info.path).map(|m| m.len()).unwrap_or(0);
        j.info.done = size;
        let finished = match j.child.as_mut().map(|c| c.try_wait()) {
            Some(Ok(Some(st))) => Some(st.success() || j.cancel.load(Ordering::Relaxed)),
            Some(Err(_)) => Some(false),
            _ => None,
        };
        if let Some(ok) = finished {
            j.child = None;
            j.info.state = if j.cancel.load(Ordering::Relaxed) { "stopped" } else if ok || size > 0 { "done" } else { "failed" }.into();
            drop(all);
            notify(&app);
            return;
        }
    });
    Ok(id)
}

/// Stops a recording (keeps what was recorded) or cancels a download.
#[tauri::command]
pub fn job_stop(app: AppHandle, id: String) -> Result<(), String> {
    let mut all = jobs().lock().unwrap();
    let j = all.get_mut(&id).ok_or("no such job")?;
    j.cancel.store(true, Ordering::Relaxed);
    if let Some(c) = j.child.as_mut() {
        #[cfg(unix)]
        {
            // ffmpeg finishes the file properly on SIGINT.
            let _ = Command::new("kill").args(["-INT", &c.id().to_string()]).status();
        }
        #[cfg(not(unix))]
        let _ = c.kill();
    }
    drop(all);
    notify(&app);
    Ok(())
}

/// Forgets finished jobs in the list (files stay).
#[tauri::command]
pub fn jobs_clear(app: AppHandle) {
    jobs().lock().unwrap().retain(|_, j| j.info.state == "running");
    notify(&app);
}

#[derive(Deserialize)]
pub struct DownloadReq {
    url: String,
    /// Relative path inside the downloads folder, e.g. "Show/Season 1/Episode.mkv".
    rel: String,
    #[serde(default)]
    headers: Vec<(String, String)>,
    #[serde(default)]
    name: String,
    /// Small files (pictures, details) are fetched without a job entry.
    #[serde(default)]
    quiet: bool,
}

/// Downloads a file into the downloads folder (resumes a partial one).
#[tauri::command]
pub async fn download_start(app: AppHandle, req: DownloadReq) -> Result<String, String> {
    let base = dir_for("downloads");
    let rel = req.rel.split('/').map(safe_name).collect::<Vec<_>>().join("/");
    let path = base.join(&rel);
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let part = path.with_extension(format!("{}.part", path.extension().and_then(|e| e.to_str()).unwrap_or("bin")));
    let have = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    let mut r = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .get(&req.url);
    for (k, v) in &req.headers {
        r = r.header(k.as_str(), v.as_str());
    }
    if have > 0 {
        r = r.header("Range", format!("bytes={have}-"));
    }
    let mut res = r.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let resumed = res.status().as_u16() == 206;
    let total = res.content_length().unwrap_or(0) + if resumed { have } else { 0 };
    let id = crate::admin::random_hex(6);
    let cancel = Arc::new(AtomicBool::new(false));
    if !req.quiet {
        let info = JobInfo {
            kind: "download",
            name: if req.name.is_empty() { rel.clone() } else { req.name.clone() },
            path: path.clone(),
            started: now_secs(),
            until: None,
            done: if resumed { have } else { 0 },
            total,
            state: "running".into(),
        };
        jobs().lock().unwrap().insert(id.clone(), Job { info, child: None, cancel: cancel.clone() });
        notify(&app);
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(resumed)
        .write(true)
        .truncate(!resumed)
        .open(&part)
        .map_err(|e| e.to_string())?;
    let mut done = if resumed { have } else { 0 };
    let mut last = std::time::Instant::now();
    let result: Result<(), String> = loop {
        if cancel.load(Ordering::Relaxed) {
            break Err("stopped".into());
        }
        match res.chunk().await {
            Ok(Some(bytes)) => {
                if let Err(e) = file.write_all(&bytes) {
                    break Err(e.to_string());
                }
                done += bytes.len() as u64;
                if !req.quiet && last.elapsed() > Duration::from_millis(800) {
                    last = std::time::Instant::now();
                    if let Some(j) = jobs().lock().unwrap().get_mut(&id) {
                        j.info.done = done;
                    }
                    notify(&app);
                }
            }
            Ok(None) => break Ok(()),
            Err(e) => break Err(e.to_string()),
        }
    };
    drop(file);
    let state = match &result {
        Ok(()) => {
            let _ = fs::rename(&part, &path);
            "done"
        }
        Err(e) if e == "stopped" => "stopped",
        Err(_) => "failed",
    };
    if !req.quiet {
        if let Some(j) = jobs().lock().unwrap().get_mut(&id) {
            j.info.done = done;
            j.info.state = state.into();
        }
        notify(&app);
    }
    result.map(|_| path.display().to_string())
}

// ---------------------------------------------------------------- files

fn walk(dir: &Path, out: &mut Vec<Value>, base: &Path) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk(&p, out, base);
            continue;
        }
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if name.ends_with(".part") {
            continue;
        }
        let Ok(m) = e.metadata() else { continue };
        let modified = m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        out.push(json!({
            "name": name, "path": p.display().to_string(),
            "rel": p.strip_prefix(base).map(|r| r.display().to_string()).unwrap_or_default(),
            "size": m.len(), "modified": modified,
        }));
    }
}

pub fn list_files(kind: &str) -> Result<Value, String> {
    let dir = dir_for(kind);
    let mut out = Vec::new();
    walk(&dir, &mut out, &dir);
    out.sort_by_key(|f| std::cmp::Reverse(f["modified"].as_u64().unwrap_or(0)));
    Ok(json!({ "dir": dir.display().to_string(), "files": out }))
}

#[tauri::command]
pub fn media_files(kind: String) -> Result<Value, String> {
    list_files(&kind)
}

fn inside_base(path: &str) -> Result<PathBuf, String> {
    let p = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let base = fs::canonicalize(base_dir()).map_err(|e| e.to_string())?;
    if !p.starts_with(&base) {
        return Err("Only YousufOS's own recordings and downloads can be changed.".into());
    }
    Ok(p)
}

pub fn delete_file(path: &str) -> Result<(), String> {
    let p = inside_base(path)?;
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
        // Folder left empty (a downloaded film's pictures / details): tidy it.
        if let Some(parent) = p.parent() {
            let leftovers: Vec<_> = fs::read_dir(parent).map(|r| r.flatten().map(|e| e.path()).collect()).unwrap_or_default();
            let only_extras = leftovers.iter().all(|e| {
                let n = e.file_name().and_then(|n| n.to_str()).unwrap_or("");
                n.ends_with(".jpg") || n.ends_with(".json") || n.ends_with(".part")
            });
            let base = fs::canonicalize(base_dir()).unwrap_or_default();
            if only_extras && parent != base && parent.starts_with(&base) && !matches!(parent.file_name().and_then(|n| n.to_str()), Some("Jellyfin") | Some("Recordings")) {
                let _ = fs::remove_dir_all(parent);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn media_delete(path: String) -> Result<(), String> {
    delete_file(&path)
}

/// Writes a small JSON file next to a download (its details for offline use).
#[tauri::command]
pub fn media_write_json(rel: String, value: Value) -> Result<String, String> {
    let rel = rel.split('/').map(safe_name).collect::<Vec<_>>().join("/");
    let path = dir_for("downloads").join(rel);
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::to_vec_pretty(&value).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn media_read_json(path: String) -> Result<Value, String> {
    let p = inside_base(&path)?;
    serde_json::from_slice(&fs::read(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn save_upload(app: &AppHandle, name: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty upload".into());
    }
    let dir = crate::admin::app_data_dir(app).join("uploads");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Keep the last few only.
    if let Ok(rd) = fs::read_dir(&dir) {
        let mut files: Vec<_> = rd.flatten().filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path()))).collect();
        files.sort();
        while files.len() > 8 {
            let _ = fs::remove_file(files.remove(0).1);
        }
    }
    let path = dir.join(format!("{}-{}", crate::admin::random_hex(3), safe_name(name)));
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn chrono_stamp() -> String {
    // Local date and time without extra crates: ask `date`.
    Command::new("date")
        .arg("+%Y-%m-%d %H.%M")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| now_secs().to_string())
}

// ---------------------------------------------------------------- PiP

fn pip() -> &'static Mutex<Option<Child>> {
    static P: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(None))
}

/// Live TV in a small window that stays on top of everything.
/// corner: "br" | "bl" | "tr" | "tl"; size: width in pixels.
#[tauri::command]
pub fn pip_start(url: String, title: String, corner: String, size: u32, muted: bool, user_agent: Option<String>, headers: Option<Vec<String>>) -> Result<(), String> {
    pip_stop();
    let w = size.clamp(320, 1280);
    let h = w * 9 / 16;
    let margin = 40;
    let geo = match corner.as_str() {
        "tl" => format!("{w}x{h}+{margin}+{margin}"),
        "tr" => format!("{w}x{h}-{margin}+{margin}"),
        "bl" => format!("{w}x{h}+{margin}-{margin}"),
        _ => format!("{w}x{h}-{margin}-{margin}"),
    };
    let mut cmd = Command::new("mpv");
    cmd.args([
        "--ontop",
        "--no-border",
        "--force-window=immediate",
        "--keep-open=no",
        "--no-terminal",
        "--hwdec=auto-safe",
        "--osc=no",
        "--osd-level=0",
        "--no-input-default-bindings",
        "--input-cursor=no",
        "--cursor-autohide=always",
        "--title=YousufOS PiP",
        "--x11-name=yousufos-pip",
        "--network-timeout=15",
    ]);
    cmd.arg(format!("--geometry={geo}"));
    cmd.arg(format!("--force-media-title={title}"));
    if muted {
        cmd.arg("--mute=yes");
    }
    if let Some(ua) = user_agent.filter(|u| !u.is_empty()) {
        cmd.arg(format!("--user-agent={ua}"));
    }
    for h in headers.unwrap_or_default() {
        cmd.arg(format!("--http-header-fields-append={h}"));
    }
    if url.trim().to_lowercase().starts_with("rtsp") {
        cmd.arg("--rtsp-transport=tcp");
    }
    cmd.arg(url.trim()).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    *pip().lock().unwrap() = Some(child);
    Ok(())
}

#[tauri::command]
pub fn pip_stop() {
    if let Some(mut c) = pip().lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}

#[tauri::command]
pub fn pip_running() -> bool {
    let mut g = pip().lock().unwrap();
    match g.as_mut().map(|c| c.try_wait()) {
        Some(Ok(None)) => true,
        _ => {
            *g = None;
            false
        }
    }
}

// ---------------------------------------------------------------- server socket
// A websocket to the Jellyfin server (SyncPlay messages). Plain ws:// on the
// home network; one connection at a time.

struct Socket {
    tx: std::sync::mpsc::Sender<String>,
    stop: Arc<AtomicBool>,
}
fn socket() -> &'static Mutex<Option<Socket>> {
    static S: OnceLock<Mutex<Option<Socket>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub fn jf_socket_open(app: AppHandle, url: String, auth: String) -> Result<(), String> {
    use tungstenite::client::IntoClientRequest;
    jf_socket_close();
    if !url.starts_with("ws://") {
        return Err("Watch together needs the server's plain http address on the home network.".into());
    }
    let mut req = url.as_str().into_client_request().map_err(|e| e.to_string())?;
    req.headers_mut().insert("Authorization", auth.parse().map_err(|_| "bad header".to_string())?);
    let (mut ws, _) = tungstenite::connect(req).map_err(|e| e.to_string())?;
    if let tungstenite::stream::MaybeTlsStream::Plain(s) = ws.get_mut() {
        let _ = s.set_read_timeout(Some(Duration::from_millis(150)));
    }
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let stop = Arc::new(AtomicBool::new(false));
    *socket().lock().unwrap() = Some(Socket { tx, stop: stop.clone() });
    thread::spawn(move || {
        let mut last_keepalive = std::time::Instant::now();
        loop {
            if stop.load(Ordering::Relaxed) {
                let _ = ws.close(None);
                break;
            }
            while let Ok(text) = rx.try_recv() {
                if ws.send(tungstenite::Message::Text(text)).is_err() {
                    break;
                }
            }
            if last_keepalive.elapsed() > Duration::from_secs(25) {
                last_keepalive = std::time::Instant::now();
                let _ = ws.send(tungstenite::Message::Text(r#"{"MessageType":"KeepAlive"}"#.into()));
            }
            match ws.read() {
                Ok(tungstenite::Message::Text(t)) => {
                    let _ = app.emit("jf-socket", t.to_string());
                }
                Ok(tungstenite::Message::Close(_)) => break,
                Ok(_) => {}
                Err(tungstenite::Error::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
                Err(_) => break,
            }
        }
        let _ = app.emit("jf-socket-closed", ());
    });
    Ok(())
}

#[tauri::command]
pub fn jf_socket_send(text: String) -> Result<(), String> {
    match socket().lock().unwrap().as_ref() {
        Some(s) => s.tx.send(text).map_err(|e| e.to_string()),
        None => Err("not connected".into()),
    }
}

#[tauri::command]
pub fn jf_socket_close() {
    if let Some(s) = socket().lock().unwrap().take() {
        s.stop.store(true, Ordering::Relaxed);
    }
}
