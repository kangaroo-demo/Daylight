import { invoke, isTauri } from "@tauri-apps/api/core";
import { sortPersonalEvents, validatePersonalEvent } from "../domain/personal-events";
import type { PersonalEvent } from "../domain/personal-events";

export const personalEventsStorageKey = "daylight.events.v1";

function readPreviewEvents(): PersonalEvent[] {
  let raw: string | null;
  try { raw = localStorage.getItem(personalEventsStorageKey); } catch { throw new Error("STORE_UNAVAILABLE"); }
  if (!raw) return [];
  try {
    const file = JSON.parse(raw);
    if (file.version !== 1 || !Array.isArray(file.events)) throw new Error();
    const ids = new Set<string>();
    for (const event of file.events) {
      if (!event || typeof event.id !== "string" || typeof event.title !== "string" || typeof event.date !== "string" || typeof event.notes !== "string" || (event.time !== null && typeof event.time !== "string") || validatePersonalEvent(event) || ids.has(event.id)) throw new Error();
      ids.add(event.id);
    }
    return sortPersonalEvents(file.events);
  } catch { throw new Error("STORE_CORRUPT"); }
}

export async function listPersonalEvents(): Promise<PersonalEvent[]> {
  return isTauri() ? sortPersonalEvents(await invoke<PersonalEvent[]>("list_personal_events")) : readPreviewEvents();
}

async function mutatePreview(mutate: (events: PersonalEvent[]) => PersonalEvent[]): Promise<void> {
  const run = () => {
    const events = mutate(readPreviewEvents());
    try { localStorage.setItem(personalEventsStorageKey, JSON.stringify({ version: 1, events: sortPersonalEvents(events) })); }
    catch { throw new Error("STORE_UNAVAILABLE"); }
    window.dispatchEvent(new Event("daylight-personal-events-changed"));
  };
  if (navigator.locks) await navigator.locks.request("daylight-personal-events", run);
  else run();
}

export async function savePersonalEvent(event: PersonalEvent, creating: boolean): Promise<void> {
  const normalized = { ...event, title: event.title.trim() };
  const error = validatePersonalEvent(normalized);
  if (error) throw new Error(error);
  if (isTauri()) {
    await invoke(creating ? "create_personal_event" : "update_personal_event", { event: normalized });
  } else {
    await mutatePreview((events) => {
      const index = events.findIndex((item) => item.id === event.id);
      if (creating && index >= 0) throw new Error("EVENT_EXISTS");
      if (!creating && index < 0) throw new Error("EVENT_NOT_FOUND");
      if (index < 0) return [...events, normalized];
      return events.map((item, i) => i === index ? normalized : item);
    });
  }
}

export async function deletePersonalEvent(id: string): Promise<void> {
  if (isTauri()) await invoke("delete_personal_event", { id });
  else await mutatePreview((events) => {
    if (!events.some((event) => event.id === id)) throw new Error("EVENT_NOT_FOUND");
    return events.filter((event) => event.id !== id);
  });
}
