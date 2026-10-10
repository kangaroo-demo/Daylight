import { MAX_YEAR, MIN_YEAR } from "./calendar";

export type PersonalEvent = { id: string; title: string; date: string; time: string | null; notes: string };

export function localEventDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return year >= MIN_YEAR && year <= MAX_YEAR && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function validatePersonalEvent(event: PersonalEvent): string | null {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(event.id)) return "INVALID_EVENT";
  if (!event.title.trim() || [...event.title].length > 100) return "INVALID_TITLE";
  if (!localEventDate(event.date)) return "INVALID_DATE";
  if (event.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)) return "INVALID_TIME";
  if ([...event.notes].length > 2000) return "INVALID_NOTES";
  return null;
}

export function sortPersonalEvents(events: PersonalEvent[]): PersonalEvent[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export function personalEventError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  return ({
    INVALID_TITLE: "请填写日程名称，最多 100 个字。", INVALID_DATE: "请选择有效日期（1900—2100 年）。",
    INVALID_TIME: "请填写有效时间。", INVALID_NOTES: "备注最多 2000 个字。",
    EVENT_NOT_FOUND: "这条日程已被另一窗口删除，请关闭后重新查看。",
    EVENT_EXISTS: "这条日程已经保存，请关闭后重新查看。",
    STORE_CORRUPT: "日程文件暂时无法读取，已有数据已保留。",
  } as Record<string, string>)[code] ?? "暂时无法读写本机日程，请重试。";
}
