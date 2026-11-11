//! Admin panel: a small web server on the home network (port 8686) so a
//! phone, tablet or computer can control the TV — remote, keyboard, apps,
//! Live TV, send-to-TV, recordings, downloads, settings, backups, updates.
//!
//! Security: off until turned on in Settings. A phone pairs once with the
//! 6-digit PIN shown on the TV and gets its own token; the TV can forget
//! every paired device. Wrong PINs are slowed down.
//!
//! Requests that need the launcher's state (settings, channels, Jellyfin...)
//! go to the web view as an "admin-call" event and wait for its reply.

use std::{
    collections::HashMap,
    io::Read,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

pub const PORT: u16 = 8686;

const INDEX: &str = include_str!("../admin/index.html");
const APP_JS: &str = include_str!("../admin/app.js");
const STYLE: &str = include_str!("../admin/style.css");
const MANIFEST: &str = include_str!("../admin/manifest.json");
const ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");

#[derive(Default)]
struct Config {
    pin: String,
    tokens: Vec<String>,
}

struct Server {
    server: Arc<tiny_http::Server>,
}

fn config() -> &'static Mutex<Config> {
    static C: OnceLock<Mutex<Config>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Config::default()))
}
fn running() -> &'static Mutex<Option<Server>> {
    static S: OnceLock<Mutex<Option<Server>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}
fn pending() -> &'static Mutex<HashMap<u64, mpsc::Sender<Value>>> {
    static P: OnceLock<Mutex<HashMap<u64, mpsc::Sender<Value>>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    if getrandom::getrandom(&mut buf).is_err() {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        for (i, b) in buf.iter_mut().enumerate() {
            *b = (t >> ((i % 16) * 8)) as u8 ^ (i as u8).wrapping_mul(31);
        }
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

// ------------------------------------------------------------- commands

/// Turns the panel on or off and updates the PIN and paired devices.
#[tauri::command]
pub fn admin_configure(app: AppHandle, enabled: bool, pin: String, tokens: Vec<String>) -> Result<Value, String> {
    {
        let mut c = config().lock().unwrap();
        c.pin = pin;
        c.tokens = tokens;
    }
    let mut run = running().lock().unwrap();
    if enabled && run.is_none() {
        let server = tiny_http::Server::http(("0.0.0.0", PORT)).map_err(|e| format!("port {PORT}: {e}"))?;
        let server = Arc::new(server);
        let s2 = server.clone();
        let app2 = app.clone();
        thread::spawn(move || {
            for req in s2.incoming_requests() {
                let app = app2.clone();
                thread::spawn(move || handle(app, req));
            }
        });
        *run = Some(Server { server });
    } else if !enabled {
        if let Some(s) = run.take() {
            s.server.unblock();
        }
    }
    Ok(json!({ "running": run.is_some(), "port": PORT, "addresses": local_addresses() }))
}

/// The launcher's answer to an "admin-call".
#[tauri::command]
pub fn admin_reply(id: u64, result: Value) {
    if let Some(tx) = pending().lock().unwrap().remove(&id) {
        let _ = tx.send(result);
    }
}

#[tauri::command]
pub fn admin_info() -> Value {
    json!({ "running": running().lock().unwrap().is_some(), "port": PORT, "addresses": local_addresses() })
}

fn ask_launcher(app: &AppHandle, action: &str, args: Value) -> Value {
    ask_launcher_as(app, action, args, "")
}
/// `caller`: a short id of the paired device asking (never its token).
fn ask_launcher_as(app: &AppHandle, action: &str, args: Value, caller: &str) -> Value {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    pending().lock().unwrap().insert(id, tx);
    if !matches!(action, "status" | "jobs" | "schedule" | "settings.get" | "apps" | "channels" | "admin.devices" | "update.check") {
        crate::log_line(&format!("Phone: {action}"));
    }
    let _ = app.emit("admin-call", json!({ "id": id, "action": action, "args": args, "caller": caller }));
    match rx.recv_timeout(Duration::from_secs(20)) {
        Ok(v) => v,
        Err(_) => {
            pending().lock().unwrap().remove(&id);
            json!({ "error": "The TV didn't answer in time." })
        }
    }
}

// ------------------------------------------------------------- requests

fn header(req: &tiny_http::Request, name: &'static str) -> Option<String> {
    req.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str().to_string())
}

fn respond(req: tiny_http::Request, status: u16, ctype: &str, body: Vec<u8>) {
    let mut res = tiny_http::Response::from_data(body).with_status_code(status);
    for (k, v) in [
        ("Content-Type", ctype),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "no-referrer"),
        ("X-Frame-Options", "DENY"),
    ] {
        if let Ok(h) = tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()) {
            res.add_header(h);
        }
    }
    let _ = req.respond(res);
}
fn json_reply(req: tiny_http::Request, status: u16, v: Value) {
    respond(req, status, "application/json", v.to_string().into_bytes());
}

fn attempts() -> &'static Mutex<Vec<Instant>> {
    static A: OnceLock<Mutex<Vec<Instant>>> = OnceLock::new();
    A.get_or_init(|| Mutex::new(Vec::new()))
}

fn handle(app: AppHandle, mut req: tiny_http::Request) {
    let url = req.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((&url, ""));
    let path = path.to_string();
    let method = req.method().as_str().to_uppercase();

    // The page itself needs no token (it asks for the PIN).
    match path.as_str() {
        "/" | "/index.html" => return respond(req, 200, "text/html; charset=utf-8", INDEX.as_bytes().to_vec()),
        "/app.js" => return respond(req, 200, "text/javascript; charset=utf-8", APP_JS.as_bytes().to_vec()),
        "/style.css" => return respond(req, 200, "text/css; charset=utf-8", STYLE.as_bytes().to_vec()),
        "/manifest.json" => return respond(req, 200, "application/manifest+json", MANIFEST.as_bytes().to_vec()),
        "/icon.png" => return respond(req, 200, "image/png", ICON.to_vec()),
        _ => {}
    }
    if !path.starts_with("/api/") {
        return respond(req, 404, "text/plain", b"Not found".to_vec());
    }

    // Body (JSON for most calls, raw bytes for uploads); 300 MB at most.
    let mut body = Vec::new();
    let _ = req.as_reader().take(300 * 1024 * 1024).read_to_end(&mut body);
    let args: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);

    if path == "/api/pair" && method == "POST" {
        let mut a = attempts().lock().unwrap();
        a.retain(|t| t.elapsed() < Duration::from_secs(60));
        if a.len() >= 6 {
            drop(a);
            return json_reply(req, 429, json!({ "error": "Too many tries. Wait a minute." }));
        }
        let pin = args["pin"].as_str().unwrap_or("").trim().to_string();
        let ok = {
            let c = config().lock().unwrap();
            !c.pin.is_empty() && pin == c.pin
        };
        if !ok {
            a.push(Instant::now());
            drop(a);
            thread::sleep(Duration::from_millis(800));
            return json_reply(req, 403, json!({ "error": "Wrong PIN." }));
        }
        drop(a);
        let token = random_hex(24);
        config().lock().unwrap().tokens.push(token.clone());
        let name = args["name"].as_str().unwrap_or("Phone").chars().take(40).collect::<String>();
        let _ = app.emit("admin-paired", json!({ "token": token, "name": name }));
        return json_reply(req, 200, json!({ "token": token }));
    }

    // Doorbell: a ring from Home Assistant, a script or any device on the
    // network (the launcher checks the key). No pairing needed.
    if path == "/api/doorbell" {
        let key = query_value(query, "key").or_else(|| args["key"].as_str().map(String::from)).unwrap_or_default();
        let camera = query_value(query, "camera").or_else(|| args["camera"].as_str().map(String::from));
        let _ = app.emit("doorbell-ring", json!({ "key": key, "camera": camera }));
        return json_reply(req, 200, json!({ "ok": true }));
    }

    let token = header(&req, "X-Token").unwrap_or_default();
    let authorised = !token.is_empty() && config().lock().unwrap().tokens.iter().any(|t| t == &token);
    if !authorised {
        return json_reply(req, 401, json!({ "error": "Not paired." }));
    }

    let result: Result<Value, String> = match (method.as_str(), path.as_str()) {
        ("GET", "/api/status") => Ok(status(&app)),
        ("POST", "/api/key") => {
            let b = args["key"].as_str().unwrap_or("");
            if crate::gamepad::remote_button(&app, b) { Ok(json!({ "ok": true })) } else { Err(format!("unknown key {b}")) }
        }
        ("POST", "/api/text") => {
            crate::gamepad::remote_text(&app, args["text"].as_str().unwrap_or(""));
            Ok(json!({ "ok": true }))
        }
        ("POST", "/api/power") => {
            let a = args["action"].as_str().unwrap_or("").to_string();
            if a == "restart-app" {
                app.restart();
            }
            crate::do_system_action(app.clone(), a).map(|_| json!({ "ok": true }))
        }
        ("GET", "/api/files") => crate::media::list_files(query_value(query, "kind").as_deref().unwrap_or("recordings")),
        ("POST", "/api/files/delete") => crate::media::delete_file(args["path"].as_str().unwrap_or("")).map(|_| json!({ "ok": true })),
        ("POST", "/api/upload") => {
            // Photos to show, or an update package. The name comes in the query.
            let name = query_value(query, "name").unwrap_or_else(|| "upload.bin".into());
            match crate::media::save_upload(&app, &name, &body) {
                Ok(p) => {
                    let kind = query_value(query, "kind").unwrap_or_default();
                    Ok(ask_launcher(&app, "upload", json!({ "kind": kind, "path": p })))
                }
                Err(e) => Err(e),
            }
        }
        ("GET", "/api/log") => Ok(json!({ "lines": crate::log_lines() })),
        ("GET", "/api/monitor") => Ok(crate::monitor::snapshot()),
        ("POST", "/api/docker") => crate::monitor::docker_action(args["name"].as_str().unwrap_or(""), args["action"].as_str().unwrap_or("")),
        ("GET", "/api/snapshot") => {
            let id = query_value(query, "id").unwrap_or_default();
            return match std::fs::read(crate::cameras::snapshot_path(&id)) {
                Ok(bytes) => respond(req, 200, "image/jpeg", bytes),
                Err(_) => respond(req, 404, "text/plain", b"No picture yet".to_vec()),
            };
        }
        ("POST", "/api/call") => {
            let action = args["action"].as_str().unwrap_or("").to_string();
            Ok(ask_launcher_as(&app, &action, args["args"].clone(), &device_id(&token)))
        }
        _ => Err("unknown request".into()),
    };
    match result {
        Ok(v) => {
            let code = if v.get("error").is_some() { 400 } else { 200 };
            json_reply(req, code, v)
        }
        Err(e) => json_reply(req, 400, json!({ "error": e })),
    }
}

/// A device's public id: the start of its token.
pub fn device_id(token: &str) -> String {
    token.chars().take(10).collect()
}

fn query_value(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| percent_encoding::percent_decode_str(&v.replace('+', " ")).decode_utf8_lossy().into_owned())
    })
}

// ------------------------------------------------------------- status

pub fn local_addresses() -> Vec<String> {
    // The address other devices use: the one the default route leaves from.
    let mut out = Vec::new();
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(a) = sock.local_addr() {
                out.push(a.ip().to_string());
            }
        }
    }
    out
}

fn read(path: &str) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

fn cpu_sample() -> Option<(u64, u64)> {
    let line = read("/proc/stat");
    let first = line.lines().next()?;
    let nums: Vec<u64> = first.split_whitespace().skip(1).filter_map(|x| x.parse().ok()).collect();
    if nums.len() < 4 {
        return None;
    }
    let idle = nums[3] + nums.get(4).copied().unwrap_or(0);
    Some((nums.iter().sum(), idle))
}

fn status(app: &AppHandle) -> Value {
    let cpu = match (cpu_sample(), {
        thread::sleep(Duration::from_millis(250));
        cpu_sample()
    }) {
        (Some((t1, i1)), Some((t2, i2))) if t2 > t1 => Some(100.0 * (1.0 - (i2 - i1) as f64 / (t2 - t1) as f64)),
        _ => None,
    };
    let mem = read("/proc/meminfo");
    let kb = |k: &str| mem.lines().find(|l| l.starts_with(k)).and_then(|l| l.split_whitespace().nth(1)).and_then(|v| v.parse::<u64>().ok());
    let temps: Vec<f64> = std::fs::read_dir("/sys/class/thermal")
        .map(|d| {
            d.flatten()
                .filter_map(|e| read(&format!("{}/temp", e.path().display())).trim().parse::<f64>().ok())
                .map(|t| t / 1000.0)
                .filter(|t| *t > 0.0 && *t < 130.0)
                .collect()
        })
        .unwrap_or_default();
    let uptime = read("/proc/uptime").split_whitespace().next().and_then(|v| v.parse::<f64>().ok());
    let disk = std::process::Command::new("df").args(["-B1", "--output=size,avail", "/"]).output().ok().and_then(|o| {
        let s = String::from_utf8_lossy(&o.stdout).to_string();
        let v: Vec<u64> = s.lines().nth(1)?.split_whitespace().filter_map(|x| x.parse().ok()).collect();
        Some(json!({ "total": v.first()?, "free": v.get(1)? }))
    });
    let battery = std::fs::read_dir("/sys/class/power_supply").ok().and_then(|d| {
        d.flatten().find_map(|e| {
            let p = e.path();
            let cap = read(&format!("{}/capacity", p.display())).trim().parse::<u64>().ok()?;
            Some(json!({ "percent": cap, "status": read(&format!("{}/status", p.display())).trim() }))
        })
    });
    let host = read("/etc/hostname").trim().to_string();
    let launcher = ask_launcher(app, "status", Value::Null);
    json!({
        "version": app.package_info().version.to_string(),
        "host": host,
        "addresses": local_addresses(),
        "cpu": cpu,
        "memory": { "total": kb("MemTotal:").map(|v| v * 1024), "available": kb("MemAvailable:").map(|v| v * 1024) },
        "temperature": temps.iter().cloned().fold(None, |a: Option<f64>, t| Some(a.map_or(t, |a| a.max(t)))),
        "uptime": uptime,
        "disk": disk,
        "battery": battery,
        "screen": crate::gamepad::mode_name(app),
        "volume": crate::volume_get(),
        "launcher": launcher,
    })
}

pub fn app_data_dir(app: &AppHandle) -> std::path::PathBuf {
    let d = app.path().app_cache_dir().unwrap_or_else(|_| std::env::temp_dir());
    let _ = CACHE_DIR.set(d.clone());
    d
}
static CACHE_DIR: OnceLock<std::path::PathBuf> = OnceLock::new();
/// The same folder, for code without an app handle (set once the app runs).
pub fn app_data_dir_static() -> std::path::PathBuf {
    CACHE_DIR.get().cloned().unwrap_or_else(std::env::temp_dir)
}
