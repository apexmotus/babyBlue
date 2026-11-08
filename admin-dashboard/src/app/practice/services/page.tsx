"use client";

import { useState } from "react";
import { Clock, Pencil, Plus, Stethoscope } from "lucide-react";
import { Badge, Btn, Empty, Field, Notice, Sheet, Switch } from "@babyblue/ui/components/primitives";
import { OwnerOnly } from "@/components/os/OwnerOnly";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@babyblue/flow-demo/components/ui";
import { money } from "@babyblue/utils/format";
import { loadPractitioners, loadServices, type Svc } from "@/lib/os-data";
import { listServicePractitioners, setServicePractitioners, upsertService } from "@babyblue/api-client/practice";
import { friendlyError } from "@babyblue/api-client/messages";
import { useQuery } from "@babyblue/pglite-demo/hooks";

export default function ServicesPage() {
  return <OwnerOnly><Services /></OwnerOnly>;
}

function Services() {
  const os = useOs();
  const pid = os.practice!.id;
  const [edit, setEdit] = useState<Svc | "new" | null>(null);
  const svcs = useQuery(() => loadServices(os.uid, pid), [pid, os.uid]);
  // `practice_services_list` already returns `practitioner_count`, so the separate grouped
  // count query is gone.
  const nOf = (id: string) => svcs.data?.find((s) => s.id === id)?.practitioner_count ?? 0;
  return (
    <>
      <div className="os-page-h">
        <div><h1>Services</h1><p>What you offer, how long it takes and what it costs. Patients book exactly these.</p></div>
        <Btn className="primary" onClick={() => setEdit("new")}><Plus size={17} /> Add service</Btn>
      </div>
      <div className="a-card" style={{ overflow: "hidden" }}>
        <table className="os-table">
          <thead><tr><th>Service</th><th>Duration</th><th>Buffer</th><th style={{ textAlign: "right" }}>Fee</th><th>Offered by</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(svcs.data ?? []).map((s) => (
              <tr key={s.id} className="click" onClick={() => setEdit(s)}>
                <td><b style={{ color: "var(--deep)" }}>{s.name}</b><br /><span style={{ fontSize: 13, color: "var(--ink-3)" }}>{s.description}</span></td>
                <td className="tnum">{s.duration_min} min</td><td className="tnum">{s.buffer_min ? `${s.buffer_min} min` : "—"}</td>
                <td className="tnum" style={{ textAlign: "right" }}>{money(s.price_cents) || "—"}</td>
                <td>{nOf(s.id)} practitioner{nOf(s.id) === 1 ? "" : "s"}</td>
                <td>{s.active ? <Badge tone="good" dot>Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td style={{ textAlign: "right" }}><Pencil size={16} color="#5a7282" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {svcs.data?.length === 0 && <Empty icon={<Stethoscope size={28} />} title="No services yet" action={<Btn className="primary" onClick={() => setEdit("new")}>Add your first service</Btn>}>Services decide which appointment types patients can book.</Empty>}
      </div>
      {edit && <Editor svc={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Editor({ svc, onClose }: { svc: Svc | null; onClose: () => void }) {
  const os = useOs();
  const toast = useToast();
  const pid = os.practice!.id;
  const [f, setF] = useState({ name: svc?.name ?? "", description: svc?.description ?? "", duration: String(svc?.duration_min ?? 30), buffer: String(svc?.buffer_min ?? 5), price: svc?.price_cents != null ? String(svc.price_cents / 100) : "", active: svc?.active ?? true });
  const [offered, setOffered] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pracs = useQuery(() => loadPractitioners(os.uid, pid), [pid, os.uid]);
  const links = useQuery(
    () => (svc ? listServicePractitioners(os.uid, pid, svc.id) : Promise.resolve([])),
    [svc?.id, pid, os.uid],
  );
  const cur = offered ?? new Set((links.data ?? []).map((l) => l.practitioner_id));
  const toggle = (id: string) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); setOffered(n); };

  async function save() {
    const dur = Number(f.duration), buf = Number(f.buffer || 0), price = f.price === "" ? null : Math.round(Number(f.price) * 100);
    if (f.name.trim().length < 2) return setError("Enter a service name.");
    if (!(dur >= 5 && dur <= 480)) return setError("Duration must be between 5 and 480 minutes.");
    if (!(buf >= 0 && buf <= 120)) return setError("Buffer must be between 0 and 120 minutes.");
    if (price !== null && (Number.isNaN(price) || price < 0)) return setError("Enter a valid fee.");
    setBusy(true);
    try {
      // One upsert for both create and edit. Making a service bookable without a price is
      // refused by the procedure as `price_required`, which arrives here as friendly copy.
      const id = await upsertService(os.uid, pid, {
        service_id: svc?.id ?? null,
        name: f.name.trim(),
        description: f.description.trim() || null,
        duration_min: dur,
        buffer_min: buf,
        price_cents: price,
        active: f.active,
      });

      const want = offered ?? new Set((links.data ?? []).map((l) => l.practitioner_id));
      // Replaces the delete-then-insert that ran from the browser. Emptying the set while future
      // bookings exist is refused as `last_practitioner`.
      await setServicePractitioners(os.uid, pid, id, [...want]);
      toast(svc ? "Service updated" : "Service added");
      onClose();
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  return (
    <Sheet title={svc ? "Edit service" : "Add service"} onClose={onClose} footer={<><button className="a-btn ghost" onClick={onClose}>Cancel</button><Btn className="primary" loading={busy} onClick={save}>{svc ? "Save changes" : "Add service"}</Btn></>}>
      <Field label="Name" htmlFor="s1"><input id="s1" className="a-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Description" htmlFor="s2" hint="Shown to patients."><textarea id="s2" className="a-textarea" style={{ minHeight: 70 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="two-col" style={{ gap: 12 }}>
        <Field label="Duration (minutes)" htmlFor="s3"><input id="s3" type="number" min={5} max={480} step={5} className="a-input" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></Field>
        <Field label="Buffer after (minutes)" htmlFor="s4" hint="Time kept free to reset or write up."><input id="s4" type="number" min={0} max={120} step={5} className="a-input" value={f.buffer} onChange={(e) => setF({ ...f, buffer: e.target.value })} /></Field>
        <Field label="Fee (rand)" htmlFor="s5" hint="Leave blank to show no price."><input id="s5" type="number" min={0} step={10} className="a-input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <div className="a-field"><span className="a-label">Bookable</span><div style={{ display: "flex", gap: 10, alignItems: "center", height: 48 }}><Switch on={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" /><span style={{ fontSize: 14, color: "var(--ink-2)" }}>{f.active ? "Patients can book this" : "Hidden from patients"}</span></div></div>
      </div>
      <div>
        <p className="a-label" style={{ marginBottom: 8 }}>Offered by</p>
        {(pracs.data ?? []).map((p) => <label key={p.id} className="a-check" style={{ padding: "8px 0", alignItems: "center" }}><input type="checkbox" checked={cur.has(p.id)} onChange={() => toggle(p.id)} /> {p.display_name}</label>)}
        {pracs.data?.length === 0 && <p className="a-hint"><Clock size={13} /> Add a practitioner first.</p>}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </Sheet>
  );
}
