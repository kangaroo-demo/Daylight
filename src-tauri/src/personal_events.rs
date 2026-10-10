use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, io::Write, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager, State};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct PersonalEvent {
    pub id: String,
    pub title: String,
    pub date: String,
    pub time: Option<String>,
    pub notes: String,
}

#[derive(Default, Deserialize, Serialize)]
struct EventFile {
    version: u8,
    events: Vec<PersonalEvent>,
}

pub struct PersonalEvents {
    path: PathBuf,
    lock: Mutex<()>,
}

impl PersonalEvents {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    fn read(&self) -> Result<Vec<PersonalEvent>, String> {
        let bytes = match fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(_) => return Err("STORE_UNAVAILABLE".into()),
        };
        let file: EventFile = serde_json::from_slice(&bytes).map_err(|_| "STORE_CORRUPT")?;
        if file.version != 1 {
            return Err("STORE_CORRUPT".into());
        }
        let mut ids = HashSet::new();
        for event in &file.events {
            if validate(event).is_err() || !ids.insert(&event.id) {
                return Err("STORE_CORRUPT".into());
            }
        }
        Ok(file.events)
    }

    fn write(&self, events: Vec<PersonalEvent>) -> Result<Vec<PersonalEvent>, String> {
        let parent = self.path.parent().ok_or("STORE_UNAVAILABLE")?;
        fs::create_dir_all(parent).map_err(|_| "STORE_UNAVAILABLE")?;
        let file = EventFile { version: 1, events };
        let bytes = serde_json::to_vec_pretty(&file).map_err(|_| "STORE_UNAVAILABLE")?;
        let temporary = self.path.with_extension("json.tmp");
        let result = (|| {
            let mut output = fs::File::create(&temporary)?;
            output.write_all(&bytes)?;
            output.sync_all()?;
            drop(output);
            fs::rename(&temporary, &self.path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
            return Err("STORE_UNAVAILABLE".into());
        }
        Ok(sorted(file.events))
    }

    pub fn list(&self) -> Result<Vec<PersonalEvent>, String> {
        let _guard = self.lock.lock().map_err(|_| "STORE_UNAVAILABLE")?;
        self.read().map(sorted)
    }

    fn save(&self, mut event: PersonalEvent, creating: bool) -> Result<Vec<PersonalEvent>, String> {
        event.title = event.title.trim().to_owned();
        validate(&event)?;
        let _guard = self.lock.lock().map_err(|_| "STORE_UNAVAILABLE")?;
        let mut events = self.read()?;
        let existing = events.iter().position(|item| item.id == event.id);
        match (creating, existing) {
            (true, None) => events.push(event),
            (false, Some(index)) => events[index] = event,
            (true, Some(_)) => return Err("EVENT_EXISTS".into()),
            (false, None) => return Err("EVENT_NOT_FOUND".into()),
        }
        self.write(events)
    }

    fn delete(&self, id: &str) -> Result<Vec<PersonalEvent>, String> {
        let _guard = self.lock.lock().map_err(|_| "STORE_UNAVAILABLE")?;
        let mut events = self.read()?;
        let Some(index) = events.iter().position(|event| event.id == id) else {
            return Err("EVENT_NOT_FOUND".into());
        };
        events.remove(index);
        self.write(events)
    }
}

fn validate(event: &PersonalEvent) -> Result<(), String> {
    if event.id.is_empty()
        || event.id.len() > 64
        || !event
            .id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("INVALID_EVENT".into());
    }
    if event.title.trim().is_empty() || event.title.chars().count() > 100 {
        return Err("INVALID_TITLE".into());
    }
    if event.notes.chars().count() > 2000 {
        return Err("INVALID_NOTES".into());
    }
    let date = NaiveDate::parse_from_str(&event.date, "%Y-%m-%d").map_err(|_| "INVALID_DATE")?;
    if event.date.len() != 10
        || date.format("%Y-%m-%d").to_string() != event.date
        || date < NaiveDate::from_ymd_opt(1900, 1, 1).unwrap()
        || date > NaiveDate::from_ymd_opt(2100, 12, 31).unwrap()
    {
        return Err("INVALID_DATE".into());
    }
    if let Some(time) = &event.time {
        let bytes = time.as_bytes();
        if bytes.len() != 5
            || bytes[2] != b':'
            || ![bytes[0], bytes[1], bytes[3], bytes[4]]
                .iter()
                .all(u8::is_ascii_digit)
            || &time[..2] > "23"
            || &time[3..] > "59"
        {
            return Err("INVALID_TIME".into());
        }
    }
    Ok(())
}

fn sorted(mut events: Vec<PersonalEvent>) -> Vec<PersonalEvent> {
    events.sort_by(|a, b| {
        (&a.date, &a.time, &a.title, &a.id).cmp(&(&b.date, &b.time, &b.title, &b.id))
    });
    events
}

fn changed(
    app: &tauri::AppHandle,
    result: Result<Vec<PersonalEvent>, String>,
) -> Result<(), String> {
    result?;
    // Emit an invalidation rather than a full snapshot; each window reloads the latest file.
    // Concurrent window mutations cannot roll a reader back to an older snapshot.
    let _ = app.emit("daylight-personal-events-changed", ());
    Ok(())
}

#[tauri::command]
pub fn list_personal_events(
    state: State<'_, PersonalEvents>,
) -> Result<Vec<PersonalEvent>, String> {
    state.list()
}

#[tauri::command]
pub fn create_personal_event(
    app: tauri::AppHandle,
    state: State<'_, PersonalEvents>,
    event: PersonalEvent,
) -> Result<(), String> {
    changed(&app, state.save(event, true))
}

#[tauri::command]
pub fn update_personal_event(
    app: tauri::AppHandle,
    state: State<'_, PersonalEvents>,
    event: PersonalEvent,
) -> Result<(), String> {
    changed(&app, state.save(event, false))
}

#[tauri::command]
pub fn delete_personal_event(
    app: tauri::AppHandle,
    state: State<'_, PersonalEvents>,
    id: String,
) -> Result<(), String> {
    changed(&app, state.delete(&id))
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    app.manage(PersonalEvents::new(
        app.path().app_data_dir()?.join("personal-events.json"),
    ));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    };

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        root: PathBuf,
        store: Arc<PersonalEvents>,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "daylight-events-{}-{}-{}",
                std::process::id(),
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            Self {
                store: Arc::new(PersonalEvents::new(root.join("events.json"))),
                root,
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
    fn event(id: &str, time: Option<&str>) -> PersonalEvent {
        PersonalEvent {
            id: id.into(),
            title: "本机测试日程".into(),
            date: "2026-10-10".into(),
            time: time.map(str::to_owned),
            notes: "备注".into(),
        }
    }

    #[test]
    fn changes_survive_reopening_and_stale_edits_cannot_restore_deleted_events() {
        let fixture = Fixture::new();
        assert_eq!(fixture.store.list().unwrap(), vec![]);
        let mut item = event("first", Some("10:30"));
        fixture.store.save(item.clone(), true).unwrap();
        let reopened = PersonalEvents::new(fixture.root.join("events.json"));
        assert_eq!(reopened.list().unwrap(), vec![item.clone()]);
        item.title = "修改后".into();
        item.date = "2026-10-11".into();
        item.time = None;
        fixture.store.save(item.clone(), false).unwrap();
        assert_eq!(reopened.list().unwrap(), vec![item.clone()]);
        fixture.store.delete(&item.id).unwrap();
        assert_eq!(reopened.list().unwrap(), vec![]);
        assert_eq!(
            fixture.store.save(item, false).unwrap_err(),
            "EVENT_NOT_FOUND"
        );
    }

    #[test]
    fn mutations_from_two_windows_do_not_lose_unrelated_records() {
        let fixture = Fixture::new();
        let handles: Vec<_> = (0..12)
            .map(|i| {
                let store = Arc::clone(&fixture.store);
                std::thread::spawn(move || {
                    store
                        .save(event(&format!("event-{i}"), None), true)
                        .unwrap()
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        assert_eq!(fixture.store.list().unwrap().len(), 12);
    }

    #[test]
    fn corrupt_or_unknown_files_are_preserved_and_writes_are_rejected() {
        let fixture = Fixture::new();
        fs::create_dir_all(&fixture.root).unwrap();
        for bytes in [
            b"broken".as_slice(),
            br#"{"version":2,"events":[]}"#.as_slice(),
        ] {
            fs::write(&fixture.store.path, bytes).unwrap();
            assert_eq!(
                fixture.store.save(event("new", None), true).unwrap_err(),
                "STORE_CORRUPT"
            );
            assert_eq!(fs::read(&fixture.store.path).unwrap(), bytes);
        }
    }

    #[test]
    fn validation_rejects_invalid_calendar_dates_and_times_without_writing() {
        let fixture = Fixture::new();
        let mut item = event("date", None);
        for date in ["2026-02-29", "2026-2-01", "1899-12-31", "2101-01-01"] {
            item.date = date.into();
            assert_eq!(
                fixture.store.save(item.clone(), true).unwrap_err(),
                "INVALID_DATE"
            );
        }
        item.date = "2028-02-29".into();
        for time in ["24:00", "12:60", "7:30", "ab:cd"] {
            item.time = Some(time.into());
            assert_eq!(
                fixture.store.save(item.clone(), true).unwrap_err(),
                "INVALID_TIME"
            );
        }
        assert!(!fixture.store.path.exists());
        item.time = Some("00:00".into());
        fixture.store.save(item, true).unwrap();
    }

    #[test]
    fn all_day_events_sort_before_timed_events_and_duplicates_are_not_added() {
        let fixture = Fixture::new();
        for item in [
            event("late", Some("18:00")),
            event("early", Some("09:00")),
            event("all-day", None),
        ] {
            fixture.store.save(item, true).unwrap();
        }
        assert_eq!(
            fixture
                .store
                .list()
                .unwrap()
                .iter()
                .map(|e| e.id.as_str())
                .collect::<Vec<_>>(),
            vec!["all-day", "early", "late"]
        );
        assert_eq!(
            fixture
                .store
                .save(event("early", Some("10:00")), true)
                .unwrap_err(),
            "EVENT_EXISTS"
        );
        assert_eq!(fixture.store.list().unwrap().len(), 3);
    }
}
