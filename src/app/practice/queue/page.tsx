"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, DoorOpen, ExternalLink, Play, Printer, UserPlus, X } from "lucide-react";
import { Avatar, Badge, Btn, Field, Notice, Sheet } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { addDaysKey, dayStart, fmtTime, todayKey } from "@/lib/format";
import { loadEvents } from "@/lib/os-data";
import { friendlyError, mutate, query } from "@/local/db";
import { useNow, useQuery } from "@/local/hooks";

interface QRow { id: string; display_name: string; phone: string | null; status: "waiting" | "in_consultation" | "done" | "cancelled"; urgency: string; source: string; joined_at: Date; called_at: Date | null; completed_at: Date | null; appointment_id: string | null }

const waitText = (d: Date, now: number) => { const m = Math.max(0, Math.round((now - d.getTime()) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

export default function QueuePage() {
  const os = useOs();
  const toast = useToast();
  const pid = os.practice?.id ?? "";
  const now = useNow(30_000);
  const [add, setAdd] = useState(false);
  const [qr, setQr] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const joinUrl = origin && os.practice ? `${origin}/patient/join/${os.practice.slug}` : "";
  useEffect(() => { if (joinUrl) QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: "#14364b", light: "#ffffff" } }).then(setQr, () => setQr("")); }, [joinUrl]);

  const rows = useQuery(() => query<QRow>(os.uid, "select id, display_name, phone, status::text, urgency, source, joined_at, called_at, completed_at, appointment_id from public.queue_entries where practice_id = $1 and (status in ('waiting','in_consultation') or completed_at > now() - interval '6 hours') order by seq", [pid]), [pid, os.uid], { enabled: !!pid, poll: 4000 });
  const today = todayKey();
  const arrivals = useQuery(() => loadEvents(os.uid, pid, dayStart(today), dayStart(addDaysKey(today, 1))).then((r) => r.filter((e) => ["booked", "confirmed"].includes(e.status) && e.starts_at.getTime() < Date.now() + 2 * 3600_000 && e.ends_at.getTime() > Date.now() - 30 * 60_000)), [pid, os.uid, today], { enabled: !!pid, poll: 10000 });

  const waiting = (rows.data ?? []).filter((r) => r.status === "waiting").sort((a, b) => (b.urgency === "urgent" ? 1 : 0) - (a.urgency === "urgent" ? 1 : 0));
  const inRoom = (rows.data ?? []).filter((r) => r.status === "in_consultation");
  const done = (rows.data ?? []).filter((r) => r.status === "done").slice(-8).reverse();

  async function set(id: string, status: string, ok: string) {
    try { await mutate(os.uid, "select public.queue_set_status($1, $2::public.queue_status)", [id, status]); toast(ok); } catch (e) { toast(friendlyError(e)); }
  }
  const waits = waiting.map((w) => (now - w.joined_at.getTime()) / 60000);
  const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0;

  return (
    <>
      <div className="os-page-h">
        <div><h1>Queue</h1><p>BabyBlue Flow: walk-ins, QR check-ins and today&apos;s arrivals in one live list.</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href={`/patient/join/${os.practice?.slug}`} target="_blank" className="a-btn secondary"><ExternalLink size={16} /> Patient view</Link>
          <Btn className="primary" onClick={() => setAdd(true)}><UserPlus size={17} /> Add walk-in</Btn>
        </div>
      </div>

      <div className="os-kpis" style={{ marginBottom: 16 }}>
        <div className="a-card os-kpi"><span className="k">Waiting</span><span className="v tnum">{waiting.length}</span><span className="s">{waiting.length ? `average wait ${avgWait} min` : "Nobody waiting"}</span></div>
        <div className="a-card os-kpi"><span className="k">In consultation</span><span className="v tnum">{inRoom.length}</span><span className="s">with a practitioner</span></div>
        <div className="a-card os-kpi"><span className="k">Seen (last 6 h)</span><span className="v tnum">{(rows.data ?? []).filter((r) => r.status === "done").length}</span><span className="s">completed visits</span></div>
        <div className="a-card os-kpi"><span className="k">Arrivals due</span><span className="v tnum">{arrivals.data?.length ?? 0}</span><span className="s">booked, not yet checked in</span></div>
      </div>

      {(arrivals.data ?? []).length > 0 && (
        <section className="a-card pad" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Expected arrivals</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(arrivals.data ?? []).map((e) => (
              <div key={e.id} className="a-card flat" style={{ padding: "10px 12px", display: "flex", gap: 12, alignItems: "center" }}>
                <Avatar name={e.client} size={34} />
                <span><b style={{ color: "var(--deep)", fontSize: 14 }}>{e.client}</b><br /><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{fmtTime(e.starts_at)} · {e.practitioner}</span></span>
                <Btn className="soft sm" onClick={async () => { try { await mutate(os.uid, "select public.set_appointment_status($1, 'checked_in')", [e.id]); toast(`${e.client} checked in`); } catch (x) { toast(friendlyError(x)); } }}><DoorOpen size={14} /> Arrived</Btn>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="os-grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 300px" }}>
        <div className="q-board" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="q-col">
            <h3>Waiting <Badge tone="neutral">{waiting.length}</Badge></h3>
            {waiting.map((w, i) => (
              <div key={w.id} className={`q-card ${w.urgency === "urgent" ? "urgent" : ""}`}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="pos">{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}><b style={{ color: "var(--deep)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.display_name}</b><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{waitText(w.joined_at, now)} · {w.source === "qr" ? "QR" : w.source === "booked" ? "Booked" : "Reception"}</span></div>
                  {w.urgency !== "routine" && <Badge tone={w.urgency === "urgent" ? "bad" : "warn"}>{w.urgency}</Badge>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn className="primary sm" style={{ flex: 1 }} onClick={() => set(w.id, "in_consultation", `${w.display_name} called`)}><Play size={14} /> Call</Btn>
                  <Btn className="ghost sm icon" aria-label="Remove from queue" onClick={() => set(w.id, "cancelled", "Removed from queue")}><X size={15} /></Btn>
                </div>
              </div>
            ))}
            {waiting.length === 0 && <p className="a-hint" style={{ padding: 10 }}>No one is waiting.</p>}
          </div>
          <div className="q-col">
            <h3>In consultation <Badge tone="info">{inRoom.length}</Badge></h3>
            {inRoom.map((w) => (
              <div key={w.id} className="q-card">
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Avatar name={w.display_name} size={34} /><div style={{ flex: 1, minWidth: 0 }}><b style={{ color: "var(--deep)", display: "block" }}>{w.display_name}</b><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>since {w.called_at ? fmtTime(w.called_at) : "—"}</span></div></div>
                <Btn className="good sm" onClick={() => set(w.id, "done", `${w.display_name} seen`)}><Check size={14} /> Mark seen</Btn>
              </div>
            ))}
            {inRoom.length === 0 && <p className="a-hint" style={{ padding: 10 }}>Rooms are free.</p>}
          </div>
          <div className="q-col">
            <h3>Seen today <Badge tone="good">{done.length}</Badge></h3>
            {done.map((w) => (
              <div key={w.id} className="q-card" style={{ opacity: 0.8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Avatar name={w.display_name} size={30} /><div style={{ flex: 1 }}><b style={{ color: "var(--deep)", fontSize: 14 }}>{w.display_name}</b><br /><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>done {w.completed_at ? fmtTime(w.completed_at) : ""}</span></div></div>
              </div>
            ))}
          </div>
        </div>

        <aside className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "center", position: "sticky", top: 84 }}>
          <h2 style={{ fontSize: 17 }}>Patient QR code</h2>
          {qr ? <img src={qr} alt={`QR code to join the queue at ${os.practice?.name}`} style={{ width: "100%", borderRadius: 14, border: "1px solid var(--line)" }} /> : <div className="a-skel" style={{ height: 240 }} />}
          <p className="a-hint">Patients scan this at reception, add their name and wait wherever they like.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="a-btn secondary sm" style={{ flex: 1 }} onClick={() => { navigator.clipboard?.writeText(joinUrl).then(() => toast("Link copied")); }}><Copy size={14} /> Copy link</button>
            <button className="a-btn secondary sm" style={{ flex: 1 }} onClick={() => window.print()}><Printer size={14} /> Print</button>
          </div>
        </aside>
      </div>
      {add && <AddWalkIn onClose={() => setAdd(false)} />}
    </>
  );
}

function AddWalkIn({ onClose }: { onClose: () => void }) {
  const os = useOs();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    try { await mutate(os.uid, "select public.queue_add_walkin($1, $2, $3, $4)", [os.practice!.id, name, phone, urgency]); toast(`${name.trim()} added to the queue`); onClose(); } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }
  return (
    <Sheet title="Add walk-in" sub="They join the back of the queue." onClose={onClose} size="narrow" footer={<><button className="a-btn ghost" onClick={onClose}>Cancel</button><Btn className="primary" loading={busy} onClick={save}>Add to queue</Btn></>}>
      <Field label="Name" htmlFor="wn"><input id="wn" className="a-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Mobile (optional)" htmlFor="wp"><input id="wp" className="a-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
      <div className="a-field"><span className="a-label">Urgency</span><div className="a-seg" role="radiogroup" style={{ alignSelf: "flex-start" }}>{["routine", "soon", "urgent"].map((u) => <button key={u} role="radio" aria-checked={urgency === u} className={urgency === u ? "on" : ""} onClick={() => setUrgency(u)} style={{ textTransform: "capitalize" }}>{u}</button>)}</div></div>
      {error && <Notice tone="bad">{error}</Notice>}
    </Sheet>
  );
}
