"use client";

import { useState } from "react";
import { CalendarClock, Info, Percent, Repeat, UserX, Wallet } from "lucide-react";
import { Notice } from "@/components/app/primitives";
import { Donut, HBars, Heatmap, StackedBars } from "@/components/os/charts";
import { OwnerOnly } from "@/components/os/OwnerOnly";
import { useOs } from "@/components/os/OsContext";
import { fmtDayMonth, money } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/os-data";
import { query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Insights {
  weekly: { week: string; booked: number; cancelled: number; no_show: number; completed: number }[];
  heatmap: { weekday: number; hour: number; n: number }[];
  by_source: { source: string; n: number }[];
  by_practitioner: { name: string; booked: number; cancelled: number }[];
  repeat: { clients_with_visit: number; repeat_clients: number };
  revenue_est_cents: number;
}

export default function InsightsPage() {
  return <OwnerOnly><Insights /></OwnerOnly>;
}

function Insights() {
  const os = useOs();
  const [weeks, setWeeks] = useState(12);
  const q = useQuery(() => query<{ i: Insights }>(os.uid, "select public.practice_insights($1, $2) i", [os.practice!.id, weeks]).then((r) => r[0].i), [os.practice?.id, weeks, os.uid]);
  const d = q.data;
  const tot = (k: "booked" | "cancelled" | "no_show" | "completed") => (d?.weekly ?? []).reduce((a, w) => a + w[k], 0);
  const scheduled = tot("booked") + tot("cancelled") + tot("no_show");
  const cancelRate = scheduled ? Math.round((tot("cancelled") / scheduled) * 1000) / 10 : null;
  const noShowRate = tot("booked") + tot("no_show") ? Math.round((tot("no_show") / (tot("booked") + tot("no_show"))) * 1000) / 10 : null;
  const repeatRate = d && d.repeat.clients_with_visit ? Math.round((d.repeat.repeat_clients / d.repeat.clients_with_visit) * 100) : null;

  return (
    <>
      <div className="os-page-h">
        <div><h1>Insights</h1><p>Booking activity, utilisation and cancellations, calculated from your real appointments.</p></div>
        <div className="a-seg" role="tablist">{[[4, "4 weeks"], [12, "12 weeks"], [26, "6 months"]].map(([w, l]) => <button key={w} role="tab" aria-selected={weeks === w} onClick={() => setWeeks(w as number)}>{l}</button>)}</div>
      </div>

      <div className="os-kpis">
        <div className="a-card os-kpi"><span className="k"><span className="ic"><CalendarClock size={16} /></span> Appointments held</span><span className="v tnum">{d ? tot("booked") : "–"}</span><span className="s">{d ? `${tot("completed")} completed` : " "}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><Percent size={16} /></span> Cancellation rate</span><span className="v tnum">{cancelRate != null ? `${cancelRate}%` : "n/a"}</span><span className="s">{d ? `${tot("cancelled")} of ${scheduled} scheduled` : " "}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><UserX size={16} /></span> No-show rate</span><span className="v tnum">{noShowRate != null ? `${noShowRate}%` : "n/a"}</span><span className="s">{d ? `${tot("no_show")} no-shows` : " "}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><Repeat size={16} /></span> Repeat clients</span><span className="v tnum">{repeatRate != null ? `${repeatRate}%` : "n/a"}</span><span className="s">{d ? `${d.repeat.repeat_clients} of ${d.repeat.clients_with_visit} seen clients` : " "}</span></div>
        <div className="a-card os-kpi"><span className="k"><span className="ic"><Wallet size={16} /></span> Est. revenue</span><span className="v tnum">{d ? money(d.revenue_est_cents) : "–"}</span><span className="s">Completed visits × listed fees</span></div>
      </div>

      <section className="a-card" style={{ marginBottom: 18 }}>
        <div className="os-card-h"><div><h2>Weekly activity</h2><p className="a-hint" style={{ marginTop: 2 }}>Appointments per week by outcome</p></div>
          <div className="ch-legend"><span><i style={{ background: "#3097b2" }} />Held / booked</span><span><i style={{ background: "#e8a29d" }} />Cancelled</span><span><i style={{ background: "#e6c26a" }} />No-show</span></div></div>
        <div className="os-card-b"><StackedBars height={220} colors={["#3097b2", "#e8a29d", "#e6c26a"]} names={["Held / booked", "Cancelled", "No-show"]} labelEvery={weeks > 12 ? 4 : 1}
          data={(d?.weekly ?? []).map((w) => ({ label: fmtDayMonth(new Date(w.week + "T12:00:00+02:00")), sub: `Week of ${fmtDayMonth(new Date(w.week + "T12:00:00+02:00"))}`, values: [w.booked, w.cancelled, w.no_show] }))} /></div>
      </section>

      <div className="os-grid even" style={{ marginBottom: 18 }}>
        <section className="a-card"><div className="os-card-h"><div><h2>Busiest times</h2><p className="a-hint" style={{ marginTop: 2 }}>Appointments by weekday and hour</p></div></div><div className="os-card-b"><Heatmap cells={d?.heatmap ?? []} /></div></section>
        <section className="a-card"><div className="os-card-h"><div><h2>Where bookings come from</h2><p className="a-hint" style={{ marginTop: 2 }}>Booking source recorded at the time of booking</p></div></div>
          <div className="os-card-b"><Donut parts={(d?.by_source ?? []).map((s, i) => ({ label: SOURCE_LABEL[s.source] ?? s.source, value: s.n, color: ["#3097b2", "#8bc5a9", "#14364b"][i % 3] }))} /></div></section>
      </div>

      <div className="os-grid even" style={{ marginBottom: 18 }}>
        <section className="a-card"><div className="os-card-h"><h2>By practitioner</h2></div><div className="os-card-b"><HBars items={(d?.by_practitioner ?? []).map((p) => ({ label: p.name, value: p.booked }))} format={(v) => `${v} held`} /></div></section>
        <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 17 }}>How to read these numbers</h2>
          <Notice tone="info" icon={<Info size={18} />}>Everything on this page is counted from the appointments stored in your practice. Nothing is estimated except revenue, which multiplies completed visits by each service&apos;s listed fee because no payment data is connected yet.</Notice>
          <Notice tone="neutral" icon={<Info size={18} />}>Marketing attribution is limited to where a booking was made (BabyBlue App, practice, or walk-in/QR). Campaign-level attribution isn&apos;t measurable yet, so we don&apos;t show it.</Notice>
        </section>
      </div>
    </>
  );
}
