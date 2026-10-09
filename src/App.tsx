import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Info, PanelTopOpen, Settings2, SlidersHorizontal, X } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  addMonths, coveredYears, dateKey, getCalendarDays, getDayInfo, isoWeekNumber, isSupportedDate,
  MAX_YEAR, MIN_YEAR, sameDate, weekdaysMondayFirst, weekdaysSundayFirst, workStateLabels,
} from "./domain/calendar";
import { readSettings, saveSettings, visibleEvents } from "./domain/settings";
import type { Settings } from "./domain/settings";

const longDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" });
const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => MIN_YEAR + index);
const isPopover = new URLSearchParams(window.location.search).get("surface") === "popover";
document.documentElement.dataset.surface = isPopover ? "popover" : "main";

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" onClick={(event) => {
    if (isTauri()) { event.preventDefault(); void openUrl(href).catch(() => window.alert("暂时无法打开浏览器，请复制链接后访问。")); }
  }}>{children}<ExternalLink size={12} aria-hidden="true" /></a>;
}

function useToday() {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = new Date();
      setToday((previous) => sameDate(previous, now) ? previous : now);
      clearTimeout(timer);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, Math.max(1000, midnight.getTime() - now.getTime() + 100));
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return today;
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: () => void }) {
  return <label className="toggle-row">
    <span><span className="toggle-label">{label}</span>{description && <small>{description}</small>}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
  </label>;
}

function SettingsDialog({ settings, update, onClose }: { settings: Settings; update: (value: Partial<Settings>) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"appearance" | "content">("appearance");
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="settings-dialog" aria-labelledby="settings-title" ref={dialog} onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="dialog-content">
      <div className="dialog-title"><div><h2 id="settings-title">让月历更合你的习惯</h2><p>设置只保存在这台电脑。</p></div><button className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={19} /></button></div>
      <div className="settings-tabs" role="tablist" aria-label="设置分类"><button role="tab" id="appearance-tab" aria-selected={tab === "appearance"} aria-controls="appearance-panel" onClick={() => setTab("appearance")}>外观与排列</button><button role="tab" id="content-tab" aria-selected={tab === "content"} aria-controls="content-panel" onClick={() => setTab("content")}>显示内容</button></div>
      {tab === "appearance" && <fieldset role="tabpanel" id="appearance-panel" aria-labelledby="appearance-tab"><legend className="sr-only">外观与排列</legend>
        <label className="setting-select">主题<select aria-label="主题" value={settings.theme} onChange={(event) => update({ theme: event.target.value as Settings["theme"] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <label className="setting-select">每周从<select aria-label="每周起始日" value={settings.weekStartsOn} onChange={(event) => update({ weekStartsOn: Number(event.target.value) as 0 | 1 })}><option value="1">星期一</option><option value="0">星期日</option></select></label>
        <Toggle label="较大字号" checked={settings.largeText} onChange={() => update({ largeText: !settings.largeText })} />
      </fieldset>}
      {tab === "content" && <fieldset role="tabpanel" id="content-panel" aria-labelledby="content-tab"><legend className="sr-only">显示内容</legend>
        <Toggle label="农历" checked={settings.lunar} onChange={() => update({ lunar: !settings.lunar })} />
        <Toggle label="中国节日" description="春节、端午、中秋与常见纪念日" checked={settings.chinese} onChange={() => update({ chinese: !settings.chinese })} />
        <Toggle label="二十四节气" checked={settings.solarTerms} onChange={() => update({ solarTerms: !settings.solarTerms })} />
        <Toggle label="常见文化节日" description="情人节、母亲节、父亲节、万圣夜等" checked={settings.cultural} onChange={() => update({ cultural: !settings.cultural })} />
        <Toggle label="国际纪念日" description="联合国精选纪念日，不代表放假" checked={settings.international} onChange={() => update({ international: !settings.international })} />
      </fieldset>}
      <p className="quiet-note">官方休班标记始终显示。公开节日与节气保持静默。</p>
      <div className="dialog-actions"><button className="primary-button" onClick={onClose}>完成</button></div>
    </div>
  </dialog>;
}

function SourcesDialog({ date, events, onClose }: { date: Date; events: ReturnType<typeof visibleEvents>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const info = getDayInfo(date);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="sources-dialog" aria-labelledby="sources-title" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="dialog-content"><div className="dialog-title"><h2 id="sources-title">日期信息与来源</h2><button className="icon-button" aria-label="关闭来源" onClick={onClose}><X size={19} /></button></div>
      <div className="source-details" id="source-details"><p>官方休班：内置 {coveredYears.join("、")} 年安排。未覆盖年份仅提供历法与节日信息。</p>
        {info.sourceUrl && <SourceLink href={info.sourceUrl}>{date.getFullYear()} 年国务院放假通知</SourceLink>}
        <SourceLink href="https://github.com/NateScarlet/holiday-cn">休班数据：holiday-cn</SourceLink>
        <SourceLink href="https://github.com/6tail/lunar-javascript">农历与节气：lunar-javascript（UTC+8）</SourceLink>
        {events.some((event) => event.category === "国际纪念日") && <SourceLink href="https://www.un.org/en/observances/list-days-weeks">联合国国际纪念日</SourceLink>}
        {date.getMonth() === 2 && date.getDate() === 8 && <p>妇女节为部分公民假期，不计为全体公民放假。</p>}
        {events.some((event) => event.name === "母亲节" || event.name === "父亲节") && <p>母亲节采用五月第二个周日，父亲节采用六月第三个周日。这是常见文化习惯，各地可能不同。</p>}
        <p>设备本地日期用于“今天”；中国农历与节气按中国民用日期显示。</p>
      </div><div className="dialog-actions"><button className="primary-button" onClick={onClose}>完成</button></div>
    </div>
  </dialog>;
}

export default function App() {
  const today = useToday();
  const [selected, setSelected] = useState(() => new Date());
  const [viewDate, setViewDate] = useState(() => new Date());
  const [settings, setSettings] = useState(readSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);

  const updateSettings = useCallback((value: Partial<Settings>) => setSettings((current) => ({ ...current, ...value })), []);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; saveSettings(settings); }, [settings]);
  useEffect(() => {
    if (isTauri()) void getCurrentWindow().setTheme(settings.theme === "system" ? null : settings.theme);
  }, [settings.theme]);
  useEffect(() => {
    if (isTauri()) void invoke("set_popover_large_text", { enabled: settings.largeText });
  }, [settings.largeText]);
  useEffect(() => {
    const sync = () => setSettings(readSettings());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: PointerEvent) => { if (!filter.current?.contains(event.target as Node)) setFilterOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [filterOpen]);

  const selectDate = useCallback((date: Date, focus = false) => {
    if (!isSupportedDate(date)) return;
    setSelected(date); setViewDate(date);
    if (focus) requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${dateKey(date)}"]`)?.focus());
  }, []);
  const goToday = useCallback(() => selectDate(new Date()), [selectDate]);
  const moveMonth = (count: number, focus = false) => selectDate(addMonths(selected, count), focus);
  const closeSettings = useCallback(() => { setSettingsOpen(false); requestAnimationFrame(() => settingsButton.current?.focus()); }, []);
  const closeSources = useCallback(() => { setSourcesOpen(false); requestAnimationFrame(() => sourceButton.current?.focus()); }, []);
  useEffect(() => {
    const shortcuts = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (settingsOpen || sourcesOpen) return;
        if (filterOpen) { setFilterOpen(false); }
        else if (isPopover && isTauri()) { void invoke("hide_popover"); }
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault(); setFilterOpen(false); setSettingsOpen(true); return;
      }
      const target = event.target as HTMLElement;
      if (settingsOpen || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "t") { event.preventDefault(); goToday(); }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [goToday, settingsOpen, filterOpen, sourcesOpen]);

  const days = useMemo(() => getCalendarDays(viewDate, settings.weekStartsOn).map(getDayInfo), [viewDate, settings.weekStartsOn]);
  const selectedInfo = useMemo(() => getDayInfo(selected), [selected]);
  const todayInfo = useMemo(() => getDayInfo(today), [today]);
  const todayEvents = visibleEvents(todayInfo.events, settings);
  const events = visibleEvents(selectedInfo.events, settings);
  const weekHeaders = settings.weekStartsOn === 1 ? weekdaysMondayFirst : weekdaysSundayFirst;
  const covered = coveredYears.includes(viewDate.getFullYear());
  const selectedLunarDate = selectedInfo.lunarDate.replace(/^.*?年/, "");
  const dayOfYear = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(today.getFullYear(), 0, 0)) / 86400000);
  const weekCount = Math.ceil((days.findIndex((info) => info.date.getDate() === 1 && info.date.getMonth() === viewDate.getMonth()) + new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()) / 7);

  const gridKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in offsets) {
      event.preventDefault(); const target = new Date(date); target.setDate(target.getDate() + offsets[event.key]); selectDate(target, true);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault(); selectDate(addMonths(date, event.key === "PageUp" ? -1 : 1), true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); const target = new Date(date); const offset = (date.getDay() - settings.weekStartsOn + 7) % 7;
      target.setDate(target.getDate() + (event.key === "Home" ? -offset : 6 - offset)); selectDate(target, true);
    }
  };

  return <main className={`daylight-app ${isPopover ? "popover-app" : ""} ${settings.largeText ? "large-text" : ""}`}>
    <header className="app-header">
      <div className="today-summary" aria-label="今天">
        <div className="today-tile"><span>{weekday.format(today)}</span><strong>{today.getDate()}</strong></div>
        <div className="today-meta"><h1>{today.getFullYear()}年{today.getMonth() + 1}月</h1><p>第{dayOfYear}天，第{isoWeekNumber(today)}周</p><span>今天</span></div>
        {todayEvents.length > 0 && <div className="today-events">{todayEvents.map((event) => <span key={event.category + event.name} title={event.category}>{event.name}</span>)}</div>}
      </div>
      <div className="window-actions">
      {isPopover && isTauri() && <button className="icon-button" aria-label="打开独立窗口" title="打开独立窗口" onClick={() => void invoke("open_main_window")}><PanelTopOpen size={17} /></button>}
      <button ref={settingsButton} className="icon-button" aria-label="设置" title="设置（⌘ ,）" onClick={() => { setFilterOpen(false); setSettingsOpen(true); }}><Settings2 size={18} /></button>
      {isPopover && isTauri() && <button className="icon-button" aria-label="收起月历" title="收起月历（Esc）" onClick={() => void invoke("hide_popover")}><X size={17} /></button>}
    </div></header>

    <section className="calendar-section" aria-label="月历">
      <div className="calendar-toolbar">
        <div className="month-controls">
          <label className="sr-only" htmlFor="year-select">年份</label><select id="year-select" value={viewDate.getFullYear()} onChange={(event) => selectDate(addMonths(selected, (Number(event.target.value) - selected.getFullYear()) * 12))}>{years.map((year) => <option key={year} value={year}>{year} 年</option>)}</select>
          <label className="sr-only" htmlFor="month-select">月份</label><select id="month-select" value={viewDate.getMonth()} onChange={(event) => selectDate(addMonths(selected, Number(event.target.value) - selected.getMonth()))}>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{month + 1} 月</option>)}</select>
          <div className="month-arrows"><button className="icon-button" aria-label="上个月" disabled={viewDate.getFullYear() === MIN_YEAR && viewDate.getMonth() === 0} onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button><button className="icon-button" aria-label="下个月" disabled={viewDate.getFullYear() === MAX_YEAR && viewDate.getMonth() === 11} onClick={() => moveMonth(1)}><ChevronRight size={18} /></button></div>
        </div>
        <div className="toolbar-end">
          <div className="filter-container" ref={filter}><button aria-label="显示内容" className={`quiet-button filter-button ${filterOpen ? "active" : ""}`} aria-expanded={filterOpen} aria-controls="display-options" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={14} /><span>显示内容</span></button>
            {filterOpen && <div className="filter-popover" id="display-options"><p>在月历里显示</p>{([
              ["lunar", "农历"], ["chinese", "中国节日"], ["solarTerms", "二十四节气"], ["cultural", "常见文化节日"], ["international", "国际纪念日"],
            ] as const).map(([key, label]) => <Toggle key={key} label={label} checked={settings[key]} onChange={() => updateSettings({ [key]: !settings[key] })} />)}<small>休 / 班不随筛选隐藏</small></div>}
          </div>
          <button className="quiet-button today-button" title="回到今天（T）" onClick={goToday}>回到今天</button>
        </div>
      </div>
      {!covered && <div className="coverage-notice" role="status"><Info size={14} /><span>{viewDate.getFullYear()} 年休班安排尚未收录，暂不标记官方休 / 班。</span></div>}
      <div className="calendar-grid" role="grid" aria-label={`${viewDate.getFullYear()} 年 ${viewDate.getMonth() + 1} 月`} ref={grid}>
        <div className="weekday-row" role="row">{weekHeaders.map((day, index) => <span role="columnheader" key={day} className={((index + settings.weekStartsOn) % 7 === 0 || (index + settings.weekStartsOn) % 7 === 6) ? "weekend-heading" : ""}>周{day}</span>)}</div>
        {Array.from({ length: weekCount }, (_, row) => <div className="calendar-week" role="row" key={row}>{days.slice(row * 7, row * 7 + 7).map((info) => {
          const inMonth = info.date.getMonth() === viewDate.getMonth();
          const isToday = sameDate(info.date, today); const isSelected = sameDate(info.date, selected);
          const weekend = (info.date.getDay() === 0 || info.date.getDay() === 6) && info.workState !== "makeup";
          const dayEvents = visibleEvents(info.events, settings);
          const label = dayEvents[0]?.name || (settings.lunar ? info.lunarLabel : "");
          const classes = ["day-cell", !inMonth && "outside-month", weekend && "weekend", info.workState === "holiday" && "holiday", info.workState === "makeup" && "makeup", isToday && "is-today", isSelected && "selected"].filter(Boolean).join(" ");
          const accessible = `${longDate.format(info.date)}${settings.lunar ? `，农历${info.lunarDate}` : ""}，${workStateLabels[info.workState]}${dayEvents.length ? "，" + dayEvents.map((item) => item.name).join("，") : ""}`;
          return <div role="gridcell" aria-selected={isSelected} key={info.key}><button className={classes} data-date={info.key} tabIndex={isSelected ? 0 : -1} disabled={!isSupportedDate(info.date)} aria-label={accessible} aria-current={isToday ? "date" : undefined} onClick={() => selectDate(info.date)} onKeyDown={(event) => gridKeyDown(event, info.date)}>
            {info.workState === "holiday" && <span className="work-marker">休</span>}{info.workState === "makeup" && <span className="work-marker">班</span>}
            {isToday && <span className="today-marker">今</span>}
            <span className="day-number">{info.date.getDate()}</span><span className={`day-caption ${dayEvents[0]?.category === "节气" ? "solar-term" : ""}`} title={label}>{label || "\u00a0"}</span>
            {dayEvents.length > 1 && <span className="extra-count" aria-hidden="true">+{dayEvents.length - 1}</span>}
          </button></div>;
        })}</div>)}
      </div>
    </section>

    <footer className="app-footer">
      <section className="date-details" aria-label="选中日期详情" aria-live="polite" aria-atomic="true">
        <div className="detail-calendar">{settings.lunar ? <><h2>农历 {selectedLunarDate}</h2><p>{selectedInfo.lunarCycle}</p></> : <h2>{selected.getMonth() + 1} 月 {selected.getDate()} 日 · {weekday.format(selected)}</h2>}</div>
        <div className="detail-context"><div className="detail-events">{events.map((event) => <span className={`detail-event ${event.category === "节气" ? "solar-term" : ""}`} title={event.category} key={event.category + event.name}>{event.name}</span>)}</div><div className={`date-status ${selectedInfo.workState}`}>{selectedInfo.workState === "holiday" ? `${selectedInfo.officialHolidayName} · 放假` : selectedInfo.workState === "makeup" ? `${selectedInfo.officialHolidayName} · 调休上班` : workStateLabels[selectedInfo.workState]}</div></div>
      </section>
      <button ref={sourceButton} className="source-button" aria-label="日期信息与来源" title="日期信息与来源" aria-haspopup="dialog" onClick={() => setSourcesOpen(true)}><Info size={15} /></button>
    </footer>
    {settingsOpen && <SettingsDialog settings={settings} update={updateSettings} onClose={closeSettings} />}
    {sourcesOpen && <SourcesDialog date={selected} events={events} onClose={closeSources} />}
  </main>;
}
