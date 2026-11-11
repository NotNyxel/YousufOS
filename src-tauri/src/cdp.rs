//! A small Chrome DevTools Protocol client for apps that run in Chrome.
//! It injects the YousufOS page script (cookie banners, one window, back /
//! home handling) and delivers controller input straight to the page, so the
//! controller works on Wayland too.

use std::{
    io::{Read, Write},
    net::TcpStream,
    path::PathBuf,
    sync::mpsc::{self, Receiver, Sender},
    thread,
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use tauri::AppHandle;

pub enum Cmd {
    Key(&'static str),
    Move(f64, f64),
    Click(f64, f64),
    Wheel(f64, f64, f64, f64),
    Eval(String),
}

/// Dropping the handle ends the connection thread.
pub struct Handle {
    tx: Sender<Cmd>,
}

impl Handle {
    pub fn send(&self, cmd: Cmd) -> bool {
        self.tx.send(cmd).is_ok()
    }
}

pub fn start(app: AppHandle, profile: PathBuf, script: String) -> Handle {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || run(app, profile, script, rx));
    Handle { tx }
}

fn port(profile: &PathBuf) -> Option<u16> {
    let s = std::fs::read_to_string(profile.join("DevToolsActivePort")).ok()?;
    s.lines().next()?.trim().parse().ok()
}

fn http_get(port: u16, path: &str) -> Option<String> {
    let mut s = TcpStream::connect(("127.0.0.1", port)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").ok()?;
    // Chrome keeps the connection open, so read exactly Content-Length bytes.
    let mut data = Vec::new();
    let mut chunk = [0u8; 16384];
    loop {
        let n = s.read(&mut chunk).ok()?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&chunk[..n]);
        let text = String::from_utf8_lossy(&data);
        if let Some((head, body)) = text.split_once("\r\n\r\n") {
            let len = head
                .lines()
                .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().ok()))
                .flatten();
            if let Some(len) = len {
                if body.len() >= len {
                    return Some(body[..len].to_string());
                }
            }
        }
    }
    let text = String::from_utf8_lossy(&data).to_string();
    text.split_once("\r\n\r\n").map(|(_, b)| b.to_string())
}

fn page_ws(port: u16) -> Option<String> {
    let body = http_get(port, "/json/list")?;
    let list: Vec<Value> = serde_json::from_str(&body).ok()?;
    list.iter()
        .find(|t| t["type"] == "page" && !t["url"].as_str().unwrap_or("").starts_with("devtools://"))
        .and_then(|t| t["webSocketDebuggerUrl"].as_str().map(String::from))
}

fn key_def(name: &str) -> Option<(&'static str, &'static str, i64, Option<&'static str>)> {
    Some(match name {
        "ArrowUp" => ("ArrowUp", "ArrowUp", 38, None),
        "ArrowDown" => ("ArrowDown", "ArrowDown", 40, None),
        "ArrowLeft" => ("ArrowLeft", "ArrowLeft", 37, None),
        "ArrowRight" => ("ArrowRight", "ArrowRight", 39, None),
        "Enter" => ("Enter", "Enter", 13, Some("\r")),
        "Escape" => ("Escape", "Escape", 27, None),
        "Backspace" => ("Backspace", "Backspace", 8, None),
        " " => (" ", "Space", 32, Some(" ")),
        "f" => ("f", "KeyF", 70, Some("f")),
        "PageUp" => ("PageUp", "PageUp", 33, None),
        "PageDown" => ("PageDown", "PageDown", 34, None),
        _ => return None,
    })
}

fn run(app: AppHandle, profile: PathBuf, script: String, rx: Receiver<Cmd>) {
    // Wait for Chrome to come up (first start can be slow).
    let deadline = Instant::now() + Duration::from_secs(40);
    let ws_url = loop {
        if let Some(p) = port(&profile) {
            if let Some(u) = page_ws(p) {
                break u;
            }
        }
        if Instant::now() > deadline {
            return;
        }
        // Commands sent before the page is ready are dropped.
        match rx.recv_timeout(Duration::from_millis(250)) {
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
            _ => {}
        }
    };

    let Ok((mut ws, _)) = tungstenite::connect(ws_url.as_str()) else {
        eprintln!("[yousufos] DevTools connection failed");
        return;
    };
    if let tungstenite::stream::MaybeTlsStream::Plain(s) = ws.get_mut() {
        let _ = s.set_read_timeout(Some(Duration::from_millis(15)));
    }
    let mut id = 0u64;
    let mut send = |ws: &mut tungstenite::WebSocket<_>, method: &str, params: Value| {
        id += 1;
        let msg = json!({ "id": id, "method": method, "params": params }).to_string();
        ws.send(tungstenite::Message::text(msg)).is_ok()
    };

    send(&mut ws, "Runtime.enable", json!({}));
    send(&mut ws, "Page.enable", json!({}));
    send(&mut ws, "Runtime.addBinding", json!({ "name": "__yousufHost" }));
    send(&mut ws, "Page.addScriptToEvaluateOnNewDocument", json!({ "source": script }));
    send(&mut ws, "Runtime.evaluate", json!({ "expression": script }));

    loop {
        // Controller input.
        loop {
            match rx.try_recv() {
                Ok(cmd) => {
                    let ok = match cmd {
                        Cmd::Key(name) => {
                            let Some((key, code, vk, text)) = key_def(name) else { continue };
                            let mut down = json!({ "type": "keyDown", "key": key, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk });
                            if let Some(t) = text {
                                down["text"] = json!(t);
                            }
                            send(&mut ws, "Input.dispatchKeyEvent", down)
                                && send(&mut ws, "Input.dispatchKeyEvent", json!({ "type": "keyUp", "key": key, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk }))
                        }
                        Cmd::Move(x, y) => {
                            send(&mut ws, "Input.dispatchMouseEvent", json!({ "type": "mouseMoved", "x": x, "y": y }))
                                && send(&mut ws, "Runtime.evaluate", json!({ "expression": format!("window.__yousuf&&__yousuf.cursor({x:.0},{y:.0})") }))
                        }
                        Cmd::Click(x, y) => {
                            send(&mut ws, "Input.dispatchMouseEvent", json!({ "type": "mousePressed", "x": x, "y": y, "button": "left", "buttons": 1, "clickCount": 1 }))
                                && send(&mut ws, "Input.dispatchMouseEvent", json!({ "type": "mouseReleased", "x": x, "y": y, "button": "left", "buttons": 0, "clickCount": 1 }))
                        }
                        Cmd::Wheel(x, y, dx, dy) => send(&mut ws, "Input.dispatchMouseEvent", json!({ "type": "mouseWheel", "x": x, "y": y, "deltaX": dx, "deltaY": dy })),
                        Cmd::Eval(js) => send(&mut ws, "Runtime.evaluate", json!({ "expression": js })),
                    };
                    if !ok {
                        return;
                    }
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => return, // app closed
            }
        }

        // Messages from the page (binding calls).
        match ws.read() {
            Ok(tungstenite::Message::Text(t)) => {
                if let Ok(v) = serde_json::from_str::<Value>(t.as_str()) {
                    if v["method"] == "Runtime.bindingCalled" && v["params"]["name"] == "__yousufHost" {
                        let payload = v["params"]["payload"].as_str().unwrap_or("").to_string();
                        let a = app.clone();
                        thread::spawn(move || crate::handle_page_cmd(&a, &payload));
                    }
                }
            }
            Ok(tungstenite::Message::Close(_)) => return,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => return, // Chrome closed
        }
    }
}
