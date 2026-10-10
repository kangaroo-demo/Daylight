use chrono::{Datelike, Local, NaiveDate};
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, Theme};

use crate::date_icon_assets as assets;

#[derive(Default)]
pub struct DateIconState(Mutex<Option<(NaiveDate, bool)>>);

fn artwork(date: NaiveDate, dark: bool) -> &'static [u8] {
    let index = date.day0() as usize;
    if dark {
        assets::DARK[index]
    } else {
        assets::LIGHT[index]
    }
}

#[cfg(any(target_os = "macos", test))]
fn tray_artwork(date: NaiveDate) -> &'static [u8] {
    assets::TRAY[date.day0() as usize]
}

fn apply(app: &AppHandle, date: NaiveDate, dark: bool) -> tauri::Result<()> {
    let bytes = artwork(date, dark);
    #[cfg(target_os = "macos")]
    let tray_bytes = tray_artwork(date);
    #[cfg(not(target_os = "macos"))]
    let tray_bytes = bytes;
    if let Some(tray) = app.tray_by_id("daylight") {
        tray.set_icon_with_as_template(
            Some(tauri::image::Image::from_bytes(tray_bytes)?),
            cfg!(target_os = "macos"),
        )?;
        #[cfg(target_os = "macos")]
        tray.set_title(None::<&str>)?;
        tray.set_tooltip(Some(format!(
            "朝夕 · Daylight · {}",
            date.format("%Y-%m-%d")
        )))?;
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("main") {
        window.set_icon(tauri::image::Image::from_bytes(bytes)?)?;
    }
    #[cfg(target_os = "macos")]
    {
        use objc2::AnyThread;
        use objc2_app_kit::{NSApplication, NSImage};
        use objc2_foundation::{MainThreadMarker, NSData};
        // All callers dispatch here on the UI thread, as required by AppKit.
        let marker = MainThreadMarker::new().expect("icon refresh runs on main thread");
        let data = NSData::from_vec(bytes.to_vec());
        if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
            unsafe {
                NSApplication::sharedApplication(marker).setApplicationIconImage(Some(&image));
            }
        }
    }
    Ok(())
}

pub fn refresh(app: &AppHandle) {
    let date = Local::now().date_naive();
    let dark = app
        .get_webview_window("main")
        .and_then(|window| window.theme().ok())
        == Some(Theme::Dark);
    let state = app.state::<DateIconState>();
    let mut previous = state.0.lock().unwrap();
    if *previous == Some((date, dark)) {
        return;
    }
    match apply(app, date, dark) {
        Ok(()) => {
            let day_changed = previous.is_none_or(|(last_date, _)| last_date != date);
            *previous = Some((date, dark));
            if day_changed {
                let _ = app.emit("daylight-date-changed", ());
            }
        }
        Err(error) => eprintln!("Unable to refresh Daylight date icon: {error}"),
    }
}

pub fn start(app: &AppHandle) {
    refresh(app);
    let app = app.clone();
    // Native polling continues while both windows are hidden. After sleep, date or
    // timezone changes are picked up within 30 seconds; opening also refreshes.
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(30));
        let handle = app.clone();
        if app.run_on_main_thread(move || refresh(&handle)).is_err() {
            break;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_day_has_readable_light_and_dark_artwork() {
        for day in 1..=31 {
            let date = NaiveDate::from_ymd_opt(2026, 10, day).unwrap();
            let tray = tauri::image::Image::from_bytes(tray_artwork(date)).unwrap();
            assert_eq!((tray.width(), tray.height()), (84, 72));
            assert!(
                tray.rgba()
                    .chunks_exact(4)
                    .all(|pixel| pixel[3] == 0 || pixel[..3] == [0, 0, 0]),
                "menu-bar artwork must be a monochrome template"
            );
            for dark in [false, true] {
                let icon = tauri::image::Image::from_bytes(artwork(date, dark)).unwrap();
                assert_eq!((icon.width(), icon.height()), (512, 512));
                assert!(icon.rgba().chunks_exact(4).any(|pixel| pixel[3] == 0));
                assert!(icon.rgba().chunks_exact(4).any(|pixel| pixel[3] == 255));
                let dash = &icon.rgba()[(174 * 512 + 256) * 4..][..4];
                assert_eq!(
                    dash[3], 255,
                    "the brand dash must not become a transparent hole"
                );
                if dark {
                    assert!(dash[..3].iter().all(|channel| *channel > 220));
                } else {
                    assert!(dash[..3].iter().all(|channel| *channel < 80));
                }
            }
        }
    }

    #[test]
    fn date_rollovers_select_the_new_day_and_keep_theme() {
        for (year, month, day, next_day) in [
            (2026, 1, 31, 1),
            (2028, 2, 28, 29),
            (2028, 2, 29, 1),
            (2026, 12, 31, 1),
        ] {
            let before = NaiveDate::from_ymd_opt(year, month, day).unwrap();
            let after = before.succ_opt().unwrap();
            assert_eq!(artwork(after, false), assets::LIGHT[next_day - 1]);
            assert_eq!(artwork(after, true), assets::DARK[next_day - 1]);
            assert_ne!(artwork(before, false), artwork(after, false));
            assert_eq!(tray_artwork(after), assets::TRAY[next_day - 1]);
            assert_ne!(tray_artwork(before), tray_artwork(after));
        }
    }
}
