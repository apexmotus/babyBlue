"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Avatar, Btn, Field, Notice, Sheet } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { atTime, fmtTime, todayKey } from "@/lib/format";
import { loadPractitioners, loadServices } from "@/lib/os-data";
import {
  createAppointment,
  createClient,
  getClient,
  listAppointmentSlots,
  listPractitionerServices,
  searchClients,
} from "@/lib/api/practice";
import { friendlyError } from "@/lib/api/messages";
import { useQuery } from "@/local/hooks";

interface ClientHit { id: string; name: string; phone: string | null; email: string | null }

export function NewAppointmentModal() {
  const { newAppt, closeNewAppt, practice, uid, openAppointment } = useOs();
  const toast = useToast();
  const { prefill } = newAppt;
  const [q, setQ] = useState("");
  const [client, setClient] = useState<ClientHit | null>(null);
  const [creating, setCreating] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pract, setPract] = useState("");
  const [svc, setSvc] = useState("");
  const [date, setDate] = useState(prefill.date ?? todayKey());
  const [time, setTime] = useState(prefill.time ?? "09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pid = practice?.id ?? "";

  const pracs = useQuery(() => loadPractitioners(uid, pid), [uid, pid], { enabled: !!pid });
  const svcs = useQuery(() => loadServices(uid, pid), [uid, pid], { enabled: !!pid });
  const links = useQuery(
    () => (pract ? listPractitionerServices(uid, pid, pract) : Promise.resolve([])),
    [pract, pid, uid],
    { enabled: !!pract },
  );
  const hits = useQuery(
    () =>
      q.trim().length >= 2
        ? searchClients(uid, pid, q.trim(), 6).then((r) =>
            r.map<ClientHit>((c) => ({ id: c.client_id, name: c.full_name ?? "", phone: c.phone, email: c.email })),
          )
        : Promise.resolve([]),
    [q, pid, uid],
  );

  const offered = useMemo(() => (svcs.data ?? []).filter((s) => s.active && (links.data ?? []).some((l) => l.service_id === s.id)), [svcs.data, links.data]);
  useEffect(() => { if (!pract && pracs.data?.length) setPract(prefill.practitionerId && pracs.data.some((p) => p.id === prefill.practitionerId) ? prefill.practitionerId : pracs.data[0].id); }, [pracs.data, pract, prefill.practitionerId]);
  useEffect(() => { if (offered.length && !offered.some((s) => s.id === svc)) setSvc(offered[0].id); }, [offered, svc]);
  useEffect(() => {
    if (!prefill.clientId) return;
    getClient(uid, pid, prefill.clientId).then((c) => {
      if (c) {
        setClient({
          id: c.client_id,
          name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
          phone: c.phone,
          email: c.email,
        });
      }
    });
  }, [prefill.clientId, pid, uid]);

  const slots = useQuery(
    () =>
      pract && svc
        ? listAppointmentSlots(uid, pid, pract, svc, date).then((r) =>
            r.map((x) => ({ starts_at: x.starts_at instanceof Date ? x.starts_at : new Date(String(x.starts_at)) })),
          )
        : Promise.resolve([]),
    [pract, svc, date, uid],
    { enabled: !!pract && !!svc },
  );
  const slotTimes = (slots.data ?? []).map((s) => fmtTime(s.starts_at));

  async function submit() {
    setError("");
    if (!client && !(creating && first.trim())) return setError("Choose a client, or add a new one.");
    if (!pract || !svc) return setError("Choose a practitioner and service.");
    setBusy(true);
    try {
      let clientId = client?.id;
      if (!clientId) {
        // A client created here consents to record storage as part of being booked, which is
        // what `practice_appointment_create` then requires. Creating one without consent and
        // immediately booking them would be refused as `consent_required` — correctly.
        clientId = await createClient(uid, pid, {
          first_name: first.trim(),
          last_name: last.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          consent_record_storage: true,
        });
      }
      const id = await createAppointment(uid, pid, {
        practitioner_id: pract,
        service_id: svc,
        client_id: clientId,
        starts_at: atTime(date, time).toISOString(),
        source: "os",
      });
      toast("Appointment booked");
      closeNewAppt();
      openAppointment(id);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  if (!newAppt.open) return null;
  return (
    <Sheet title="New appointment" sub={practice?.name} onClose={closeNewAppt} size="wide"
      footer={<><button className="a-btn ghost" onClick={closeNewAppt}>Cancel</button><Btn className="primary" loading={busy} onClick={submit}>Book appointment</Btn></>}>
      <section>
        <p className="a-label" style={{ marginBottom: 8 }}>Client</p>
        {client ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#eaf5f8", padding: "10px 14px", borderRadius: 14 }}>
            <Avatar name={client.name} size={38} /><div style={{ flex: 1 }}><b style={{ color: "var(--deep)" }}>{client.name}</b><br /><span style={{ fontSize: 13, color: "var(--ink-2)" }}>{client.phone ?? client.email ?? ""}</span></div>
            <button className="a-link" onClick={() => setClient(null)}>Change</button>
          </div>
        ) : creating ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="two-col" style={{ gap: 12 }}>
              <Field label="First name" htmlFor="fn"><input id="fn" className="a-input" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
              <Field label="Last name" htmlFor="ln"><input id="ln" className="a-input" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
              <Field label="Mobile" htmlFor="ph"><input id="ph" className="a-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
              <Field label="Email (optional)" htmlFor="em"><input id="em" className="a-input" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" /></Field>
            </div>
            <button className="a-link" style={{ textAlign: "left" }} onClick={() => setCreating(false)}>Search existing clients instead</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="a-input-wrap"><Search size={17} /><input className="a-input" placeholder="Search by name or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" autoFocus /></div>
            {(hits.data ?? []).map((h) => (
              <button key={h.id} className="os-list-item" onClick={() => setClient(h)}><Avatar name={h.name} size={34} /><span><b style={{ color: "var(--deep)" }}>{h.name}</b><br /><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{h.phone}</span></span></button>
            ))}
            <button className="a-btn secondary sm" style={{ alignSelf: "flex-start" }} onClick={() => { setCreating(true); const [f, ...r] = q.trim().split(" "); setFirst(f ?? ""); setLast(r.join(" ")); }}><UserPlus size={15} /> Add a new client</button>
          </div>
        )}
      </section>
      <div className="two-col" style={{ gap: 12 }}>
        <Field label="Practitioner" htmlFor="pr"><select id="pr" className="a-select" value={pract} onChange={(e) => setPract(e.target.value)}>{(pracs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field>
        <Field label="Service" htmlFor="sv"><select id="sv" className="a-select" value={svc} onChange={(e) => setSvc(e.target.value)}>{offered.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration_min} min</option>)}</select></Field>
        <Field label="Date" htmlFor="dt"><input id="dt" type="date" className="a-input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Time" htmlFor="tm"><input id="tm" type="time" step={300} className="a-input" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      {slotTimes.length > 0 ? (
        <div><p className="a-hint" style={{ marginBottom: 8 }}>Open times for {date}</p><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{slotTimes.map((t) => <button key={t} className="a-chip" style={{ height: 34 }} aria-pressed={time === t} onClick={() => setTime(t)}>{t}</button>)}</div></div>
      ) : (
        <p className="a-hint">{slots.loading ? "Checking availability…" : "No published open times that day. You can still book any free time."}</p>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
    </Sheet>
  );
}
