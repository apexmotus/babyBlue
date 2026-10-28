"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PRAC_COLORS, useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { addDaysKey, atTime, dayKey, dayStart, fmtDayMonth, fmtMonthYear, fmtTime, fmtWeekday, hhmm, minutesOfDay, startOfWeekKey, todayKey, weekdayIndex } from "@/lib/format";
import { loadEvents, loadPractitioners, type Ev, isBabyBlue } from "@/lib/os-data";
import { friendlyError, mutate, query } from "@/local/db";
import { useNow, useQuery } from "@/local/hooks";

type View = "day" | "week" | "month";
const HH = 58; // px per hour
const SNAP = 15;
const mid = (k: string) => new Date(dayStart(k).getTime() + 3600_000);

interface Rule { practitioner_id: string; weekday: number; s: string; e: string }
interface Off { practitioner_id: string; a: Date; b: Date; reason: string | null }

export default function CalendarPage() {
  const os = useOs();
  const toast = useToast();
  const pid = os.practice?.id ?? "";
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(todayKey());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCancelled, setShowCancelled] = useState(false);
  const now = useNow(60_000);

  const pracs = useQuery(() => loadPractitioners(os.uid, pid), [pid, os.uid], { enabled: !!pid });
  const rules = useQuery(() => query<Rule>(os.uid, "select practitioner_id, weekday, start_time::text s, end_time::text e from public.availability_rules where practice_id = $1", [pid]), [pid, os.uid], { enabled: !!pid });

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDaysKey(startOfWeekKey(anchor), i));
    const first = `${anchor.slice(0, 8)}01`;
    return Array.from({ length: 42 }, (_, i) => addDaysKey(startOfWeekKey(first), i));
  }, [view, anchor]);
  const from = dayStart(days[0]);
  const to = dayStart(addDaysKey(days[days.length - 1], 1));

  const events = useQuery(() => loadEvents(os.uid, pid, from, to, showCancelled), [pid, os.uid, days[0], days[days.length - 1], showCancelled], { enabled: !!pid, poll: 20000 });
  const timeoff = useQuery(() => query<Off>(os.uid, "select practitioner_id, lower(during) a, upper(during) b, reason from public.time_off where practice_id = $1 and during && tstzrange($2, $3)", [pid, from, to]), [pid, os.uid, days[0], days[days.length - 1]], { enabled: !!pid });

  const colorIdx = useMemo(() => new Map((pracs.data ?? []).map((p, i) => [p.id, i])), [pracs.data]);
  const color = (id: string) => PRAC_COLORS[(colorIdx.get(id) ?? 0) % PRAC_COLORS.length];
  const visible = useMemo(() => (events.data ?? []).filter((e) => !hidden.has(e.practitioner_id)), [events.data, hidden]);
  const shownPracs = (pracs.data ?? []).filter((p) => !hidden.has(p.id));
  // Day view is a resource view: one column per practitioner. Week view: one column per day.
  const cols = view === "day" ? shownPracs.map((p) => ({ key: p.id, day: anchor, prac: p as { id: string; display_name: string } | null })) : days.map((k) => ({ key: k, day: k, prac: null as { id: string; display_name: string } | null }));

  // Visible hour window from published hours and events.
  const [h0, h1] = useMemo(() => {
    const rs = (rules.data ?? []).filter((r) => !hidden.has(r.practitioner_id));
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    let lo = rs.length ? Math.min(...rs.map((r) => toMin(r.s))) : 480;
    let hi = rs.length ? Math.max(...rs.map((r) => toMin(r.e))) : 1020;
    for (const e of visible) { lo = Math.min(lo, minutesOfDay(e.starts_at)); hi = Math.max(hi, minutesOfDay(e.ends_at)); }
    return [Math.max(5, Math.floor(lo / 60) - 1), Math.min(24, Math.ceil(hi / 60) + 1)];
  }, [rules.data, hidden, visible]);
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);

  const nav = (dir: -1 | 1) => setAnchor((a) => (view === "day" ? addDaysKey(a, dir) : view === "week" ? addDaysKey(a, 7 * dir) : addDaysKey(`${a.slice(0, 8)}01`, dir > 0 ? 32 : -1).slice(0, 8) + "01"));
  const title = view === "day" ? `${fmtWeekday(mid(anchor))} ${fmtDayMonth(mid(anchor))} ${anchor.slice(0, 4)}` : view === "week" ? `${fmtDayMonth(mid(days[0]))} – ${fmtDayMonth(mid(days[6]))} ${days[6].slice(0, 4)}` : fmtMonthYear(mid(anchor));

  // ───── drag to reschedule ─────
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ ev: Ev; dx: number; dy: number; moved: boolean } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const beginDrag = (ev: Ev, x: number, y: number) => {
    setDrag({ ev, dx: 0, dy: 0, moved: false });
    const sx = x, sy = y;
    const move = (m: PointerEvent) => setDrag((d) => (d ? { ...d, dx: m.clientX - sx, dy: m.clientY - sy, moved: d.moved || Math.abs(m.clientX - sx) + Math.abs(m.clientY - sy) > 5 } : d));
    const up = async () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (!d.moved) { os.openAppointment(ev.id); return; }
      const colW = bodyRef.current ? (bodyRef.current.clientWidth - 56) / cols.length : 1;
      const dayShift = view === "week" ? Math.round(d.dx / colW) : 0;
      const minShift = Math.round(d.dy / (HH / 60) / SNAP) * SNAP;
      if (!dayShift && !minShift) return;
      const startDay = addDaysKey(dayKey(ev.starts_at), dayShift);
      const newStart = atTime(startDay, hhmm(minutesOfDay(ev.starts_at) + minShift));
      try {
        await mutate(os.uid, "select public.reschedule_appointment($1, $2::timestamptz)", [ev.id, newStart.toISOString()]);
        toast(`Moved to ${fmtWeekday(newStart)} ${fmtTime(newStart)}`);
      } catch (e) { toast(friendlyError(e)); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scroller.current || view === "month") return;
    const m = dayKey(new Date(now)) === days[0] || days.includes(todayKey()) ? minutesOfDay(new Date()) : h0 * 60 + 480;
    scroller.current.scrollTop = Math.max(0, ((m - h0 * 60) / 60) * HH - 140);
  }, [view, anchor, h0]); // eslint-disable-line react-hooks/exhaustive-deps

  const clickEmpty = useCallback((k: string, e: React.MouseEvent<HTMLDivElement>, pracId?: string) => {
    if ((e.target as HTMLElement).closest(".cal-ev")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = Math.floor(((e.clientY - rect.top) / HH) * 60 / SNAP) * SNAP + h0 * 60;
    os.newAppointment({ date: k, time: hhmm(mins), practitionerId: pracId ?? (shownPracs.length === 1 ? shownPracs[0].id : undefined) });
  }, [h0, os, shownPracs]);

  const merged = (k: string, pracId?: string) => {
    const wd = weekdayIndex(k);
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const rs = (rules.data ?? []).filter((r) => r.weekday === wd && !hidden.has(r.practitioner_id) && (!pracId || r.practitioner_id === pracId)).map((r) => [toMin(r.s), toMin(r.e)] as [number, number]).sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const r of rs) { const l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
    return out;
  };

  const layout = (list: Ev[]) => {
    const sorted = [...list].sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
    const cols: Date[] = [];
    const info = new Map<string, { col: number; n: number }>();
    const groups: Ev[][] = [];
    let cur: Ev[] = [];
    let curEnd = 0;
    for (const e of sorted) {
      if (cur.length && e.starts_at.getTime() >= curEnd) { groups.push(cur); cur = []; cols.length = 0; }
      let c = cols.findIndex((end) => end.getTime() <= e.starts_at.getTime());
      if (c < 0) { c = cols.length; cols.push(e.ends_at); } else cols[c] = e.ends_at;
      info.set(e.id, { col: c, n: 0 });
      cur.push(e);
      curEnd = Math.max(curEnd, e.ends_at.getTime());
    }
    if (cur.length) groups.push(cur);
    for (const g of groups) { const n = Math.max(...g.map((e) => info.get(e.id)!.col)) + 1; g.forEach((e) => (info.get(e.id)!.n = n)); }
    return info;
  };

  const today = todayKey();
  const nowMin = minutesOfDay(new Date(now));

  return (
    <>
      <div className="os-page-h"><div><h1>Calendar</h1><p>Click an empty time to book. Drag an appointment to move it.</p></div></div>
      <div className="cal" style={{ ["--hh" as string]: `${HH}px` }}>
        <div className="cal-toolbar">
          <button className="a-btn secondary sm" onClick={() => setAnchor(todayKey())}>Today</button>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="a-btn ghost icon sm" onClick={() => nav(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>
            <button className="a-btn ghost icon sm" onClick={() => nav(1)} aria-label="Next"><ChevronRight size={18} /></button>
          </div>
          <span className="cal-title" role="heading" aria-level={2}>{title}</span>
          <span style={{ flex: 1 }} />
          <div className="cal-legend">
            {(pracs.data ?? []).map((p) => {
              const c = color(p.id);
              const off = hidden.has(p.id);
              return (
                <button key={p.id} className="a-chip" style={{ height: 32, fontSize: 13, opacity: off ? 0.45 : 1, borderColor: off ? undefined : c.solid }} aria-pressed={!off}
                  onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                  <i className="os-prac-dot" style={{ background: c.solid }} /> {p.display_name.replace(/^Dr\s+/, "")}
                </button>
              );
            })}
          </div>
          <label className="a-check" style={{ fontSize: 13 }}><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Cancelled</label>
          <div className="a-seg" role="tablist">
            {(["day", "week", "month"] as View[]).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} style={{ textTransform: "capitalize", padding: "6px 14px" }}>{v}</button>)}
          </div>
        </div>

        {view !== "month" ? (
          <>
            <div className="cal-head" style={{ gridTemplateColumns: `56px repeat(${cols.length}, 1fr)` }}>
              <div />
              {cols.map((c) => c.prac ? <div key={c.key}><span style={{ display: "flex", gap: 7, alignItems: "center", justifyContent: "center", color: "var(--deep)", fontWeight: 700, fontSize: 14, padding: "6px 0" }}><i className="os-prac-dot" style={{ background: color(c.prac.id).solid }} />{c.prac.display_name}</span></div> : <div key={c.key} className={c.day === today ? "today" : ""}><span style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: ".06em", display: "block" }}>{fmtWeekday(mid(c.day))}</span><b>{fmtDayMonth(mid(c.day)).split(" ")[0]}</b></div>)}
            </div>
            <div className="cal-scroll" ref={scroller}>
              <div className="cal-body" ref={bodyRef} style={{ gridTemplateColumns: `56px repeat(${cols.length}, 1fr)`, height: hours.length * HH }}>
                <div className="cal-gutter">
                  {hours.map((h, i) => <span key={h} className="cal-hour-label" style={{ top: i * HH }}>{i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</span>)}
                </div>
                {cols.map((c) => {
                  const k = c.day;
                  const list = visible.filter((e) => dayKey(e.starts_at) === k && (!c.prac || e.practitioner_id === c.prac.id));
                  const info = layout(list);
                  return (
                    <div key={c.key} className={`cal-col ${k === today ? "today" : ""}`} onClick={(e) => clickEmpty(k, e, c.prac?.id)} role="gridcell" aria-label={`${c.prac?.display_name ?? ""} ${fmtWeekday(mid(k))} ${fmtDayMonth(mid(k))}`}>
                      {merged(k, c.prac?.id).map(([a, b], i) => <div key={i} className="cal-open" style={{ top: ((a - h0 * 60) / 60) * HH, height: ((b - a) / 60) * HH }} />)}
                      <div className="cal-lines" />
                      {(timeoff.data ?? []).filter((o) => !hidden.has(o.practitioner_id) && (!c.prac || o.practitioner_id === c.prac.id) && dayKey(o.a) <= k && dayKey(new Date(o.b.getTime() - 1)) >= k).map((o, i) => {
                        const s = dayKey(o.a) === k ? minutesOfDay(o.a) : h0 * 60;
                        const e = dayKey(new Date(o.b.getTime() - 1)) === k ? minutesOfDay(o.b) || 1440 : h1 * 60;
                        return <div key={i} className="cal-timeoff" style={{ top: ((s - h0 * 60) / 60) * HH, height: Math.max(18, ((e - s) / 60) * HH) }}>On leave{o.reason ? ` · ${o.reason}` : ""}</div>;
                      })}
                      {list.map((e) => {
                        const c = color(e.practitioner_id);
                        const li = info.get(e.id)!;
                        const top = ((minutesOfDay(e.starts_at) - h0 * 60) / 60) * HH;
                        const h = Math.max(24, ((e.ends_at.getTime() - e.starts_at.getTime()) / 3600000) * HH - 2);
                        const isDrag = drag?.ev.id === e.id;
                        const colW = bodyRef.current ? (bodyRef.current.clientWidth - 56) / cols.length : 0;
                        const tx = isDrag && view === "week" ? Math.round(drag!.dx / colW) * colW : 0;
                        const ty = isDrag ? Math.round(drag!.dy / (HH / 60) / SNAP) * SNAP * (HH / 60) : 0;
                        return (
                          <button key={e.id} className={`cal-ev ${isDrag && drag!.moved ? "drag" : ""} ${e.status === "completed" || e.status === "no_show" ? "done" : ""} ${e.status === "cancelled" ? "cancelled" : ""}`}
                            style={{ top, height: h, left: `calc(${(li.col / li.n) * 100}% + 2px)`, width: `calc(${100 / li.n}% - 4px)`, background: c.bg, color: c.ink, borderColor: c.solid + "55", borderLeftColor: c.solid, transform: isDrag ? `translate(${tx}px, ${ty}px)` : undefined }}
                            onPointerDown={(p) => { if (p.button === 0) { p.stopPropagation(); beginDrag(e, p.clientX, p.clientY); } }}
                            onKeyDown={(k) => k.key === "Enter" && os.openAppointment(e.id)}
                            aria-label={`${fmtTime(e.starts_at)} ${e.client}, ${e.service}, ${e.practitioner}${isBabyBlue(e.source) ? ", booked via BabyBlue" : ""}`}>
                            <b>{e.client}{isBabyBlue(e.source) && <i className="cal-bb" title="Booked via BabyBlue" aria-hidden="true" />}</b>
                            {h > 34 && <span>{fmtTime(e.starts_at)} · {e.service}</span>}
                            {h > 58 && shownPracs.length > 1 && <span>{e.practitioner.replace(/^Dr\s+/, "")}</span>}
                            {isDrag && drag!.moved && <span style={{ fontWeight: 700 }}>→ {fmtTime(atTime(addDaysKey(k, view === "week" ? Math.round(drag!.dx / colW) : 0), hhmm(minutesOfDay(e.starts_at) + Math.round(drag!.dy / (HH / 60) / SNAP) * SNAP)))}</span>}
                          </button>
                        );
                      })}
                      {k === today && nowMin >= h0 * 60 && nowMin <= h1 * 60 && <div className="cal-now" style={{ top: ((nowMin - h0 * 60) / 60) * HH }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="cal-head" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="cal-month">
              {days.map((k) => {
                const list = visible.filter((e) => dayKey(e.starts_at) === k);
                return (
                  <div key={k} className={`cal-mday ${k.slice(0, 7) !== anchor.slice(0, 7) ? "out" : ""} ${k === today ? "today" : ""}`} onClick={() => { setAnchor(k); setView("day"); }} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && (setAnchor(k), setView("day"))}>
                    <span className="n">{Number(k.slice(8))}</span>
                    {list.slice(0, 3).map((e) => { const c = color(e.practitioner_id); return <span key={e.id} className="cal-chip" style={{ background: c.bg, color: c.ink, borderColor: c.solid }}>{fmtTime(e.starts_at)} {e.client}</span>; })}
                    {list.length > 3 && <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>+{list.length - 3} more</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <p className="a-hint" style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>White = open hours</span><span>Hatched = closed</span><span style={{ color: "var(--bad)" }}>Red = leave</span>
        <button className="a-link" onClick={() => os.newAppointment({ date: anchor })} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Plus size={13} /> New appointment</button>
      </p>
    </>
  );
}
