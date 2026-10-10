import { describe, expect, it } from "vitest";
import { localEventDate, sortPersonalEvents, validatePersonalEvent } from "./personal-events";
import type { PersonalEvent } from "./personal-events";

const event: PersonalEvent = { id: "test-1", title: "午饭", date: "2026-10-10", time: null, notes: "" };

describe("local civil dates", () => {
  it("does not shift an event's day into UTC or accept rolled-over dates", () => {
    const date = localEventDate("2028-02-29")!;
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2028, 2, 29]);
    for (const invalid of ["2026-02-29", "2026-04-31", "2026-2-01", "1899-12-31", "2101-01-01", ""]) expect(localEventDate(invalid)).toBeNull();
  });
});

describe("personal schedules", () => {
  it("validates all-day and timed entries and counts Unicode characters", () => {
    expect(validatePersonalEvent(event)).toBeNull();
    expect(validatePersonalEvent({ ...event, time: "23:59" })).toBeNull();
    expect(validatePersonalEvent({ ...event, time: "24:00" })).toBe("INVALID_TIME");
    expect(validatePersonalEvent({ ...event, title: "   " })).toBe("INVALID_TITLE");
    expect(validatePersonalEvent({ ...event, title: "🍃".repeat(100) })).toBeNull();
    expect(validatePersonalEvent({ ...event, title: "🍃".repeat(101) })).toBe("INVALID_TITLE");
    expect(validatePersonalEvent({ ...event, notes: "字".repeat(2001) })).toBe("INVALID_NOTES");
  });
  it("puts all-day entries first and keeps timed entries chronological without mutating the input", () => {
    const entries = [
      { ...event, id: "late", time: "18:00" },
      { ...event, id: "tomorrow", date: "2026-10-11" },
      { ...event, id: "all-day" },
      { ...event, id: "early", time: "09:00" },
    ];
    expect(sortPersonalEvents(entries).map((entry) => entry.id)).toEqual(["all-day", "early", "late", "tomorrow"]);
    expect(entries[0].id).toBe("late");
  });
});
