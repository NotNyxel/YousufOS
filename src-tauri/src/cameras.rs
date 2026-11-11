//! Cameras: still pictures for the camera page and the phone panel. RTSP and
//! other video streams go through ffmpeg (one frame); picture addresses and
//! Home Assistant's camera proxy are fetched directly.
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub fn snapshot_dir() -> PathBuf {
    let d = crate::admin::app_data_dir_static().join("cameras");
    let _ = fs::create_dir_all(&d);
    d
}

fn safe_id(id: &str) -> String {
    id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(40).collect()
}

pub fn snapshot_path(id: &str) -> PathBuf {
    snapshot_dir().join(format!("{}.jpg", safe_id(id)))
}

/// Saves a still picture of camera `id` and returns where it is.
/// headers: "Name: value" lines (e.g. Home Assistant's Authorization).
#[tauri::command]
pub async fn camera_snapshot(id: String, url: String, headers: Option<Vec<String>>) -> Result<Value, String> {
    let headers = headers.unwrap_or_default();
    let out = snapshot_path(&id);
    let tmp = out.with_extension("part.jpg");
    let lower = url.to_lowercase();
    let is_http = lower.starts_with("http://") || lower.starts_with("https://");
    // Pictures and Home Assistant's camera proxy: a plain download.
    if is_http {
        let client = reqwest::Client::builder().timeout(Duration::from_secs(12)).build().map_err(|e| e.to_string())?;
        let mut r = client.get(&url);
        for h in &headers {
            if let Some((k, v)) = h.split_once(':') {
                r = r.header(k.trim(), v.trim());
            }
        }
        if let Ok(res) = r.send().await {
            let ctype = res.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_lowercase();
            if res.status().is_success() && ctype.starts_with("image/") {
                let bytes = res.bytes().await.map_err(|e| e.to_string())?;
                fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
                fs::rename(&tmp, &out).map_err(|e| e.to_string())?;
                return Ok(json!({ "path": out.display().to_string(), "at": now_ms() }));
            }
            if !res.status().is_success() {
                return Err(format!("HTTP {}", res.status()));
            }
        }
    }
    // Video streams (RTSP, HLS, MJPEG): one frame with ffmpeg.
    let url2 = url.clone();
    let tmp2 = tmp.clone();
    let result = tauri::async_runtime::spawn_blocking(move || grab_frame(&url2, &headers, &tmp2)).await.map_err(|e| e.to_string())?;
    result?;
    fs::rename(&tmp, &out).map_err(|e| e.to_string())?;
    Ok(json!({ "path": out.display().to_string(), "at": now_ms() }))
}

fn grab_frame(url: &str, headers: &[String], out: &PathBuf) -> Result<(), String> {
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-loglevel", "error", "-y"]);
    if url.to_lowercase().starts_with("rtsp") {
        cmd.args(["-rtsp_transport", "tcp"]);
    }
    if !headers.is_empty() {
        cmd.arg("-headers").arg(headers.iter().map(|h| format!("{h}\r\n")).collect::<String>());
    }
    cmd.args(["-i", url, "-frames:v", "1", "-q:v", "4", "-vf", "scale='min(1280,iw)':-2"]).arg(out);
    let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound { "ffmpeg is not installed".to_string() } else { e.to_string() }
    })?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(s)) if s.success() && out.exists() => return Ok(()),
            Ok(Some(_)) => return Err("the camera didn't send a picture".into()),
            Ok(None) if start.elapsed() > Duration::from_secs(15) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("the camera didn't answer".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(150)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
