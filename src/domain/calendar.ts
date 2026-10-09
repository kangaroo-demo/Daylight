import { Solar } from "lunar-javascript";
import holiday2025 from "../data/holidays-2025.json";
import holiday2026 from "../data/holidays-2026.json";

export type HolidayRecord = {
  name: string;
  date: string;
  isOffDay: boolean;
};

type HolidayDataset = {
  year: number;
  papers: string[];
  days: HolidayRecord[];
};

export type WorkState = "holiday" | "makeup" | "weekend" | "workday" | "unverified";
export type CalendarEvent = {
  name: string;
  category: "中国节日" | "节气" | "国际纪念日" | "文化节日";
  source?: string;
};

export type DayInfo = {
  date: Date;
  key: string;
  lunarDate: string;
  lunarLabel: string;
  lunarCycle: string;
  events: CalendarEvent[];
  workState: WorkState;
  officialHolidayName?: string;
  sourceUrl?: string;
  coveredYear: boolean;
};

const datasets: Record<number, HolidayDataset> = {
  2025: holiday2025 as HolidayDataset,
  2026: holiday2026 as HolidayDataset,
};

const unitedNationsSource = "https://www.un.org/en/observances/list-days-weeks";
const lunarSource = "https://github.com/6tail/lunar-javascript";
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
export const coveredYears = Object.keys(datasets).map(Number);
const commonLunarFestivals = new Set([
  "春节", "元宵节", "龙头节", "端午节", "七夕节", "中元节", "中秋节", "重阳节", "腊八节", "除夕",
]);
const chineseSolarFestivals: Record<string, string> = {
  "1-1": "元旦", "3-8": "妇女节", "3-12": "植树节", "5-1": "劳动节", "5-4": "青年节",
  "6-1": "儿童节", "7-1": "建党纪念日", "8-1": "建军节", "9-10": "教师节", "10-1": "国庆节",
};

export function isSupportedDate(date: Date): boolean {
  return Number.isFinite(date.getTime()) && date.getFullYear() >= MIN_YEAR && date.getFullYear() <= MAX_YEAR;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function dateKey(date: Date): string {
  return String(date.getFullYear()) + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

export function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addMonths(date: Date, count: number): Date {
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + count, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(date.getDate(), lastDay), 12);
}

export function getCalendarDays(viewDate: Date, weekStartsOn = 1): Date[] {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1, 12);
  const offset = (firstDay.getDay() - weekStartsOn + 7) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

export function isoWeekNumber(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (occurrence - 1) * 7;
}

function getInternationalEvents(date: Date): CalendarEvent[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const events: CalendarEvent[] = [];
  const add = (condition: boolean, name: string, category: CalendarEvent["category"], source?: string) => {
    if (condition) events.push({ name, category, source });
  };

  add(month === 2 && day === 14, "情人节", "文化节日");
  add(month === 3 && day === 8, "国际妇女节", "国际纪念日", unitedNationsSource);
  add(month === 4 && day === 1, "愚人节", "文化节日");
  add(month === 4 && day === 22, "世界地球日", "国际纪念日", unitedNationsSource);
  add(month === 4 && day === 23, "世界读书与版权日", "国际纪念日", unitedNationsSource);
  add(month === 5 && day === nthWeekdayOfMonth(year, 5, 0, 2), "母亲节", "文化节日");
  add(month === 6 && day === 5, "世界环境日", "国际纪念日", unitedNationsSource);
  add(month === 6 && day === nthWeekdayOfMonth(year, 6, 0, 3), "父亲节", "文化节日");
  add(month === 9 && day === 21, "国际和平日", "国际纪念日", unitedNationsSource);
  add(month === 10 && day === 9, "世界邮政日", "国际纪念日", unitedNationsSource);
  add(month === 10 && day === 31, "万圣夜", "文化节日");
  add(month === 12 && day === 25, "圣诞节", "文化节日");
  return events;
}

function getLunarParts(date: Date): { lunarDate: string; lunarLabel: string; lunarCycle: string; events: CalendarEvent[] } {
  const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const lunar = solar.getLunar();
  const lunarDay = lunar.getDayInChinese();
  const lunarLabel = lunar.getDay() === 1 ? lunar.getMonthInChinese() + "月" : lunarDay;
  const lunarEvents: CalendarEvent[] = [...lunar.getFestivals(), ...lunar.getOtherFestivals()]
    .filter((name) => commonLunarFestivals.has(name))
    .map((name) => ({ name, category: "中国节日", source: lunarSource }));
  const solarName = chineseSolarFestivals[(date.getMonth() + 1) + "-" + date.getDate()];
  const solarEvents: CalendarEvent[] = solarName ? [{ name: solarName, category: "中国节日" }] : [];
  const jieQi = lunar.getJieQi();
  if (jieQi) lunarEvents.unshift({ name: jieQi, category: "节气", source: lunarSource });
  if (jieQi === "清明") lunarEvents.push({ name: "清明节", category: "中国节日", source: lunarSource });

  const unique = new Map<string, CalendarEvent>();
  [...lunarEvents, ...solarEvents].forEach((event) => unique.set(event.category + ":" + event.name, event));
  return {
    lunarDate: lunar.toString(),
    lunarLabel,
    lunarCycle: `${lunar.getYearInGanZhi()}［${lunar.getYearShengXiao()}］年 ${lunar.getMonthInGanZhi()}月 ${lunar.getDayInGanZhi()}日`,
    events: [...unique.values()],
  };
}

function getOfficialRecord(date: Date): { record?: HolidayRecord; coveredYear: boolean; sourceUrl?: string } {
  const dataset = datasets[date.getFullYear()];
  if (!dataset) return { coveredYear: false };
  return {
    record: dataset.days.find((day) => day.date === dateKey(date)),
    coveredYear: true,
    sourceUrl: dataset.papers[0],
  };
}

export function getDayInfo(date: Date): DayInfo {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const key = dateKey(normalized);
  const lunar = getLunarParts(normalized);
  const official = getOfficialRecord(normalized);
  const weekend = normalized.getDay() === 0 || normalized.getDay() === 6;
  const workState: WorkState = official.record
    ? (official.record.isOffDay ? "holiday" : "makeup")
    : official.coveredYear
      ? (weekend ? "weekend" : "workday")
      : "unverified";

  return {
    date: normalized,
    key,
    lunarDate: lunar.lunarDate,
    lunarLabel: lunar.lunarLabel,
    lunarCycle: lunar.lunarCycle,
    events: [...lunar.events, ...getInternationalEvents(normalized)],
    workState,
    officialHolidayName: official.record?.name,
    sourceUrl: official.sourceUrl,
    coveredYear: official.coveredYear,
  };
}

export const workStateLabels: Record<WorkState, string> = {
  holiday: "放假",
  makeup: "调休上班",
  weekend: "普通周末",
  workday: "工作日",
  unverified: "年度安排待核验",
};

export const weekdaysMondayFirst = ["一", "二", "三", "四", "五", "六", "日"];
export const weekdaysSundayFirst = ["日", "一", "二", "三", "四", "五", "六"];
