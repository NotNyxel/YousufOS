//! Apps opened *inside* YousufOS: a second webview laid over the launcher in
//! the same window. No extra windows, Home always works, and controller input
//! is delivered straight into the page (works on X11 and Wayland).

use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use tauri::{
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewBuilder, WebviewUrl,
};

use crate::LaunchOpts;

pub const LABEL: &str = "app";

pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview(LABEL).is_some()
}

pub fn open(app: &AppHandle, opts: &LaunchOpts) -> Result<(), String> {
    close(app);
    let window = app.get_window("main").ok_or("main window missing")?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    // "app:browser.html" = a page that ships with YousufOS.
    let target = match opts.url.strip_prefix("app:") {
        Some(path) => WebviewUrl::App(path.into()),
        None => WebviewUrl::External(opts.url.parse().map_err(|e| format!("bad url {}: {e}", opts.url))?),
    };

    let nav_app = app.clone();
    let popup_app = app.clone();
    // The app stays hidden behind the launcher's loading screen until its
    // first page has loaded: no white flash.
    static SESSION: AtomicU64 = AtomicU64::new(0);
    let session = SESSION.fetch_add(1, Ordering::SeqCst) + 1;
    let shown = Arc::new(AtomicBool::new(false));
    let load_shown = shown.clone();
    let mut builder = WebviewBuilder::new(LABEL, target)
        .initialization_script_for_all_frames(crate::inject_script(opts, true))
        // Keys stay with the launcher (its loading screen) until the app is shown.
        .focused(false)
        .on_navigation(move |u| {
            if u.scheme() == "yousufos" {
                let a = nav_app.clone();
                let cmd = u.to_string();
                std::thread::spawn(move || crate::handle_page_cmd(&a, &cmd));
                return false;
            }
            true
        })
        // Links that want a new window open in the same view instead.
        .on_new_window(move |u, _features| {
            let a = popup_app.clone();
            std::thread::spawn(move || {
                if let Some(w) = a.get_webview(LABEL) {
                    let _ = w.navigate(u);
                }
            });
            NewWindowResponse::Deny
        })
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let app = webview.app_handle().clone();
            let _ = app.emit("web-visited", payload.url().to_string());
            if !load_shown.swap(true, Ordering::SeqCst) {
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(250));
                    reveal(&app);
                });
            }
        });
    if let Some(ua) = opts.user_agent.as_ref().filter(|s| !s.is_empty()) {
        builder = builder.user_agent(ua);
    }
    let webview = window
        .add_child(builder, PhysicalPosition::new(0, 0), size)
        .map_err(|e| e.to_string())?;
    configure(app, &webview);
    let _ = webview.hide();
    // Slow sites: show whatever has loaded after a few seconds.
    let late = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(9));
        if SESSION.load(Ordering::SeqCst) == session && !shown.swap(true, Ordering::SeqCst) {
            reveal(&late);
        }
    });
    Ok(())
}

/// Swaps the launcher for the loaded app. The launcher is hidden so the app
/// gets the whole window and the launcher stops drawing while you watch.
fn reveal(app: &AppHandle) {
    let Some(w) = app.get_webview(LABEL) else { return };
    let _ = w.show();
    if let Some(main) = app.get_webview("main") {
        let _ = main.hide();
    }
    let _ = w.set_focus();
    let _ = app.emit("app-shown", ());
}

/// Loads the browser start page (shipped with YousufOS) in the app view.
pub fn open_start_page(app: &AppHandle) {
    let (Some(w), Some(main)) = (app.get_webview(LABEL), app.get_webview("main")) else { return };
    let Ok(base) = main.url() else { return };
    let lang = app
        .state::<crate::Current>()
        .0
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|o| o.lang.clone())
        .unwrap_or_else(|| "en".into());
    if let Ok(u) = base.join(&format!("/browser.html?lang={lang}")) {
        let _ = w.navigate(u);
    }
}

/// Closes the embedded app. Returns true if one was open.
pub fn close(app: &AppHandle) -> bool {
    match app.get_webview(LABEL) {
        Some(w) => {
            let _ = w.close();
            show_main(app);
            true
        }
        None => false,
    }
}

/// Prayer time: stop any video and get the app out of the way.
pub fn pause_and_hide(app: &AppHandle) {
    if let Some(w) = app.get_webview(LABEL) {
        let _ = w.eval("document.querySelectorAll('video,audio').forEach(m=>m.pause())");
        let _ = w.hide();
        show_main(app);
    }
}

fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

pub fn eval(app: &AppHandle, js: &str) {
    if let Some(w) = app.get_webview(LABEL) {
        let _ = w.eval(js);
    }
}

#[cfg(target_os = "linux")]
fn configure(app: &AppHandle, webview: &tauri::Webview) {
    let gpu = crate::read_config_value(app)
        .and_then(|v| v.get("gpu").and_then(|g| g.as_bool()))
        .unwrap_or(true);
    let _ = webview.with_webview(move |wv| {
        use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};
        if let Some(s) = wv.inner().settings() {
            if gpu {
                s.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Always);
            }
            s.set_media_playback_requires_user_gesture(false);
            s.set_enable_mediasource(true);
            s.set_enable_encrypted_media(true);
            s.set_enable_fullscreen(true);
            s.set_javascript_can_open_windows_automatically(false);
            s.set_enable_smooth_scrolling(true);
        }
    });
}

#[cfg(not(target_os = "linux"))]
fn configure(_app: &AppHandle, _webview: &tauri::Webview) {}

// ------------------------------------------------------------ input

/// Runs `f` with the embedded page's GTK widget on the main thread.
#[cfg(target_os = "linux")]
fn with_widget(app: &AppHandle, f: impl FnOnce(&gtk::Widget) + Send + 'static) {
    if let Some(w) = app.get_webview(LABEL) {
        let _ = w.with_webview(move |p| {
            use gtk::prelude::Cast;
            let wv = p.inner();
            f(wv.upcast_ref::<gtk::Widget>());
        });
    }
}

/// A real key press + release delivered to the page (trusted by the site).
pub fn key(app: &AppHandle, name: &str) {
    #[cfg(target_os = "linux")]
    {
        let keyval = match name {
            "ArrowUp" => gdk::keys::constants::Up,
            "ArrowDown" => gdk::keys::constants::Down,
            "ArrowLeft" => gdk::keys::constants::Left,
            "ArrowRight" => gdk::keys::constants::Right,
            "Enter" => gdk::keys::constants::Return,
            "Escape" => gdk::keys::constants::Escape,
            "Backspace" => gdk::keys::constants::BackSpace,
            " " => gdk::keys::constants::space,
            "f" => gdk::keys::constants::f,
            "PageUp" => gdk::keys::constants::Page_Up,
            "PageDown" => gdk::keys::constants::Page_Down,
            _ => return,
        };
        let keyval = *keyval;
        with_widget(app, move |w| gdk_input::key(w, keyval));
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (app, name);
}

pub fn mouse_move(app: &AppHandle, x: f64, y: f64) {
    #[cfg(target_os = "linux")]
    with_widget(app, move |w| gdk_input::motion(w, x, y));
    let _ = app.get_webview(LABEL).map(|w| w.eval(&format!("window.__yousuf&&__yousuf.cursor({x:.0},{y:.0})")));
}

pub fn click(app: &AppHandle, x: f64, y: f64) {
    #[cfg(target_os = "linux")]
    with_widget(app, move |w| gdk_input::click(w, x, y));
    #[cfg(not(target_os = "linux"))]
    let _ = (app, x, y);
}

#[cfg(target_os = "linux")]
mod gdk_input {
    use glib::translate::{ToGlibPtr, ToGlibPtrMut};
    use gtk::prelude::*;

    fn devices(win: &gdk::Window) -> (Option<gdk::Device>, Option<gdk::Device>) {
        let seat = win.display().default_seat();
        (
            seat.as_ref().and_then(|s| s.keyboard()),
            seat.as_ref().and_then(|s| s.pointer()),
        )
    }

    pub fn key(widget: &gtk::Widget, keyval: u32) {
        let Some(win) = widget.window() else { return };
        let (keyboard, _) = devices(&win);
        let hw = gdk::Keymap::for_display(&win.display())
            .map(|k| k.entries_for_keyval(keyval))
            .and_then(|v| v.into_iter().next())
            .map(|e| e.keycode())
            .unwrap_or(0);
        for kind in [gdk::EventType::KeyPress, gdk::EventType::KeyRelease] {
            let mut ev = gdk::Event::new(kind);
            unsafe {
                let raw = { let p: *mut gdk::ffi::GdkEvent = ev.to_glib_none_mut().0; p } as *mut gdk::ffi::GdkEventKey;
                (*raw).window = win.to_glib_full();
                (*raw).send_event = 0;
                (*raw).time = gtk::current_event_time();
                (*raw).state = 0;
                (*raw).keyval = keyval;
                (*raw).hardware_keycode = hw as u16;
                (*raw).group = 0;
            }
            ev.set_device(keyboard.as_ref());
            widget.event(&ev);
        }
    }

    fn fill_pos(win: &gdk::Window, x: f64, y: f64) -> (f64, f64) {
        let (_, ox, oy) = win.origin();
        (ox as f64 + x, oy as f64 + y)
    }

    pub fn motion(widget: &gtk::Widget, x: f64, y: f64) {
        let Some(win) = widget.window() else { return };
        let (_, pointer) = devices(&win);
        let (rx, ry) = fill_pos(&win, x, y);
        let mut ev = gdk::Event::new(gdk::EventType::MotionNotify);
        unsafe {
            let raw = { let p: *mut gdk::ffi::GdkEvent = ev.to_glib_none_mut().0; p } as *mut gdk::ffi::GdkEventMotion;
            (*raw).window = win.to_glib_full();
            (*raw).send_event = 0;
            (*raw).time = gtk::current_event_time();
            (*raw).x = x;
            (*raw).y = y;
            (*raw).x_root = rx;
            (*raw).y_root = ry;
            (*raw).state = 0;
            (*raw).is_hint = 0;
        }
        ev.set_device(pointer.as_ref());
        ev.set_source_device(pointer.as_ref());
        widget.event(&ev);
    }

    pub fn click(widget: &gtk::Widget, x: f64, y: f64) {
        let Some(win) = widget.window() else { return };
        let (_, pointer) = devices(&win);
        let (rx, ry) = fill_pos(&win, x, y);
        motion(widget, x, y);
        for kind in [gdk::EventType::ButtonPress, gdk::EventType::ButtonRelease] {
            let mut ev = gdk::Event::new(kind);
            unsafe {
                let raw = { let p: *mut gdk::ffi::GdkEvent = ev.to_glib_none_mut().0; p } as *mut gdk::ffi::GdkEventButton;
                (*raw).window = win.to_glib_full();
                (*raw).send_event = 0;
                (*raw).time = gtk::current_event_time();
                (*raw).x = x;
                (*raw).y = y;
                (*raw).x_root = rx;
                (*raw).y_root = ry;
                (*raw).state = if kind == gdk::EventType::ButtonRelease { gdk::ffi::GDK_BUTTON1_MASK } else { 0 };
                (*raw).button = 1;
            }
            ev.set_device(pointer.as_ref());
            ev.set_source_device(pointer.as_ref());
            widget.event(&ev);
        }
    }
}
