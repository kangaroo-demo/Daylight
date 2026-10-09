import { describe, expect, it } from "vitest";
import { addMonths, dateKey, getCalendarDays, getDayInfo, isoWeekNumber } from "./calendar";
import { defaultSettings, visibleEvents } from "./settings";

const date = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

// Independent transcription of the two State Council notices; do not derive these fixtures from holiday-cn.
const officialPlans = [
  {
    year: 2025,
    rest: [["01-01", "01-01"], ["01-28", "02-04"], ["04-04", "04-06"], ["05-01", "05-05"], ["05-31", "06-02"], ["10-01", "10-08"]],
    work: ["01-26", "02-08", "04-27", "09-28", "10-11"],
  },
  {
    year: 2026,
    rest: [["01-01", "01-03"], ["02-15", "02-23"], ["04-04", "04-06"], ["05-01", "05-05"], ["06-19", "06-21"], ["09-25", "09-27"], ["10-01", "10-07"]],
    work: ["01-04", "02-14", "02-28", "05-09", "09-20", "10-10"],
  },
];

describe("Chinese official rest and makeup work", () => {
  for (const plan of officialPlans) {
    it(`checks every day in ${plan.year} against the State Council notice`, () => {
      for (let current = new Date(plan.year, 0, 1, 12); current.getFullYear() === plan.year; current.setDate(current.getDate() + 1)) {
        const md = dateKey(current).slice(5);
        const expected = plan.work.includes(md) ? "makeup"
          : plan.rest.some(([start, end]) => md >= start && md <= end) ? "holiday"
          : [0, 6].includes(current.getDay()) ? "weekend" : "workday";
        expect(getDayInfo(current).workState, dateKey(current)).toBe(expected);
      }
    });
  }
  it("does not turn festivals or unknown-year weekends into official holidays", () => {
    expect(getDayInfo(date("2026-10-09")).workState).toBe("workday");
    expect(getDayInfo(date("2026-03-08")).workState).toBe("weekend");
    expect(getDayInfo(date("2027-10-01")).workState).toBe("unverified");
    expect(getDayInfo(date("2027-01-03")).coveredYear).toBe(false);
  });
});

describe("month navigation and week alignment", () => {
  it("keeps six complete rows and honors the selected week start", () => {
    expect(getCalendarDays(date("2026-10-09"))).toHaveLength(42);
    expect(dateKey(getCalendarDays(date("2026-10-09"))[0])).toBe("2026-09-28");
    expect(dateKey(getCalendarDays(date("2026-10-09"), 0)[0])).toBe("2026-09-27");
  });
  it("clamps month ends, handles leap years and crosses December", () => {
    expect(dateKey(addMonths(date("2024-01-31"), 1))).toBe("2024-02-29");
    expect(dateKey(addMonths(date("2026-01-31"), 1))).toBe("2026-02-28");
    expect(dateKey(addMonths(date("2026-12-09"), 1))).toBe("2027-01-09");
    expect(isoWeekNumber(date("2026-10-09"))).toBe(41);
  });
});

describe("lunar calendar and solar terms (Hong Kong Observatory date tables)", () => {
  it("handles a 29-day New Year's Eve and the lunar new year", () => {
    const eve = getDayInfo(date("2026-02-16"));
    expect(eve.lunarDate).toBe("二〇二五年腊月廿九");
    expect(getDayInfo(date("2026-10-09")).lunarCycle).toBe("丙午［马］年 戊戌月 丙辰日");
    expect(eve.events.map((event) => event.name)).toContain("除夕");
    expect(getDayInfo(date("2026-02-17")).lunarLabel).toBe("正月");
    expect(getDayInfo(date("2026-02-17")).events.map((event) => event.name)).toContain("春节");
  });
  it("displays the leap month without repeating ordinary-month festivals", () => {
    expect(getDayInfo(date("2025-07-25")).lunarLabel).toBe("闰六月");
    expect(getDayInfo(date("2025-07-25")).lunarDate).toBe("二〇二五年闰六月初一");
    expect(getDayInfo(date("2025-07-25")).events.some((event) => event.name === "春节")).toBe(false);
  });
  it("matches all 24 solar-term dates in the 2026 HKO table", () => {
    const terms: Record<string, string> = {
      "01-05": "小寒", "01-20": "大寒", "02-04": "立春", "02-18": "雨水", "03-05": "惊蛰", "03-20": "春分",
      "04-05": "清明", "04-20": "谷雨", "05-05": "立夏", "05-21": "小满", "06-05": "芒种", "06-21": "夏至",
      "07-07": "小暑", "07-23": "大暑", "08-07": "立秋", "08-23": "处暑", "09-07": "白露", "09-23": "秋分",
      "10-08": "寒露", "10-23": "霜降", "11-07": "立冬", "11-22": "小雪", "12-07": "大雪", "12-22": "冬至",
    };
    for (let current = new Date(2026, 0, 1, 12); current.getFullYear() === 2026; current.setDate(current.getDate() + 1)) {
      const actual = getDayInfo(current).events.find((event) => event.category === "节气")?.name;
      expect(actual, dateKey(current)).toBe(terms[dateKey(current).slice(5)]);
    }
  });
});

describe("international dates and display layers", () => {
  it("calculates floating cultural dates", () => {
    expect(getDayInfo(date("2026-05-10")).events.map((event) => event.name)).toContain("母亲节");
    expect(getDayInfo(date("2026-06-21")).events.map((event) => event.name)).toContain("父亲节");
  });
  it("labels National Day explicitly in the lunar-calendar data", () => {
    expect(getDayInfo(date("2026-10-01")).events.map((event) => event.name)).toContain("国庆节");
  });
  it("lets users enable UN observances without changing the rest state", () => {
    const info = getDayInfo(date("2026-10-09"));
    expect(visibleEvents(info.events, defaultSettings).map((event) => event.name)).not.toContain("世界邮政日");
    expect(visibleEvents(info.events, { ...defaultSettings, international: true }).map((event) => event.name)).toContain("世界邮政日");
    expect(info.workState).toBe("workday");
  });
  it("filters content without hiding the underlying official day state", () => {
    const info = getDayInfo(date("2026-10-01"));
    expect(visibleEvents(info.events, { ...defaultSettings, chinese: false })).toEqual([]);
    expect(info.workState).toBe("holiday");
  });
});
