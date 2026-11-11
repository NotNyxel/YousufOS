//! Xbox / any standard controller via gilrs, routed to whatever is on screen.
//!
//! Launcher: D-pad / left stick move, A select, B back, X / Y page actions,
//!           LB / RB previous / next page, LT / RT volume, Menu = sidebar,
//!           View = Home page.
//! Apps:     D-pad arrows, left stick pointer (arrows in TV apps such as
//!           YouTube), right stick scroll, A click / select, B back,
//!           X play-pause, Y fullscreen, LB / RB -10 s / +10 s,
//!           LT / RT volume, Menu help, View reload.
//! Live TV (mpv): Up / Down channel, A info, B channel list, X pause.
//! Films (mpv): Left / Right -10 / +10 s, A OK (skip intro / pause),
//!           X pause, Y subtitles, Menu audio track, LB / RB previous / next.
//! Xbox button (or View + Menu): back to YousufOS from anywhere.

use std::{
    collections::HashMap,
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager};

use crate::{cdp, embed, player, ChromeLink, Current, Running};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Mode {
    Launcher,
    Embedded { tv: bool },
    Chrome { tv: bool },
    Player,
}

fn mode(app: &AppHandle) -> Mode {
    if player::is_running(app) {
        return Mode::Player;
    }
    let tv = app.state::<Current>().0.lock().unwrap().as_ref().map(|o| o.tv).unwrap_or(false);
    if embed::is_open(app) {
        return Mode::Embedded { tv };
    }
    let chrome = app.state::<Running>().0.lock().unwrap().is_some();
    let focused = app.get_webview_window("main").and_then(|w| w.is_focused().ok()).unwrap_or(true);
    if chrome && !focused {
        Mode::Chrome { tv }
    } else {
        Mode::Launcher
    }
}

/// Logical size of the screen area apps draw in.
fn view_size(app: &AppHandle) -> (f64, f64) {
    app.get_webview_window("main")
        .and_then(|w| {
            let s = w.inner_size().ok()?;
            let f = w.scale_factor().ok()?;
            Some((s.width as f64 / f, s.height as f64 / f))
        })
        .unwrap_or((1920.0, 1080.0))
}

struct Ctx {
    app: AppHandle,
    #[cfg(not(target_os = "windows"))]
    enigo: Option<enigo::Enigo>,
    cursor: (f64, f64),
    cursor_seen: Option<Instant>,
}

impl Ctx {
    fn chrome(&self, cmd: cdp::Cmd) -> bool {
        match self.app.state::<ChromeLink>().0.lock().unwrap().as_ref() {
            Some(h) => h.send(cmd),
            None => false,
        }
    }

    fn page_eval(&self, m: Mode, js: &str) {
        match m {
            Mode::Embedded { .. } => embed::eval(&self.app, js),
            Mode::Chrome { .. } => {
                self.chrome(cdp::Cmd::Eval(js.to_string()));
            }
            _ => {}
        }
    }

    /// A key for the app on screen (or the launcher).
    fn key(&mut self, m: Mode, name: &'static str) {
        match m {
            Mode::Launcher => {
                let _ = self.app.emit("gamepad-key", name);
            }
            Mode::Embedded { .. } => {
                if name == "Enter" {
                    embed::eval(&self.app, "window.__yousufPad=Date.now()");
                }
                embed::key(&self.app, name)
            }
            Mode::Chrome { .. } => {
                if name == "Enter" {
                    self.chrome(cdp::Cmd::Eval("window.__yousufPad=Date.now()".into()));
                }
                if !self.chrome(cdp::Cmd::Key(name)) {
                    self.enigo_key(name);
                }
            }
            Mode::Player => {}
        }
    }

    #[cfg(not(target_os = "windows"))]
    fn enigo_key(&mut self, name: &str) {
        use enigo::{Direction, Key, Keyboard};
        if self.enigo.is_none() {
            self.enigo = enigo::Enigo::new(&enigo::Settings::default()).ok();
        }
        let Some(e) = self.enigo.as_mut() else { return };
        let k = match name {
            "ArrowUp" => Key::UpArrow,
            "ArrowDown" => Key::DownArrow,
            "ArrowLeft" => Key::LeftArrow,
            "ArrowRight" => Key::RightArrow,
            "Enter" => Key::Return,
            "Escape" => Key::Escape,
            " " => Key::Space,
            "f" => Key::Unicode('f'),
            _ => return,
        };
        let _ = e.key(k, Direction::Click);
    }
    #[cfg(target_os = "windows")]
    fn enigo_key(&mut self, _name: &str) {}

    fn cursor_active(&self) -> bool {
        self.cursor_seen.map(|t| t.elapsed() < Duration::from_secs(6)).unwrap_or(false)
    }

    fn move_cursor(&mut self, m: Mode, dx: f64, dy: f64) {
        let (w, h) = view_size(&self.app);
        if !self.cursor_active() && self.cursor_seen.is_none() {
            self.cursor = (w / 2.0, h / 2.0);
        }
        self.cursor.0 = (self.cursor.0 + dx).clamp(0.0, w - 1.0);
        self.cursor.1 = (self.cursor.1 + dy).clamp(0.0, h - 1.0);
        self.cursor_seen = Some(Instant::now());
        let (x, y) = self.cursor;
        match m {
            Mode::Embedded { .. } => embed::mouse_move(&self.app, x, y),
            Mode::Chrome { .. } => {
                self.chrome(cdp::Cmd::Move(x, y));
            }
            _ => {}
        }
    }

    fn click(&mut self, m: Mode) {
        let (x, y) = self.cursor;
        // Lets the page open its on-screen keyboard if this lands on a text box.
        self.page_eval(m, "window.__yousufPad=Date.now()");
        match m {
            Mode::Embedded { .. } => embed::click(&self.app, x, y),
            Mode::Chrome { .. } => {
                self.chrome(cdp::Cmd::Click(x, y));
            }
            _ => {}
        }
        self.cursor_seen = Some(Instant::now());
    }

    fn scroll(&mut self, m: Mode, dx: f64, dy: f64) {
        let (w, h) = view_size(&self.app);
        let (x, y) = if self.cursor_seen.is_some() { self.cursor } else { (w / 2.0, h / 2.0) };
        match m {
            Mode::Chrome { .. } => {
                self.chrome(cdp::Cmd::Wheel(x, y, dx, dy));
            }
            Mode::Embedded { .. } => embed::eval(&self.app, &format!("window.__yousuf&&__yousuf.scroll({x:.0},{y:.0},{dx:.0},{dy:.0})")),
            _ => {}
        }
    }

    fn volume(&self, m: Mode, step: i32) {
        let Some(level) = crate::volume_step(step) else { return };
        match m {
            Mode::Launcher => {
                let _ = self.app.emit("volume", level);
            }
            Mode::Player => player::command(&self.app, &["show-text", &format!("🔊 {level}%"), "1200"]),
            _ => self.page_eval(m, &format!("window.__yousuf&&__yousuf.toast('🔊 {level}%',1200)")),
        }
    }
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        use gilrs::{Axis, Button, EventType, Gilrs};

        let mut gilrs = match Gilrs::new() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("[yousufos] controller support unavailable: {e}");
                return;
            }
        };
        let mut ctx = Ctx {
            app: app.clone(),
            #[cfg(not(target_os = "windows"))]
            enigo: None,
            cursor: (960.0, 540.0),
            cursor_seen: None,
        };

        let dirs: [&'static str; 4] = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
        let mut dpad = [false; 4];
        let mut stick = [0f32; 2];
        let mut rstick = [0f32; 2];
        let mut repeat: HashMap<usize, (Instant, u32)> = HashMap::new();
        let (mut view, mut menu) = (false, false);
        let mut combo_used = false;
        let mut last_scroll = Instant::now();

        for (_, pad) in gilrs.gamepads() {
            let _ = app.emit("gamepad-connected", pad.name().to_string());
        }

        loop {
            while let Some(ev) = gilrs.next_event() {
                let m = mode(&app);
                match ev.event {
                    EventType::Connected => {
                        let name = gilrs.gamepad(ev.id).name().to_string();
                        let _ = app.emit("gamepad-connected", name);
                    }
                    EventType::ButtonPressed(b, _) => match b {
                        Button::DPadUp => dpad[0] = true,
                        Button::DPadDown => dpad[1] = true,
                        Button::DPadLeft => dpad[2] = true,
                        Button::DPadRight => dpad[3] = true,
                        Button::South => match m {
                            Mode::Player => player::command(&app, &["keypress", "ENTER"]),
                            Mode::Embedded { tv: false } | Mode::Chrome { tv: false } if ctx.cursor_active() => ctx.click(m),
                            _ => ctx.key(m, "Enter"),
                        },
                        Button::East => match m {
                            Mode::Launcher => ctx.key(m, "Escape"),
                            Mode::Player => player::command(&app, &["keypress", "ESC"]),
                            Mode::Embedded { tv: true } | Mode::Chrome { tv: true } => ctx.key(m, "Escape"),
                            _ => ctx.page_eval(m, "window.__yousuf?__yousuf.back():history.back()"),
                        },
                        Button::West => match m {
                            Mode::Launcher => ctx.key(m, "x"),
                            Mode::Player => player::command(&app, &["keypress", "SPACE"]),
                            Mode::Embedded { tv: true } | Mode::Chrome { tv: true } => ctx.key(m, " "),
                            _ => ctx.page_eval(m, "window.__yousuf&&(__yousuf.playPause()||__yousuf.keyboard())"),
                        },
                        Button::North => match m {
                            Mode::Launcher => ctx.key(m, "y"),
                            Mode::Player => player::command(&app, &["keypress", "y"]),
                            _ => ctx.key(m, "f"),
                        },
                        Button::LeftTrigger => match m {
                            Mode::Launcher => ctx.key(m, "PageUp"),
                            Mode::Player => player::command(&app, &["keypress", "PGUP"]),
                            _ => ctx.page_eval(m, "window.__yousuf?(__yousuf.seek(-10)||history.back()):history.back()"),
                        },
                        Button::RightTrigger => match m {
                            Mode::Launcher => ctx.key(m, "PageDown"),
                            Mode::Player => player::command(&app, &["keypress", "PGDWN"]),
                            _ => ctx.page_eval(m, "window.__yousuf?(__yousuf.seek(10)||history.forward()):history.forward()"),
                        },
                        Button::LeftTrigger2 => ctx.volume(m, -5),
                        Button::RightTrigger2 => ctx.volume(m, 5),
                        Button::RightThumb | Button::LeftThumb => {
                            if matches!(m, Mode::Embedded { .. } | Mode::Chrome { .. }) {
                                ctx.click(m);
                            }
                        }
                        Button::Mode => crate::go_home(&app),
                        Button::Select => {
                            view = true;
                            if menu {
                                combo_used = true;
                                crate::go_home(&app);
                            }
                        }
                        Button::Start => {
                            menu = true;
                            if view {
                                combo_used = true;
                                crate::go_home(&app);
                            }
                        }
                        _ => {}
                    },
                    EventType::ButtonReleased(b, _) => match b {
                        Button::DPadUp => dpad[0] = false,
                        Button::DPadDown => dpad[1] = false,
                        Button::DPadLeft => dpad[2] = false,
                        Button::DPadRight => dpad[3] = false,
                        // View / Menu act on release so the Home combo doesn't trigger them.
                        Button::Select => {
                            view = false;
                            if !combo_used && !menu {
                                match m {
                                    Mode::Launcher => ctx.key(m, "Home"),
                                    Mode::Embedded { .. } | Mode::Chrome { .. } => ctx.page_eval(m, "location.reload()"),
                                    Mode::Player => player::command(&app, &["keypress", "ENTER"]),
                                }
                            }
                            if !menu {
                                combo_used = false;
                            }
                        }
                        Button::Start => {
                            menu = false;
                            if !combo_used && !view {
                                match m {
                                    Mode::Launcher => ctx.key(m, "ContextMenu"),
                                    Mode::Embedded { .. } | Mode::Chrome { .. } => ctx.page_eval(m, "window.__yousuf&&__yousuf.help()"),
                                    Mode::Player => player::command(&app, &["keypress", "m"]),
                                }
                            }
                            if !view {
                                combo_used = false;
                            }
                        }
                        _ => {}
                    },
                    EventType::AxisChanged(axis, v, _) => match axis {
                        Axis::LeftStickX => stick[0] = v,
                        Axis::LeftStickY => stick[1] = v,
                        Axis::RightStickX => rstick[0] = v,
                        Axis::RightStickY => rstick[1] = v,
                        _ => {}
                    },
                    EventType::Disconnected => {
                        dpad = [false; 4];
                        stick = [0.0; 2];
                        rstick = [0.0; 2];
                    }
                    _ => {}
                }
            }

            let m = mode(&app);
            let pointer_apps = matches!(m, Mode::Embedded { tv: false } | Mode::Chrome { tv: false });

            // Directions with key repeat that speeds up the longer it's held.
            let now = Instant::now();
            let stick_dirs = !pointer_apps;
            let active = [
                dpad[0] || (stick_dirs && stick[1] > 0.6),
                dpad[1] || (stick_dirs && stick[1] < -0.6),
                dpad[2] || (stick_dirs && stick[0] < -0.6),
                dpad[3] || (stick_dirs && stick[0] > 0.6),
            ];
            for i in 0..4 {
                if !active[i] {
                    repeat.remove(&i);
                    continue;
                }
                let fire = match repeat.get(&i) {
                    None => Some((now + Duration::from_millis(300), 0)),
                    Some((t, n)) if now >= *t => {
                        let gap = match n {
                            0..=3 => 115,
                            4..=10 => 85,
                            _ => 55,
                        };
                        Some((now + Duration::from_millis(gap), n + 1))
                    }
                    _ => None,
                };
                if let Some(next) = fire {
                    repeat.insert(i, next);
                    match m {
                        // The player's key file decides what each one does
                        // (channels in Live TV, seeking in films).
                        Mode::Player => player::command(&app, &["keypress", ["UP", "DOWN", "LEFT", "RIGHT"][i]]),
                        _ => ctx.key(m, dirs[i]),
                    }
                }
            }

            // Pointer: left stick in web apps; right stick in TV apps too.
            let speed = |v: f32| -> f64 {
                let a = v.abs();
                if a < 0.14 {
                    return 0.0;
                }
                let t = ((a - 0.14) / 0.86) as f64;
                v.signum() as f64 * (t * t * 26.0 + t * 3.0)
            };
            if pointer_apps || matches!(m, Mode::Embedded { tv: true } | Mode::Chrome { tv: true }) {
                let (px, py) = if pointer_apps { (stick[0], stick[1]) } else { (rstick[0], rstick[1]) };
                let (dx, dy) = (speed(px), -speed(py));
                if dx != 0.0 || dy != 0.0 {
                    ctx.move_cursor(m, dx, dy);
                }
            }
            // Right stick scrolls web apps.
            if pointer_apps && (rstick[0].abs() > 0.2 || rstick[1].abs() > 0.2) && last_scroll.elapsed() > Duration::from_millis(16) {
                last_scroll = Instant::now();
                ctx.scroll(m, speed(rstick[0]) * 2.0, -speed(rstick[1]) * 2.0);
            }

            thread::sleep(Duration::from_millis(8));
        }
    });
}

/// Developer check of in-app input without a controller:
/// YOUSUFOS_TEST_INPUT=1 drives an open app with a scripted sequence.
pub fn self_test(app: AppHandle) {
    if std::env::var("YOUSUFOS_TEST_INPUT").is_err() {
        return;
    }
    thread::spawn(move || {
        let mut ctx = Ctx {
            app: app.clone(),
            #[cfg(not(target_os = "windows"))]
            enigo: None,
            cursor: (960.0, 540.0),
            cursor_seen: None,
        };
        loop {
            thread::sleep(Duration::from_millis(500));
            let m = mode(&app);
            if !matches!(m, Mode::Embedded { .. } | Mode::Chrome { .. }) {
                continue;
            }
            thread::sleep(Duration::from_secs(4));
            eprintln!("[selftest] mode {m:?}");
            for k in ["ArrowDown", "ArrowDown", "Enter", "f", " "] {
                ctx.key(m, k);
                thread::sleep(Duration::from_millis(300));
            }
            for _ in 0..20 {
                ctx.move_cursor(m, 12.0, 6.0);
                thread::sleep(Duration::from_millis(16));
            }
            ctx.click(m);
            thread::sleep(Duration::from_millis(300));
            ctx.page_eval(m, "window.__yousuf&&__yousuf.toast('selftest ok')");
            ctx.scroll(m, 0.0, 300.0);
            eprintln!("[selftest] done");
            return;
        }
    });
}

/// A button pressed on the phone remote (admin panel): does what the same
/// controller button does in whatever is on screen.
pub fn remote_button(app: &AppHandle, button: &str) -> bool {
    let m = mode(app);
    let mut ctx = Ctx {
        app: app.clone(),
        #[cfg(not(target_os = "windows"))]
        enigo: None,
        cursor: (960.0, 540.0),
        cursor_seen: None,
    };
    let dir = match button {
        "up" => Some(0),
        "down" => Some(1),
        "left" => Some(2),
        "right" => Some(3),
        _ => None,
    };
    if let Some(i) = dir {
        match m {
            Mode::Player => player::command(app, &["keypress", ["UP", "DOWN", "LEFT", "RIGHT"][i]]),
            _ => ctx.key(m, ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"][i]),
        }
        return true;
    }
    match button {
        "ok" => match m {
            Mode::Player => player::command(app, &["keypress", "ENTER"]),
            _ => ctx.key(m, "Enter"),
        },
        "back" => match m {
            Mode::Launcher => ctx.key(m, "Escape"),
            Mode::Player => player::command(app, &["keypress", "ESC"]),
            Mode::Embedded { tv: true } | Mode::Chrome { tv: true } => ctx.key(m, "Escape"),
            _ => ctx.page_eval(m, "window.__yousuf?__yousuf.back():history.back()"),
        },
        "playpause" => match m {
            Mode::Launcher => ctx.key(m, "x"),
            Mode::Player => player::command(app, &["keypress", "SPACE"]),
            Mode::Embedded { tv: true } | Mode::Chrome { tv: true } => ctx.key(m, " "),
            _ => ctx.page_eval(m, "window.__yousuf&&__yousuf.playPause()"),
        },
        "menu" => match m {
            Mode::Launcher => ctx.key(m, "ContextMenu"),
            Mode::Player => player::command(app, &["keypress", "m"]),
            _ => ctx.page_eval(m, "window.__yousuf&&__yousuf.help()"),
        },
        "y" => match m {
            Mode::Launcher => ctx.key(m, "y"),
            Mode::Player => player::command(app, &["keypress", "y"]),
            _ => ctx.key(m, "f"),
        },
        "prev" | "next" => {
            let next = button == "next";
            match m {
                Mode::Launcher => ctx.key(m, if next { "PageDown" } else { "PageUp" }),
                Mode::Player => player::command(app, &["keypress", if next { "PGDWN" } else { "PGUP" }]),
                _ => ctx.page_eval(m, if next { "window.__yousuf&&__yousuf.seek(10)" } else { "window.__yousuf&&__yousuf.seek(-10)" }),
            }
        }
        "volup" => ctx.volume(m, 5),
        "voldown" => ctx.volume(m, -5),
        "home" => crate::go_home(app),
        _ => return false,
    }
    true
}

/// Text typed on the phone: into the text box that has focus.
pub fn remote_text(app: &AppHandle, text: &str) {
    let m = mode(app);
    match m {
        Mode::Launcher | Mode::Player => {
            let _ = app.emit("remote-text", text.to_string());
        }
        _ => {
            let ctx = Ctx {
                app: app.clone(),
                #[cfg(not(target_os = "windows"))]
                enigo: None,
                cursor: (0.0, 0.0),
                cursor_seen: None,
            };
            let js = format!(
                "(()=>{{const a=document.activeElement;if(!a)return;a.focus();if(!document.execCommand('insertText',false,{t})){{const s=Object.getOwnPropertyDescriptor(a.__proto__,'value');if(s&&s.set){{s.set.call(a,(a.value||'')+{t});a.dispatchEvent(new Event('input',{{bubbles:true}}));}}}}}})()",
                t = serde_json::to_string(text).unwrap_or_default()
            );
            ctx.page_eval(m, &js);
        }
    }
}

/// What's on screen, for the admin panel.
pub fn mode_name(app: &AppHandle) -> &'static str {
    match mode(app) {
        Mode::Launcher => "launcher",
        Mode::Embedded { .. } | Mode::Chrome { .. } => "app",
        Mode::Player => "player",
    }
}
