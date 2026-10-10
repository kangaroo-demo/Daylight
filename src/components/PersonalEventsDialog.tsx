import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { localEventDate, personalEventError } from "../domain/personal-events";
import type { PersonalEvent } from "../domain/personal-events";

export type EventDialogRequest = { date: string; view: "list" | "create"; event?: PersonalEvent };
type Props = {
  request: EventDialogRequest;
  events: PersonalEvent[];
  save: (event: PersonalEvent, creating: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  onSavedDate: (date: Date) => void;
  onClose: () => void;
};
const dayLabel = (date: string) => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(localEventDate(date)!);
const emptyDraft = (date: string): PersonalEvent => ({ id: crypto.randomUUID(), title: "", date, time: null, notes: "" });
const pageSize = 5;

export default function PersonalEventsDialog({ request, events, save, remove, onSavedDate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<PersonalEvent | null>(() => request.event ?? (request.view === "create" ? emptyDraft(request.date) : null));
  const [creating, setCreating] = useState(!request.event);
  const [time, setTime] = useState(request.event?.time ?? "09:00");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pages = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (draft) titleInput.current?.focus(); }, [!!draft]);
  const change = (value: Partial<PersonalEvent>) => { setDraft((current) => current ? { ...current, ...value } : current); setError(""); setConfirmDelete(false); };
  const edit = (event?: PersonalEvent) => { setCreating(!event); setDraft(event ?? emptyDraft(request.date)); setTime(event?.time ?? "09:00"); setError(""); setConfirmDelete(false); };
  const cancel = () => { if (request.view === "list") { setDraft(null); setError(""); setConfirmDelete(false); } else onClose(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError("");
    try { await save(draft, creating); onSavedDate(localEventDate(draft.date)!); onClose(); }
    catch (failure) { setError(personalEventError(failure)); }
    finally { setBusy(false); }
  };
  const deleteEvent = async () => {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try { await remove(draft.id); onClose(); }
    catch (failure) { setError(personalEventError(failure)); }
    finally { setBusy(false); }
  };

  return <dialog className="events-dialog" aria-labelledby="events-dialog-title" ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === dialog.current && !busy) onClose(); }}>
    <div className="dialog-content">
      <div className="dialog-title"><div><h2 id="events-dialog-title">{draft ? (creating ? "添加日程" : "编辑日程") : "当天日程"}</h2><p>{draft ? "仅保存在本机" : dayLabel(request.date)}</p></div><button className="icon-button" aria-label="关闭日程" disabled={busy} onClick={onClose}><X size={19} /></button></div>
      {draft ? <form className="event-form" onSubmit={(event) => void submit(event)}>
        <label className="event-field">日程名称<input ref={titleInput} aria-label="日程名称" placeholder="例如：和朋友吃饭" value={draft.title} maxLength={200} autoComplete="off" required disabled={busy} onChange={(event) => change({ title: event.target.value })} /></label>
        <div className="event-form-row">
          <label className="event-field">日期<input type="date" aria-label="日程日期" min="1900-01-01" max="2100-12-31" required value={draft.date} disabled={busy} onChange={(event) => change({ date: event.target.value })} /></label>
          <div className="event-field"><label className="event-time-heading"><span>时间</span><span className="all-day-toggle"><input type="checkbox" aria-label="全天日程" checked={draft.time === null} disabled={busy} onChange={(event) => change({ time: event.target.checked ? null : time })} />全天</span></label><input type="time" aria-label="日程时间" value={time} required={draft.time !== null} disabled={busy || draft.time === null} onChange={(event) => { setTime(event.target.value); change({ time: event.target.value }); }} /></div>
        </div>
        <label className="event-field">备注<span className="optional-label">可选</span><textarea aria-label="日程备注" placeholder="写一点需要记住的事" value={draft.notes} maxLength={4000} rows={3} disabled={busy} onChange={(event) => change({ notes: event.target.value })} /></label>
        {error && <p className="event-error" role="alert">{error}</p>}
        {confirmDelete && <p className="delete-question" role="alert">删除这条日程？</p>}
        <div className="dialog-actions event-actions">
          {!creating && !confirmDelete && <button type="button" className="quiet-button delete-button" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} />删除</button>}
          <div className="event-action-end"><button type="button" className="quiet-button" disabled={busy} onClick={() => confirmDelete ? setConfirmDelete(false) : cancel()}>{confirmDelete ? "保留" : "取消"}</button>{confirmDelete ? <button type="button" className="primary-button danger-button" disabled={busy} onClick={() => void deleteEvent()}>删除日程</button> : <button type="submit" className="primary-button" disabled={busy}>{busy ? "保存中…" : "保存"}</button>}</div>
        </div>
      </form> : <>
        {events.length ? <ul className="event-list">{events.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((event) => <li key={event.id}><button className="event-list-row" aria-label={`编辑日程 ${event.title}`} onClick={() => edit(event)}><time>{event.time ?? "全天"}</time><span className="event-list-title" title={event.title}>{event.title}</span><ChevronRight size={15} /></button></li>)}</ul> : <p className="agenda-empty">这一天还没有日程</p>}
        <div className="dialog-actions event-list-actions"><div className="event-pagination">{pages > 1 ? <><button className="icon-button" aria-label="上一页日程" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {pages}</span><button className="icon-button" aria-label="下一页日程" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></> : <span>{events.length} 项日程</span>}</div><button className="primary-button add-list-event" onClick={() => edit()}><Plus size={14} />添加日程</button></div>
      </>}
    </div>
  </dialog>;
}
