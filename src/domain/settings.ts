import type { CalendarEvent } from "./calendar";

export type Settings = {
  theme: "system" | "light" | "dark";
  largeText: boolean;
  weekStartsOn: 0 | 1;
  lunar: boolean;
  chinese: boolean;
  solarTerms: boolean;
  cultural: boolean;
  international: boolean;
};

export const defaultSettings: Settings = {
  theme: "system", largeText: false, weekStartsOn: 1, lunar: true, chinese: true,
  solarTerms: true, cultural: true, international: false,
};
const storageKey = "daylight.settings.v1";

export function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    const result = { ...defaultSettings };
    for (const key of ["largeText", "lunar", "chinese", "solarTerms", "cultural", "international"] as const) {
      if (typeof saved?.[key] === "boolean") result[key] = saved[key];
    }
    if (["system", "light", "dark"].includes(saved?.theme)) result.theme = saved.theme;
    if (saved?.weekStartsOn === 0 || saved?.weekStartsOn === 1) result.weekStartsOn = saved.weekStartsOn;
    return result;
  } catch { return { ...defaultSettings }; }
}

export function saveSettings(settings: Settings): void {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Memory-only settings still work. */ }
}

export function visibleEvents(events: CalendarEvent[], settings: Settings): CalendarEvent[] {
  const enabled: Record<CalendarEvent["category"], boolean> = {
    "中国节日": settings.chinese, "节气": settings.solarTerms,
    "文化节日": settings.cultural, "国际纪念日": settings.international,
  };
  return events.filter((event) => enabled[event.category]);
}
