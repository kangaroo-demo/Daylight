import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Circle, Info, PanelTopOpen, Plus, Settings2, SlidersHorizontal, X } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  addMonths, coveredYears, dateKey, getCalendarDays, getDayInfo, isoWeekNumber, isSupportedDate,
  MAX_YEAR, MIN_YEAR, sameDate, weekdaysMondayFirst, weekdaysSundayFirst, workStateLabels,
} from "./domain/calendar";
import { readSettings, saveSettings, visibleEvents } from "./domain/settings";
import type { Settings } from "./domain/settings";
import type { PersonalEvent } from "./domain/personal-events";
import { usePersonalEvents } from "./hooks/use-personal-events";
import PersonalEventsDialog from "./components/PersonalEventsDialog";
import type { EventDialogRequest } from "./components/PersonalEventsDialog";

const longDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" });
const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => MIN_YEAR + index);
const isPopover = new URLSearchParams(window.location.search).get("surface") === "popover";
document.documentElement.dataset.surface = isPopover ? "popover" : "main";

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
    const unlisten = isTauri() ? listen("daylight-date-changed", refresh) : null;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(timer); void unlisten?.then((stop) => stop()); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
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
      <div className="dialog-title"><div><h2 id="settings-title">设置</h2><p>仅保存在本机</p></div><button className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={19} /></button></div>
      <div className="settings-tabs" role="tablist" aria-label="设置分类"><button role="tab" id="appearance-tab" aria-selected={tab === "appearance"} aria-controls="appearance-panel" onClick={() => setTab("appearance")}>外观与排列</button><button role="tab" id="content-tab" aria-selected={tab === "content"} aria-controls="content-panel" onClick={() => setTab("content")}>显示内容</button></div>
      {tab === "appearance" && <fieldset role="tabpanel" id="appearance-panel" aria-labelledby="appearance-tab"><legend className="sr-only">外观与排列</legend>
        <div className="setting-select"><span id="theme-label">主题</span><div className="theme-options" role="group" aria-labelledby="theme-label">{([["system", "跟随系统"], ["light", "浅色"], ["dark", "深色"]] as const).map(([value, label]) => <button key={value} aria-label={`${label}主题`} aria-pressed={settings.theme === value} onClick={() => update({ theme: value })}>{label}</button>)}</div></div>
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

export default function App() {
  const today = useToday();
  const [selected, setSelected] = useState(() => new Date());
  const [viewDate, setViewDate] = useState(() => new Date());
  const [settings, setSettings] = useState(readSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [eventDialog, setEventDialog] = useState<EventDialogRequest | null>(null);
  const personal = usePersonalEvents();
  const grid = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const addEventButton = useRef<HTMLButtonElement>(null);

  const updateSettings = useCallback((value: Partial<Settings>) => setSettings((current) => ({ ...current, ...value })), []);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; saveSettings(settings); }, [settings]);
  useEffect(() => {
    if (isTauri()) void invoke("set_calendar_theme", { theme: settings.theme });
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
  const monthAnchor = selected.getFullYear() === viewDate.getFullYear() && selected.getMonth() === viewDate.getMonth() ? selected : viewDate;
  const moveMonth = (count: number, focus = false) => selectDate(addMonths(monthAnchor, count), focus);
  const closeSettings = useCallback(() => { setSettingsOpen(false); requestAnimationFrame(() => settingsButton.current?.focus()); }, []);
  const openEvents = useCallback((date: Date, view: "list" | "create") => {
    if (personal.loading || personal.error) return;
    setFilterOpen(false); setEventDialog({ date: dateKey(date), view });
  }, [personal.loading, personal.error]);
  const closeEvents = useCallback(() => {
    setEventDialog(null);
    requestAnimationFrame(() => (grid.current?.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]') ?? addEventButton.current)?.focus());
  }, []);
  useEffect(() => {
    const shortcuts = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (settingsOpen || eventDialog) return;
        if (filterOpen) { setFilterOpen(false); }
        else if (isPopover && isTauri()) { void invoke("hide_popover"); }
      }
      if (eventDialog) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n" && !settingsOpen) {
        event.preventDefault(); openEvents(selected, "create"); return;
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
  }, [goToday, settingsOpen, filterOpen, eventDialog, openEvents, selected]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, PersonalEvent[]>();
    for (const event of personal.events) {
      const day = grouped.get(event.date);
      if (day) day.push(event); else grouped.set(event.date, [event]);
    }
    return grouped;
  }, [personal.events]);
  const selectedPersonalEvents = eventsByDate.get(dateKey(selected)) ?? [];

  const days = useMemo(() => getCalendarDays(viewDate, settings.weekStartsOn).map(getDayInfo), [viewDate, settings.weekStartsOn]);
  const selectedInfo = useMemo(() => getDayInfo(selected), [selected]);
  const todayInfo = useMemo(() => getDayInfo(today), [today]);
  const todayEvents = visibleEvents(todayInfo.events, settings);
  const events = visibleEvents(selectedInfo.events, settings);
  const contextName = selectedInfo.workState === "makeup" ? `${selectedInfo.officialHolidayName}调休`
    : selectedInfo.workState === "holiday" ? selectedInfo.officialHolidayName : undefined;
  const weekHeaders = settings.weekStartsOn === 1 ? weekdaysMondayFirst : weekdaysSundayFirst;
  const covered = coveredYears.includes(viewDate.getFullYear());
  const selectedLunarDate = selectedInfo.lunarDate.replace(/^.*?年/, "");
  const dayOfYear = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(today.getFullYear(), 0, 0)) / 86400000);
  const weekCount = Math.ceil((days.findIndex((info) => info.date.getDate() === 1 && info.date.getMonth() === viewDate.getMonth()) + new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()) / 7);

  useLayoutEffect(() => {
    const calendar = grid.current;
    if (!calendar) return;
    const headings = calendar.querySelector<HTMLElement>(".weekday-row")!;
    const week = calendar.querySelector<HTMLElement>(".calendar-week")!;
    const fitSquares = () => {
      const style = getComputedStyle(week);
      const columnGap = parseFloat(style.columnGap) || 0;
      const rowGap = parseFloat(style.marginBottom) || 0;
      const availableWidth = (calendar.clientWidth - columnGap * 6) / 7;
      const availableHeight = (calendar.clientHeight - headings.offsetHeight - rowGap * (weekCount - 1)) / weekCount;
      calendar.style.setProperty("--day-size", `${Math.max(1, Math.floor(Math.min(availableWidth, availableHeight)))}px`);
    };
    fitSquares();
    const observer = new ResizeObserver(fitSquares);
    observer.observe(calendar); observer.observe(headings);
    return () => observer.disconnect();
  }, [weekCount, settings.largeText, covered]);

  const gridKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in offsets) {
      event.preventDefault(); const target = new Date(date); target.setDate(target.getDate() + offsets[event.key]); selectDate(target, true);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault(); selectDate(addMonths(date, event.key === "PageUp" ? -1 : 1), true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); const target = new Date(date); const offset = (date.getDay() - settings.weekStartsOn + 7) % 7;
      target.setDate(target.getDate() + (event.key === "Home" ? -offset : 6 - offset)); selectDate(target, true);
    } else if (event.key === "Enter") {
      event.preventDefault(); openEvents(date, "list");
    }
  };

  return <main className={`daylight-app ${isPopover ? "popover-app" : ""} ${settings.largeText ? "large-text" : ""}`}>
    <header className="app-header">
      <div className="today-summary" aria-label="今天">
        <div className="today-tile" aria-hidden="true"><img className="date-icon-light" src={`/icons/dates/light/${today.getDate()}.png`} alt="" /><img className="date-icon-dark" src={`/icons/dates/dark/${today.getDate()}.png`} alt="" /></div>
        <div className="today-meta"><span className="today-weekday">{weekday.format(today)}</span><h1>{today.getFullYear()}年{today.getMonth() + 1}月</h1><p>第{dayOfYear}天，第{isoWeekNumber(today)}周</p></div>
        <div className="today-events"><span className={`today-status ${todayInfo.workState}`}>{workStateLabels[todayInfo.workState]}</span>{todayEvents.map((event) => <span className={event.category === "节气" ? "solar-term" : ""} key={event.category + event.name} title={event.category}>{event.name}</span>)}</div>
      </div>
      <div className="window-actions">
      {isPopover && isTauri() && <button className="icon-button" aria-label="打开独立窗口" title="打开独立窗口" onClick={() => void invoke("open_main_window")}><PanelTopOpen size={17} /></button>}
      <button ref={settingsButton} className="icon-button" aria-label="设置" title="设置（⌘ ,）" onClick={() => { setFilterOpen(false); setSettingsOpen(true); }}><Settings2 size={18} /></button>
      {isPopover && isTauri() && <button className="icon-button" aria-label="收起月历" title="收起月历（Esc）" onClick={() => void invoke("hide_popover")}><X size={17} /></button>}
    </div></header>

    <section className="calendar-section" aria-label="月历">
      <div className="calendar-toolbar">
        <div className="month-controls">
          <label className="sr-only" htmlFor="year-select">年份</label><select id="year-select" value={viewDate.getFullYear()} onChange={(event) => selectDate(addMonths(monthAnchor, (Number(event.target.value) - viewDate.getFullYear()) * 12))}>{years.map((year) => <option key={year} value={year}>{year} 年</option>)}</select>
          <button className="icon-button" aria-label="上个月" disabled={viewDate.getFullYear() === MIN_YEAR && viewDate.getMonth() === 0} onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
          <label className="sr-only" htmlFor="month-select">月份</label><select id="month-select" value={viewDate.getMonth()} onChange={(event) => selectDate(addMonths(monthAnchor, Number(event.target.value) - viewDate.getMonth()))}>{Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{month + 1} 月</option>)}</select>
          <button className="icon-button" aria-label="下个月" disabled={viewDate.getFullYear() === MAX_YEAR && viewDate.getMonth() === 11} onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
        </div>
        <div className="toolbar-end">
          <button ref={addEventButton} className="icon-button" aria-label="添加日程" title="添加日程（⌘ / Ctrl N）" disabled={personal.loading || !!personal.error} onClick={() => openEvents(selected, "create")}><Plus size={18} /></button>
          <div className="filter-container" ref={filter}><button aria-label="显示内容" className={`quiet-button filter-button ${filterOpen ? "active" : ""}`} aria-expanded={filterOpen} aria-controls="display-options" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={14} /><span>显示内容</span></button>
            {filterOpen && <div className="filter-popover" id="display-options"><p>在月历里显示</p>{([
              ["lunar", "农历"], ["chinese", "中国节日"], ["solarTerms", "二十四节气"], ["cultural", "常见文化节日"], ["international", "国际纪念日"],
            ] as const).map(([key, label]) => <Toggle key={key} label={label} checked={settings[key]} onChange={() => updateSettings({ [key]: !settings[key] })} />)}<small>休 / 班不随筛选隐藏</small></div>}
          </div>
          <button className="quiet-button today-button" aria-label="回到今天" title="回到今天（T）" onClick={goToday}>今天</button>
        </div>
      </div>
      {!covered && <div className="coverage-notice" role="status"><Info size={14} /><span>{viewDate.getFullYear()} 年休班安排尚未收录，暂不标记官方休 / 班。</span></div>}
      <div className="calendar-grid" role="grid" aria-label={`${viewDate.getFullYear()} 年 ${viewDate.getMonth() + 1} 月`} ref={grid}>
        <div className="weekday-row" role="row">{weekHeaders.map((day, index) => <span role="columnheader" key={day} className={((index + settings.weekStartsOn) % 7 === 0 || (index + settings.weekStartsOn) % 7 === 6) ? "weekend-heading" : ""}>{day}</span>)}</div>
        {Array.from({ length: weekCount }, (_, row) => <div className="calendar-week" role="row" key={row}>{days.slice(row * 7, row * 7 + 7).map((info) => {
          const inMonth = info.date.getMonth() === viewDate.getMonth();
          const isToday = sameDate(info.date, today); const isSelected = sameDate(info.date, selected);
          const weekend = (info.date.getDay() === 0 || info.date.getDay() === 6) && info.workState !== "makeup";
          const dayEvents = visibleEvents(info.events, settings);
          const label = dayEvents[0]?.name || (settings.lunar ? info.lunarLabel : "");
          const classes = ["day-cell", !inMonth && "outside-month", weekend && "weekend", info.workState === "holiday" && "holiday", info.workState === "makeup" && "makeup", isToday && "is-today", isSelected && "selected"].filter(Boolean).join(" ");
          const personalCount = eventsByDate.get(info.key)?.length ?? 0;
          const accessible = `${longDate.format(info.date)}${settings.lunar ? `，农历${info.lunarDate}` : ""}，${workStateLabels[info.workState]}${dayEvents.length ? "，" + dayEvents.map((item) => item.name).join("，") : ""}${personalCount ? `，${personalCount} 项日程` : ""}`;
          return <div role="gridcell" aria-selected={isSelected} key={info.key}><button className={classes} data-date={info.key} tabIndex={isSelected ? 0 : -1} disabled={!isSupportedDate(info.date)} aria-label={accessible} aria-current={isToday ? "date" : undefined} title="双击添加日程，Enter 查看当天日程" onClick={() => setSelected(info.date)} onDoubleClick={() => openEvents(info.date, "create")} onKeyDown={(event) => gridKeyDown(event, info.date)}>
            {info.workState === "holiday" && <span className="work-marker">休</span>}{info.workState === "makeup" && <span className="work-marker">班</span>}
            {isToday && !isSelected && <span className="today-marker">今</span>}
            <span className="day-content"><span className="day-number">{info.date.getDate()}</span><span className={`day-caption ${dayEvents[0]?.category === "节气" ? "solar-term" : ""}`} title={label}>{label || "\u00a0"}</span></span>
            {dayEvents.length > 1 && <span className="extra-count" aria-hidden="true">+{dayEvents.length - 1}</span>}
            {personalCount > 0 && <Circle className="personal-event-dot" size={3} fill="currentColor" strokeWidth={0} aria-hidden="true" />}
          </button></div>;
        })}</div>)}
      </div>
    </section>

    <footer className="app-footer">
      {personal.error ? <div className="agenda-load-error" role="alert"><span>{personal.error}</span><button className="quiet-button" onClick={() => void personal.refresh()}>重试</button></div> : selectedPersonalEvents.length > 0 ? <section className="day-agenda" aria-label="选中日期日程" aria-live="polite">
        <div className="agenda-heading"><span title={[longDate.format(selected), contextName || workStateLabels[selectedInfo.workState], ...events.map((event) => event.name)].join(" · ")}>{settings.lunar ? `农历 ${selectedLunarDate}` : `${selected.getMonth() + 1} 月 ${selected.getDate()} 日`} · <span className={`date-status ${selectedInfo.workState}`}>{contextName || workStateLabels[selectedInfo.workState]}</span>{events.filter((event) => event.name !== selectedInfo.officialHolidayName || !contextName).map((event) => <span key={event.category + event.name}> · <span className={`detail-event ${event.category === "节气" ? "solar-term" : event.category === "国际纪念日" ? "international-event" : "festival-event"}`}>{event.name}</span></span>)}</span><button className="agenda-count" aria-label={`查看当天 ${selectedPersonalEvents.length} 项日程`} onClick={() => openEvents(selected, "list")}>全部 {selectedPersonalEvents.length} 项<ChevronRight size={12} /></button></div>
        <button className="agenda-preview" aria-label={`编辑日程 ${selectedPersonalEvents[0].title}`} onClick={() => setEventDialog({ date: dateKey(selected), view: "list", event: selectedPersonalEvents[0] })}><time>{selectedPersonalEvents[0].time ?? "全天"}</time><span title={selectedPersonalEvents[0].title}>{selectedPersonalEvents[0].title}</span></button>
      </section> : <section className="date-details" aria-label="选中日期详情" aria-live="polite" aria-atomic="true">
        <div className="detail-calendar">{settings.lunar ? <><h2>农历 {selectedLunarDate}</h2><p>{selectedInfo.lunarCycle}</p></> : <h2>{selected.getMonth() + 1} 月 {selected.getDate()} 日 · {weekday.format(selected)}</h2>}</div>
        <div className="detail-context"><div className="detail-events">{contextName && <span className={`detail-event ${selectedInfo.workState}`}>{contextName}</span>}{events.filter((event) => event.name !== selectedInfo.officialHolidayName || !contextName).map((event) => <span className={`detail-event ${event.category === "节气" ? "solar-term" : event.category === "国际纪念日" ? "international-event" : "festival-event"}`} title={event.category} key={event.category + event.name}>{event.name}</span>)}</div><div className={`date-status ${selectedInfo.workState}`}>{workStateLabels[selectedInfo.workState]}</div></div>
      </section>}
    </footer>
    {settingsOpen && <SettingsDialog settings={settings} update={updateSettings} onClose={closeSettings} />}
    {eventDialog && <PersonalEventsDialog request={eventDialog} events={eventsByDate.get(eventDialog.date) ?? []} save={personal.save} remove={personal.remove} onSavedDate={selectDate} onClose={closeEvents} />}
  </main>;
}
