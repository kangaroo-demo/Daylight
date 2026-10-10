use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Instant,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, PhysicalSize, Rect, WebviewWindow,
};
mod date_icon;
mod date_icon_assets;
mod personal_events;

#[derive(Default)]
struct PopoverState {
    last_hidden: Mutex<Option<Instant>>,
    large_text: AtomicBool,
    changing_theme: AtomicBool,
    native_theme: Mutex<Option<String>>,
}

#[tauri::command]
fn set_calendar_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    let appearance = match theme.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        "system" => None,
        _ => return Err("Unsupported theme".into()),
    };
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let state = handle.state::<PopoverState>();
        if state.native_theme.lock().unwrap().as_ref() == Some(&theme) {
            return;
        }
        let panel = handle.get_webview_window("popover");
        let restore_panel = panel.as_ref().is_some_and(|window| {
            window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
        });
        // Native appearance changes can transfer focus between the two windows.
        // Apply them together, keeping an open menu-bar settings panel in place.
        state.changing_theme.store(true, Ordering::Relaxed);
        for label in ["main", "popover"] {
            if let Some(window) = handle.get_webview_window(label) {
                if let Err(error) = window.set_theme(appearance) {
                    eprintln!("Unable to set Daylight window theme: {error}");
                }
            }
        }
        if restore_panel {
            if let Some(window) = panel {
                let _ = window.set_focus();
            }
        }
        *state.native_theme.lock().unwrap() = Some(theme);
        state.changing_theme.store(false, Ordering::Relaxed);
        date_icon::refresh(&handle);
    })
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_popover(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("popover") {
        if window.is_visible().unwrap_or(false) {
            *app.state::<PopoverState>().last_hidden.lock().unwrap() = Some(Instant::now());
            let _ = window.hide();
        }
    }
}

#[tauri::command]
fn open_main_window(app: tauri::AppHandle) {
    hide_popover(app.clone());
    show_calendar(&app);
}

fn place_popover(app: &tauri::AppHandle, window: &WebviewWindow, icon_rect: Rect) {
    let icon_position = icon_rect.position.to_physical::<f64>(1.0);
    let monitor = window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .find(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            icon_position.x >= position.x as f64
                && icon_position.x < position.x as f64 + size.width as f64
                && icon_position.y >= position.y as f64
                && icon_position.y < position.y as f64 + size.height as f64
        })
        .or_else(|| window.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let icon_size = icon_rect.size.to_physical::<f64>(scale);
        let area = monitor.work_area();
        let gap = 6.0 * scale;
        let width = (480.0 * scale).min(area.size.width as f64 - gap * 2.0);
        let preferred_height = if app
            .state::<PopoverState>()
            .large_text
            .load(Ordering::Relaxed)
        {
            640.0
        } else {
            560.0
        };
        let height = (preferred_height * scale).min(area.size.height as f64 - gap * 2.0);
        let left = area.position.x as f64;
        let top = area.position.y as f64;
        let right = left + area.size.width as f64;
        let bottom = top + area.size.height as f64;
        let x = (icon_position.x + icon_size.width / 2.0 - width / 2.0)
            .clamp(left + gap, right - width - gap);
        let below = icon_position.y + icon_size.height + gap;
        let y = if below + height <= bottom {
            below
        } else {
            icon_position.y - height - gap
        }
        .clamp(top + gap, bottom - height - gap);
        let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
        let _ = window.set_size(PhysicalSize::new(width as u32, height as u32));
    }
}

#[tauri::command]
fn set_popover_large_text(app: tauri::AppHandle, enabled: bool) {
    app.state::<PopoverState>()
        .large_text
        .store(enabled, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window("popover") {
        if let Some(rect) = app
            .tray_by_id("daylight")
            .and_then(|tray| tray.rect().ok().flatten())
        {
            place_popover(&app, &window, rect);
        }
    }
}

fn toggle_popover(app: &tauri::AppHandle, icon_rect: Rect) {
    let Some(window) = app.get_webview_window("popover") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_popover(app.clone());
        return;
    }
    // The icon can blur the panel before the mouse-up event; do not reopen it after that close.
    if app
        .state::<PopoverState>()
        .last_hidden
        .lock()
        .unwrap()
        .is_some_and(|hidden| hidden.elapsed().as_millis() < 200)
    {
        return;
    }
    place_popover(app, &window, icon_rect);
    let _ = window.show();
    let _ = window.set_focus();
}

fn show_calendar(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_after_focus_leaves(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    std::thread::spawn(move || {
        // Native select menus temporarily take key-window focus within this app.
        std::thread::sleep(std::time::Duration::from_millis(100));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let Some(popover) = handle.get_webview_window("popover") else {
                return;
            };
            if popover.is_focused().unwrap_or(false) {
                return;
            }
            let main_focused = handle
                .get_webview_window("main")
                .is_some_and(|window| window.is_focused().unwrap_or(false));
            let marker = objc2_foundation::MainThreadMarker::new().expect("main thread");
            let app_active = objc2_app_kit::NSApplication::sharedApplication(marker).isActive();
            if main_focused || !app_active {
                hide_popover(handle);
            }
        });
    });
    #[cfg(not(target_os = "macos"))]
    hide_popover(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PopoverState::default())
        .manage(date_icon::DateIconState::default())
        .invoke_handler(tauri::generate_handler![
            hide_popover,
            open_main_window,
            set_popover_large_text,
            set_calendar_theme,
            personal_events::list_personal_events,
            personal_events::create_personal_event,
            personal_events::update_personal_event,
            personal_events::delete_personal_event
        ])
        .setup(|app| {
            personal_events::setup(app.handle())?;
            let show = MenuItem::with_id(app, "show", "打开月历", true, None::<&str>)?;
            let main = MenuItem::with_id(app, "main", "打开独立窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出朝夕", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &main, &quit])?;
            TrayIconBuilder::with_id("daylight")
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray.png"
                ))?)
                .icon_as_template(cfg!(target_os = "macos"))
                .tooltip("朝夕 · Daylight")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(rect) = app
                            .tray_by_id("daylight")
                            .and_then(|tray| tray.rect().ok().flatten())
                        {
                            toggle_popover(app, rect);
                        }
                    }
                    "main" => open_main_window(app.clone()),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        toggle_popover(tray.app_handle(), rect);
                    }
                })
                .build(app)?;
            date_icon::start(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::Focused(true) | tauri::WindowEvent::ThemeChanged(_)
            ) {
                date_icon::refresh(window.app_handle());
            }
            if window.label() == "popover" {
                if matches!(event, tauri::WindowEvent::Focused(false)) {
                    if !window
                        .app_handle()
                        .state::<PopoverState>()
                        .changing_theme
                        .load(Ordering::Relaxed)
                    {
                        hide_after_focus_leaves(window.app_handle().clone());
                    }
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to run 朝夕 · Daylight")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_calendar(_app);
            }
        });
}
