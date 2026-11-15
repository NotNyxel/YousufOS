//! Android: apps are the TV's own Android apps (opened by the Java side),
//! so there is no embedded browser view.
use tauri::AppHandle;

pub fn is_open(_app: &AppHandle) -> bool {
    false
}
pub fn open(_app: &AppHandle, _opts: &crate::LaunchOpts) -> Result<(), String> {
    Err("Web apps open as Android apps on this TV".into())
}
pub fn open_start_page(_app: &AppHandle) {}
pub fn close(_app: &AppHandle) -> bool {
    false
}
pub fn pause_and_hide(_app: &AppHandle) {}
pub fn key(_app: &AppHandle, _name: &str) {}
