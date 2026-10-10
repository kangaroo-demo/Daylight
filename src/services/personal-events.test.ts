import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletePersonalEvent, listPersonalEvents, personalEventsStorageKey, savePersonalEvent } from "./personal-events";
import type { PersonalEvent } from "../domain/personal-events";

const event: PersonalEvent = { id: "preview-1", title: "  午饭  ", date: "2026-10-10", time: null, notes: "不联网" };
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
});
afterEach(() => vi.unstubAllGlobals());

describe("browser preview persistence", () => {
  it("supports create, reread, edit, and delete and publishes invalidations", async () => {
    const changed = vi.fn();
    window.addEventListener("daylight-personal-events-changed", changed);
    await savePersonalEvent(event, true);
    expect(await listPersonalEvents()).toEqual([{ ...event, title: "午饭" }]);
    await savePersonalEvent({ ...event, date: "2026-10-11", time: "12:30", notes: "修改备注" }, false);
    expect((await listPersonalEvents())[0]).toMatchObject({ date: "2026-10-11", time: "12:30", notes: "修改备注" });
    await deletePersonalEvent(event.id);
    expect(await listPersonalEvents()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(3);
  });
  it("prevents duplicate inserts and stale edits from restoring deleted records", async () => {
    await savePersonalEvent(event, true);
    await expect(savePersonalEvent(event, true)).rejects.toThrow("EVENT_EXISTS");
    await deletePersonalEvent(event.id);
    await expect(savePersonalEvent(event, false)).rejects.toThrow("EVENT_NOT_FOUND");
    expect(await listPersonalEvents()).toEqual([]);
  });
  it("preserves malformed and future-version storage when a write is attempted", async () => {
    for (const raw of ["broken", '{"version":2,"events":[]}', '{"version":1,"events":[{}]}']) {
      values.set(personalEventsStorageKey, raw);
      await expect(savePersonalEvent(event, true)).rejects.toThrow("STORE_CORRUPT");
      expect(values.get(personalEventsStorageKey)).toBe(raw);
    }
  });
});
