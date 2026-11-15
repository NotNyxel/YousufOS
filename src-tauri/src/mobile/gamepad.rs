//! Android: the TV remote reaches the app as normal key presses. Buttons from
//! the phone remote are passed to the interface, which hands them to Android
//! (so they work in YousufOS and in its video player).
use tauri::{AppHandle, Emitter};

pub fn spawn(_app: AppHandle) {}
pub fn self_test(_app: AppHandle) {}

pub fn remote_button(app: &AppHandle, button: &str) -> bool {
    const KNOWN: [&str; 14] = ["up", "down", "left", "right", "ok", "back", "playpause", "menu", "y", "prev", "next", "volup", "voldown", "home"];
    if !KNOWN.contains(&button) {
        return false;
    }
    let _ = app.emit("remote-button", button.to_string());
    true
}

pub fn remote_text(app: &AppHandle, text: &str) {
    let _ = app.emit("remote-text", text.to_string());
}

pub fn mode_name(_app: &AppHandle) -> &'static str {
    "launcher"
}
