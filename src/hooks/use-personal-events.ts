import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { deletePersonalEvent, listPersonalEvents, personalEventsStorageKey, savePersonalEvent } from "../services/personal-events";
import { personalEventError } from "../domain/personal-events";
import type { PersonalEvent } from "../domain/personal-events";

export function usePersonalEvents() {
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    const revision = ++sequence.current;
    try {
      const next = await listPersonalEvents();
      if (active.current && revision === sequence.current) { setEvents(next); setError(""); }
    } catch (failure) {
      if (active.current && revision === sequence.current) setError(personalEventError(failure));
    } finally {
      if (active.current && revision === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const reload = () => { void refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === personalEventsStorageKey || event.key === null) reload(); };
    window.addEventListener("focus", reload);
    window.addEventListener("storage", storage);
    window.addEventListener("daylight-personal-events-changed", reload);
    void (async () => {
      try {
        if (isTauri()) {
          const stop = await listen("daylight-personal-events-changed", reload);
          if (disposed) { stop(); return; }
          unlisten = stop;
        }
        if (!disposed) await refresh();
      } catch (failure) {
        if (!disposed) { setError(personalEventError(failure)); setLoading(false); }
      }
    })();
    return () => {
      disposed = true; active.current = false; ++sequence.current; unlisten?.();
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", storage);
      window.removeEventListener("daylight-personal-events-changed", reload);
    };
  }, [refresh]);

  const save = useCallback(async (event: PersonalEvent, creating: boolean) => {
    await savePersonalEvent(event, creating); await refresh();
  }, [refresh]);
  const remove = useCallback(async (id: string) => { await deletePersonalEvent(id); await refresh(); }, [refresh]);
  return { events, loading, error, refresh, save, remove };
}
