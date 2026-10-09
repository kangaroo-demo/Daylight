declare module "lunar-javascript" {
  interface LunarDate {
    getDay(): number;
    getDayInChinese(): string;
    getMonthInChinese(): string;
    getFestivals(): string[];
    getOtherFestivals(): string[];
    getJieQi(): string;
    getYearInGanZhi(): string;
    getYearShengXiao(): string;
    getMonthInGanZhi(): string;
    getDayInGanZhi(): string;
    toString(): string;
  }
  interface SolarDate {
    getLunar(): LunarDate;
  }
  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarDate;
  };
}
