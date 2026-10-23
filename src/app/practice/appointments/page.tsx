"use client";

import { useMemo, useState } from "react";
import { CalendarSearch, Plus, Search } from "lucide-react";
import { Badge, Btn, Empty } from "@/components/app/primitives";
import { PRAC_COLORS, useOs } from "@/components/os/OsContext";
import { addDaysKey, dayStart, fmtDayMonth, fmtTime, fmtWeekday, money, relativeDay, todayKey } from "@/lib/format";
import { APPT_STATUS, SOURCE_LABEL, loadEvents, loadPractitioners } from "@/lib/os-data";
import { useQuery } from "@/local/hooks";

type Range = "today" | "upcoming" | "past" | "all";

export default function AppointmentsPage() {
  const os = useOs();
  const pid = os.practice?.id ?? "";
  const [range, setRange] = useState<Range>("upcoming");
  const [status, setStatus] = useState("");
  const [prac, setPrac] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const today = todayKey();

  const pracs = useQuery(() => loadPractitioners(os.uid, pid), [pid, os.uid], { enabled: !!pid });
  const [from, to] = useMemo(() => {
    if (range === "today") return [dayStart(today), dayStart(addDaysKey(today, 1))];
    if (range === "upcoming") return [new Date(Date.now() - 3600_000), dayStart(addDaysKey(today, 60))];
    if (range === "past") return [dayStart(addDaysKey(today, -60)), new Date()];
    return [dayStart(addDaysKey(today, -90)), dayStart(addDaysKey(today, 90))];
  }, [range, today]);
  const events = useQuery(() => loadEvents(os.uid, pid, from, to, true), [pid, os.uid, range], { enabled: !!pid, poll: 20000 });
  const colorIdx = useMemo(() => new Map((pracs.data ?? []).map((p, i) => [p.id, i])), [pracs.data]);

  const rows = useMemo(() => {
    let r = (events.data ?? []).filter((e) => (!status || e.status === status) && (!prac || e.practitioner_id === prac) && (!q.trim() || `${e.client} ${e.service} ${e.phone ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
    r = range === "past" ? [...r].reverse() : r;
    return r;
  }, [events.data, status, prac, q, range]);

  return (
    <>
      <div className="os-page-h">
        <div><h1>Appointments</h1><p>Every booking across your practice, from every source.</p></div>
        <Btn className="primary" onClick={() => os.newAppointment()}><Plus size={17} /> New appointment</Btn>
      </div>
      <div className="os-toolbar">
        <div className="a-seg" role="tablist">
          {([["today", "Today"], ["upcoming", "Upcoming"], ["past", "Past 60 days"], ["all", "All"]] as [Range, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} onClick={() => { setRange(k); setLimit(40); }}>{l}</button>)}
        </div>
        <div className="a-input-wrap"><Search size={16} /><input className="a-input sm" placeholder="Search client, service or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search appointments" /></div>
        <select className="a-select sm" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(APPT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="a-select sm" style={{ width: 190 }} value={prac} onChange={(e) => setPrac(e.target.value)} aria-label="Practitioner">
          <option value="">All practitioners</option>
          {(pracs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </div>

      <div className="a-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="os-table">
            <thead><tr><th>When</th><th>Client</th><th>Service</th><th>Practitioner</th><th>Status</th><th>Source</th><th style={{ textAlign: "right" }}>Fee</th></tr></thead>
            <tbody>
              {events.loading && !events.data && [0, 1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={7}><div className="a-skel" style={{ height: 22 }} /></td></tr>)}
              {rows.slice(0, limit).map((e) => {
                const st = APPT_STATUS[e.status];
                const c = PRAC_COLORS[(colorIdx.get(e.practitioner_id) ?? 0) % PRAC_COLORS.length];
                return (
                  <tr key={e.id} className="click" onClick={() => os.openAppointment(e.id)} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && os.openAppointment(e.id)}>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}><b style={{ color: "var(--deep)" }}>{relativeDay(e.starts_at)}</b><br /><span style={{ color: "var(--ink-2)", fontSize: 13 }}>{fmtWeekday(e.starts_at)} {fmtDayMonth(e.starts_at)} · {fmtTime(e.starts_at)}</span></td>
                    <td><b style={{ color: "var(--deep)" }}>{e.client}</b><br /><span style={{ color: "var(--ink-3)", fontSize: 13 }}>{e.phone}</span></td>
                    <td>{e.service}</td>
                    <td><span style={{ display: "inline-flex", gap: 7, alignItems: "center" }}><i className="os-prac-dot" style={{ background: c.solid }} />{e.practitioner}</span></td>
                    <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                    <td style={{ color: "var(--ink-2)", fontSize: 13 }}>{SOURCE_LABEL[e.source] ?? e.source}</td>
                    <td className="tnum" style={{ textAlign: "right" }}>{money(e.price_cents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!events.loading && rows.length === 0 && <Empty icon={<CalendarSearch size={28} />} title="No appointments match" action={<button className="a-btn secondary" onClick={() => { setStatus(""); setPrac(""); setQ(""); setRange("all"); }}>Clear filters</button>}>Try a different date range or clear your filters.</Empty>}
      </div>
      {rows.length > limit && <div style={{ textAlign: "center", marginTop: 16 }}><button className="a-btn secondary" onClick={() => setLimit((l) => l + 40)}>Show more ({rows.length - limit} left)</button></div>}
      <p className="a-hint" style={{ marginTop: 12 }}>{rows.length} appointment{rows.length === 1 ? "" : "s"}</p>
    </>
  );
}
