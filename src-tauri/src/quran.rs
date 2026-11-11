//! Qur'an downloads: recitations (one small mp3 per verse, so verses can be
//! highlighted while they play) and extra texts (translations, tafsir).
//! Everything lives in the app's data folder under quran/.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const AYAHS: u32 = 6236;

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("quran");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Edition / reciter names from alquran.cloud: letters, digits, dots and dashes.
fn check_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("bad name".into());
    }
    Ok(())
}

fn cancels() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static C: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
pub fn quran_dir(app: AppHandle) -> Result<String, String> {
    Ok(root(&app)?.display().to_string())
}

#[tauri::command]
pub fn quran_text_save(app: AppHandle, id: String, contents: String) -> Result<(), String> {
    check_id(&id)?;
    let d = root(&app)?.join("text");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let tmp = d.join(format!("{id}.json.part"));
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, d.join(format!("{id}.json"))).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quran_text_read(app: AppHandle, id: String) -> Result<Option<String>, String> {
    check_id(&id)?;
    let p = root(&app)?.join("text").join(format!("{id}.json"));
    Ok(fs::read_to_string(p).ok())
}

#[tauri::command]
pub fn quran_text_delete(app: AppHandle, id: String) -> Result<(), String> {
    check_id(&id)?;
    let _ = fs::remove_file(root(&app)?.join("text").join(format!("{id}.json")));
    Ok(())
}

fn audio_dir(app: &AppHandle, reciter: &str) -> Result<PathBuf, String> {
    check_id(reciter)?;
    Ok(root(app)?.join("audio").join(reciter))
}

fn have(dir: &PathBuf) -> Vec<u32> {
    let mut v: Vec<u32> = fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| e.file_name().to_str()?.strip_suffix(".mp3")?.parse::<u32>().ok())
                .filter(|n| (1..=AYAHS).contains(n))
                .collect()
        })
        .unwrap_or_default();
    v.sort_unstable();
    v
}

fn dir_size(dir: &PathBuf) -> u64 {
    fs::read_dir(dir).map(|rd| rd.flatten().filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum()).unwrap_or(0)
}

/// What's downloaded: text editions and, per reciter, how many verses and bytes.
#[tauri::command]
pub fn quran_status(app: AppHandle) -> Result<Value, String> {
    let r = root(&app)?;
    let texts: Vec<String> = fs::read_dir(r.join("text"))
        .map(|rd| rd.flatten().filter_map(|e| e.file_name().to_str()?.strip_suffix(".json").map(String::from)).collect())
        .unwrap_or_default();
    let mut audio = serde_json::Map::new();
    if let Ok(rd) = fs::read_dir(r.join("audio")) {
        for e in rd.flatten() {
            let Some(name) = e.file_name().to_str().map(String::from) else { continue };
            let p = e.path();
            audio.insert(name, json!({ "count": have(&p).len(), "bytes": dir_size(&p) }));
        }
    }
    Ok(json!({ "dir": r.display().to_string(), "texts": texts, "audio": audio }))
}

/// Verse numbers (1–6236) of one reciter that are on this TV.
#[tauri::command]
pub fn quran_audio_have(app: AppHandle, reciter: String) -> Result<Vec<u32>, String> {
    Ok(have(&audio_dir(&app, &reciter)?))
}

/// Downloads verses `from..=to` (whole-Qur'an verse numbers) of a reciter from
/// `base` (…/{n}.mp3), skipping ones already here. Progress: "quran-progress".
#[tauri::command]
pub async fn quran_audio_get(app: AppHandle, reciter: String, base: String, from: u32, to: u32, label: String) -> Result<u32, String> {
    let dir = audio_dir(&app, &reciter)?;
    if !base.starts_with("https://") {
        return Err("bad address".into());
    }
    let (from, to) = (from.clamp(1, AYAHS), to.clamp(1, AYAHS));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut c = cancels().lock().unwrap();
        if c.contains_key(&reciter) {
            return Err("already downloading".into());
        }
        c.insert(reciter.clone(), cancel.clone());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let todo: Vec<u32> = (from..=to).filter(|n| !dir.join(format!("{n}.mp3")).exists()).collect();
    let total = todo.len() as u32;
    let emit = |done: u32, failed: u32, state: &str| {
        let _ = app.emit("quran-progress", json!({ "reciter": reciter, "label": label, "done": done, "total": total, "failed": failed, "state": state }));
    };
    emit(0, 0, "running");
    let (mut done, mut failed) = (0u32, 0u32);
    let mut state = "done";
    for n in todo {
        if cancel.load(Ordering::Relaxed) {
            state = "stopped";
            break;
        }
        let url = format!("{}/{n}.mp3", base.trim_end_matches('/'));
        let mut ok = false;
        for _ in 0..3 {
            match client.get(&url).send().await {
                Ok(res) if res.status().is_success() => {
                    if let Ok(bytes) = res.bytes().await {
                        let part = dir.join(format!("{n}.mp3.part"));
                        if fs::File::create(&part).and_then(|mut f| f.write_all(&bytes)).is_ok() && fs::rename(&part, dir.join(format!("{n}.mp3"))).is_ok() {
                            ok = true;
                            break;
                        }
                    }
                }
                _ => tokio_sleep(1500).await,
            }
        }
        if ok {
            done += 1;
        } else {
            failed += 1;
            if failed >= 20 && done == 0 {
                state = "failed";
                break;
            }
        }
        if (done + failed) % 10 == 0 {
            emit(done, failed, "running");
        }
    }
    if state == "done" && failed > 0 {
        state = "partial";
    }
    cancels().lock().unwrap().remove(&reciter);
    emit(done, failed, state);
    Ok(done)
}

async fn tokio_sleep(ms: u64) {
    // Tauri's async runtime is tokio; avoid a direct dependency.
    tauri::async_runtime::spawn_blocking(move || std::thread::sleep(Duration::from_millis(ms))).await.ok();
}

#[tauri::command]
pub fn quran_audio_cancel(reciter: String) {
    if let Some(c) = cancels().lock().unwrap().get(&reciter) {
        c.store(true, Ordering::Relaxed);
    }
}

/// Deletes a reciter's verses `from..=to`, or all of them.
#[tauri::command]
pub fn quran_audio_delete(app: AppHandle, reciter: String, from: Option<u32>, to: Option<u32>) -> Result<(), String> {
    let dir = audio_dir(&app, &reciter)?;
    match (from, to) {
        (Some(a), Some(b)) => {
            for n in a..=b {
                let _ = fs::remove_file(dir.join(format!("{n}.mp3")));
            }
        }
        _ => {
            let _ = fs::remove_dir_all(&dir);
        }
    }
    Ok(())
}
