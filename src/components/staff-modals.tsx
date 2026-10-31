"use client";

import { useMemo, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { Field, Modal, useToast } from "@/components/ui";
import { addPatient, blockedFor, createBooking, fullName, joinQueue, todays, useDB, waitingList } from "@/lib/store";
import type { Patient, Urgency } from "@/lib/types";
import { TODAY, addDays, checkRsaId, dmy, fmtPhone, initials, longDate, toMins, hhmm, dayIndex, validPhone, weekdayShort } from "@/lib/util";

const NATIONALITIES = ["South Africa", "Zimbabwe", "Mozambique", "Lesotho", "Malawi", "Botswana", "Eswatini", "Nigeria", "Other"];
const ID_TYPES = ["RSA ID", "Passport", "Asylum / refugee permit", "Other"];
const FALLBACK_REASONS = ["Cough or cold symptoms", "Repeat script", "Blood pressure check", "Injury or wound", "Stomach complaint", "Vaccination", "Something else"];

export function reasonOptions(options?: string[]) {
  return options && options.length ? options : FALLBACK_REASONS;
}

function PatientPick({ query, setQuery, onPick, inQueue, patients }: { query: string; setQuery: (s: string) => void; onPick: (p: Patient) => void; inQueue: Set<string>; patients: Patient[] }) {
  const q = query.trim().toLowerCase();
  const results = q.length < 2 ? [] : patients.filter((p) => `${p.first} ${p.last}`.toLowerCase().includes(q) || p.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) || (p.idNumber ?? "").includes(q)).slice(0, 4);
  return (
    <div className="flex col gap8">
      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", left: 14, top: 16, color: "#94a3b8" }} />
        <input className="input" style={{ paddingLeft: 38 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone or ID number" aria-label="Find an existing patient" />
      </div>
      {q.length >= 2 && results.length === 0 && <p className="hint">No match — add them as someone new below.</p>}
      {results.map((p) => {
        const inq = inQueue.has(p.id);
        return (
          <div key={p.id} className="flex center gap12" style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 12 }}>
            <span className="avatar">{initials(p.first, p.last)}</span>
            <div className="grow">
              <p className="b6 t13">{fullName(p)}</p>
              <p className="muted t12">{fmtPhone(p.phone)}</p>
            </div>
            {inq ? <span className="pill sm warn">Already in queue</span> : <button className="tbtn primary" onClick={() => onPick(p)}>Select</button>}
          </div>
        );
      })}
    </div>
  );
}

/* ───── S5 · Add walk-in ───── */
export function WalkInModal({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const qOpts = reasonOptions(db.questions.find((q) => q.id === "q1")?.options);
  const inQueue = useMemo(() => new Set(todays(db).filter((v) => v.status === "waiting" || v.status === "in_consultation").map((v) => v.patientId)), [db]);
  const next = waitingList(db).length + 1;

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Patient | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [nat, setNat] = useState("South Africa");
  const [idType, setIdType] = useState("RSA ID");
  const [idNo, setIdNo] = useState("");
  const [phone, setPhone] = useState("");
  const [wa, setWa] = useState(true);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState(qOpts[0]);
  const [urgency, setUrgency] = useState<Urgency>("routine");
  const [send, setSend] = useState(true);
  const [tried, setTried] = useState(false);

  const idCheck = !picked && idType === "RSA ID" && idNo.trim() ? checkRsaId(idNo) : null;
  const err = {
    first: !picked && !first.trim() && "Required",
    last: !picked && !last.trim() && "Required",
    phone: !picked && !validPhone(phone) && "Enter a South African mobile number",
    id: !picked && idType === "RSA ID" && (!idNo.trim() ? "Enter the ID number" : idCheck && !idCheck.ok ? idCheck.msg : false),
  };
  const bad = !!(err.first || err.last || err.phone || err.id);

  function submit() {
    setTried(true);
    if (bad) return;
    const p = picked ?? { first: first.trim(), last: last.trim(), phone: phone.trim(), whatsapp: wa, idType, idNumber: idNo.trim(), email: email.trim() || undefined, nationality: nat, dob: idCheck?.dob };
    const base = picked ? { first: picked.first, last: picked.last, phone: picked.phone, whatsapp: picked.whatsapp, idType: picked.idType } : p;
    joinQueue({ ...base, reason, urgency, source: "walk-in" });
    toast(`${picked ? fullName(picked) : `${first} ${last}`} added at #${next}${send ? " — status link sent" : ""}`);
    onClose();
  }

  return (
    <Modal
      title="Add walk-in"
      sub={`They'll join the back of the queue at position #${next}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Add to queue</button>
        </>
      }
    >
      <div>
        <p className="label" style={{ marginBottom: 8 }}>Find an existing patient</p>
        {picked ? (
          <div className="flex center gap12" style={{ padding: "10px 12px", background: "var(--primary-50)", borderRadius: 12 }}>
            <span className="avatar">{initials(picked.first, picked.last)}</span>
            <div className="grow">
              <p className="b6 t13">{fullName(picked)}</p>
              <p className="muted t12">{fmtPhone(picked.phone)}</p>
            </div>
            <button className="tbtn" onClick={() => setPicked(null)}>Change</button>
          </div>
        ) : (
          <PatientPick query={query} setQuery={setQuery} onPick={setPicked} inQueue={inQueue} patients={db.patients} />
        )}
      </div>

      {!picked && (
        <>
          <div className="flex center gap12"><hr className="divider grow" /><span className="muted t12">or add someone new</span><hr className="divider grow" /></div>
          <div className="two-col">
            <Field label="First name *" error={tried && err.first}><input className="input sm" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
            <Field label="Last name *" error={tried && err.last}><input className="input sm" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
          </div>
          <div className="two-col">
            <Field label="Nationality *">
              <select className="select sm" value={nat} onChange={(e) => { setNat(e.target.value); setIdType(e.target.value === "South Africa" ? "RSA ID" : "Passport"); }}>
                {NATIONALITIES.map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="ID type *">
              <select className="select sm" value={idType} onChange={(e) => setIdType(e.target.value)}>
                {ID_TYPES.map((n) => <option key={n}>{n}</option>)}
              </select>
            </Field>
          </div>
          <Field
            label={`${idType === "RSA ID" ? "RSA ID" : idType} number *`}
            error={tried && err.id}
            ok={idCheck?.ok && idCheck.dob && `Valid ID — date of birth ${dmy(idCheck.dob)}`}
          >
            <input className={`input sm ${(tried && err.id) || (idCheck && !idCheck.ok) ? "bad" : ""}`} value={idNo} onChange={(e) => setIdNo(e.target.value)} placeholder={idType === "RSA ID" ? "13 digits" : ""} />
          </Field>
          {idCheck && !idCheck.ok && !tried && <span className="error-text" style={{ marginTop: -8 }}>{idCheck.msg}</span>}
          <Field label="Phone *" error={tried && err.phone}>
            <input className="input sm" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="082 000 0000" />
          </Field>
          <label className="check"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> This is the patient&apos;s WhatsApp number</label>
          <div className="two-col">
            <Field label="Email (optional)"><input className="input sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="patient@email.com" /></Field>
            <Field label="Date of birth"><input className="input sm" readOnly value={idCheck?.ok && idCheck.dob ? `${idCheck.dob} · from the ID number` : ""} placeholder="From the ID number" /></Field>
          </div>
        </>
      )}

      <Field label="Reason for visit">
        <select className="select sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {qOpts.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <div className="field">
        <label>Urgency</label>
        <div className="seg" role="radiogroup" aria-label="Urgency" style={{ alignSelf: "flex-start" }}>
          {(["routine", "soon", "urgent"] as Urgency[]).map((u) => (
            <button key={u} role="radio" aria-checked={urgency === u} className={urgency === u ? "on" : ""} onClick={() => setUrgency(u)} style={{ textTransform: "capitalize" }}>{u}</button>
          ))}
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send them the live status link by WhatsApp or SMS</label>
    </Modal>
  );
}

/* ───── S6 · New booking ───── */
export function BookingModal({ onClose, patientId }: { onClose: () => void; patientId?: string }) {
  const db = useDB();
  const toast = useToast();
  const reasons = reasonOptions(db.questions.find((q) => q.id === "q1")?.options);
  const [picked, setPicked] = useState<Patient | null>(db.patients.find((p) => p.id === patientId) ?? null);
  const [query, setQuery] = useState("");
  const days = useMemo(() => Array.from({ length: 9 }, (_, i) => addDays(TODAY, i + 1)).filter((d) => !db.settings.hours[dayIndex(d)].closed), [db.settings.hours]);
  const [day, setDay] = useState(days[0]);
  const [doctor, setDoctor] = useState(db.settings.doctors[0]);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState(reasons[0]);
  const [confirm, setConfirm] = useState(true);
  const [tried, setTried] = useState(false);
  const inQueue = useMemo(() => new Set<string>(), []);

  const h = db.settings.hours[dayIndex(day)];
  const slots = useMemo(() => {
    const out: string[] = [];
    for (let m = toMins(h.open); m + 15 <= toMins(h.close); m += 15) out.push(hhmm(m));
    return out;
  }, [h]);

  function submit() {
    setTried(true);
    if (!picked || !time) return;
    createBooking({ patientId: picked.id, day, time, doctor, reason });
    toast(`Booked ${picked.first} — ${weekdayShort(day)}, ${time}${confirm ? " · confirmation sent" : ""}`);
    onClose();
  }

  return (
    <Modal
      title="New booking"
      sub="A booked patient joins the queue when they arrive and check in"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Create booking</button>
        </>
      }
    >
      {picked ? (
        <div className="flex center gap12" style={{ padding: "10px 12px", background: "var(--primary-50)", borderRadius: 12 }}>
          <span className="avatar">{initials(picked.first, picked.last)}</span>
          <div className="grow">
            <p className="b6 t13">{fullName(picked)}</p>
            <p className="muted t12">{fmtPhone(picked.phone)} · {picked.visitsBase} previous visits{picked.medicalAid ? ` · medical aid: ${picked.medicalAid}` : ""}</p>
          </div>
          <button className="tbtn" onClick={() => setPicked(null)}>Change patient</button>
        </div>
      ) : (
        <div>
          <PatientPick query={query} setQuery={setQuery} onPick={setPicked} inQueue={inQueue} patients={db.patients} />
          {tried && <span className="error-text">Choose a patient first</span>}
        </div>
      )}
      <div className="two-col">
        <Field label="Date">
          <select className="select sm" value={day} onChange={(e) => { setDay(e.target.value); setTime(""); }}>
            {days.map((d) => <option key={d} value={d}>{longDate(d).replace(/^(\w{3})\w*,/, "$1,")}</option>)}
          </select>
        </Field>
        <Field label="Practitioner">
          <select className="select sm" value={doctor} onChange={(e) => { setDoctor(e.target.value); setTime(""); }}>
            {db.settings.doctors.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </div>
      <div className="field">
        <label>Time — 15 minute slots</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8, maxHeight: 190, overflow: "auto", padding: 2 }}>
          {slots.map((s) => {
            const blocked = blockedFor(db, day, doctor, s);
            return (
              <button key={s} className={`slot ${time === s ? "on" : ""}`} disabled={blocked} onClick={() => setTime(s)} title={blocked ? "Blocked" : undefined}>
                {blocked ? "Blocked" : s}
              </button>
            );
          })}
        </div>
        {tried && !time && <span className="error-text">Choose a time slot</span>}
      </div>
      <Field label="Reason for visit">
        <select className="select sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons.map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Send a WhatsApp confirmation now and a reminder the evening before</label>
      {time && picked && (
        <p className="b6 t13" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <UserRound size={15} color="#1d6f86" /> {weekdayShort(day)}, {time} with {doctor}
        </p>
      )}
    </Modal>
  );
}
