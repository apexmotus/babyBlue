"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarOff, Check, Clock, Plus, ShieldQuestion, Trash2, UserPlus } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Notice, Sheet, Switch } from "@babyblue/ui/components/primitives";
import { PRAC_COLORS, useOs } from "@/components/os/OsContext";
import { OwnerOnly } from "@/components/os/OwnerOnly";
import { useToast } from "@babyblue/flow-demo/components/ui";
import { fmtDayMonth, todayKey } from "@babyblue/utils/format";
import { ROLE_LABEL, loadPractitioners, loadServices, type Prac } from "@/lib/os-data";
import {
  addMember,
  addTimeOff,
  createPractitioner,
  listAvailability,
  listMembers,
  listPractitionerServices,
  listRegistrations,
  listTimeOff,
  removeMember,
  removeTimeOff,
  setAvailability,
  setMemberRole,
  setPractitionerServices,
  submitRegistration,
  updatePractitioner,
  type PracticeRole,
} from "@babyblue/api-client/practice";
import { friendlyError } from "@babyblue/api-client/messages";
import { useQuery } from "@babyblue/pglite-demo/hooks";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Range = { s: string; e: string };
const BODIES = ["HPCSA", "SANC", "SAPC", "SADA", "Other council"];

export default function TeamPage() {
  return <OwnerOnly><Team /></OwnerOnly>;
}

function Team() {
  const os = useOs();
  const pid = os.practice!.id;
  const [tab, setTab] = useState<"pracs" | "staff">("pracs");
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const pracs = useQuery(() => loadPractitioners(os.uid, pid), [pid, os.uid]);
  useEffect(() => { if (!sel && pracs.data?.length) setSel(pracs.data[0].id); }, [pracs.data, sel]);
  const current = pracs.data?.find((p) => p.id === sel) ?? null;

  return (
    <>
      <div className="os-page-h">
        <div><h1>Team & hours</h1><p>Practitioners, their services and weekly availability, plus staff accounts.</p></div>
        <Btn className="primary" onClick={() => setAdding(true)}><Plus size={17} /> Add practitioner</Btn>
      </div>
      <div className="a-tabs" style={{ marginBottom: 20 }}>
        <button aria-selected={tab === "pracs"} onClick={() => setTab("pracs")}>Practitioners</button>
        <button aria-selected={tab === "staff"} onClick={() => setTab("staff")}>Staff accounts</button>
      </div>
      {tab === "pracs" ? (
        <div className="os-split">
          <div className="a-card" style={{ padding: 8 }}>
            {(pracs.data ?? []).map((p, i) => (
              <button key={p.id} className="os-list-item" aria-selected={sel === p.id} onClick={() => setSel(p.id)}>
                <Avatar name={p.display_name} size={42} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ color: "var(--deep)", display: "flex", gap: 7, alignItems: "center" }}><i className="os-prac-dot" style={{ background: PRAC_COLORS[i % PRAC_COLORS.length].solid }} />{p.display_name}</b>
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{p.speciality} · {p.listing_status === "listed" ? "Listed" : p.listing_status === "hidden" ? "Hidden" : "Draft"}</span>
                </span>
                {p.verification_status === "verified" && <BadgeCheck size={18} color="#1d6f86" />}
              </button>
            ))}
            {pracs.data?.length === 0 && <Empty icon={<UserPlus size={26} />} title="No practitioners yet" action={<Btn className="primary" onClick={() => setAdding(true)}>Add one</Btn>}>Add the first person patients can book.</Empty>}
          </div>
          {current ? <Editor key={current.id} p={current} /> : <div />}
        </div>
      ) : <Staff />}
      {adding && <AddPractitioner onClose={() => setAdding(false)} onCreated={(id) => { setSel(id); setAdding(false); }} />}
    </>
  );
}

function AddPractitioner({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const os = useOs();
  const toast = useToast();
  const [f, setF] = useState({ name: "", title: "", speciality: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (f.name.trim().length < 2 || !f.speciality.trim()) return setError("Enter a name and a speciality.");
    setBusy(true);
    try {
      const id = await createPractitioner(os.uid, os.practice!.id, {
        display_name: f.name.trim(),
        title: f.title.trim() || null,
        speciality_slug: f.speciality.trim() || null,
      });
      const r = { id };
      toast("Practitioner added. Now set their services and hours.");
      onCreated(r.id);
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }
  return (
    <Sheet title="Add practitioner" onClose={onClose} size="narrow" footer={<><button className="a-btn ghost" onClick={onClose}>Cancel</button><Btn className="primary" loading={busy} onClick={save}>Add</Btn></>}>
      <Field label="Full name" htmlFor="pn"><input id="pn" className="a-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dr Jane Smith" /></Field>
      <Field label="Title" htmlFor="pt"><input id="pt" className="a-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="General Practitioner" /></Field>
      <Field label="Speciality" htmlFor="ps" hint="Patients search by this, e.g. General practice, Dentistry, Physiotherapy."><input id="ps" className="a-input" value={f.speciality} onChange={(e) => setF({ ...f, speciality: e.target.value })} /></Field>
      {error && <Notice tone="bad">{error}</Notice>}
    </Sheet>
  );
}

function Editor({ p }: { p: Prac }) {
  const [tab, setTab] = useState<"profile" | "services" | "hours" | "leave" | "verify">("profile");
  return (
    <section className="a-card" style={{ minWidth: 0 }}>
      <div style={{ padding: "18px 20px 0", display: "flex", gap: 14, alignItems: "center" }}>
        <Avatar name={p.display_name} size={52} />
        <div style={{ flex: 1 }}><h2 style={{ fontSize: 20 }}>{p.display_name}</h2><p style={{ color: "var(--ink-2)", fontSize: 14 }}>{p.title ?? p.speciality}</p></div>
        {p.verification_status === "verified" ? <Badge tone="info" dot>Verified</Badge> : p.verification_status === "pending" ? <Badge tone="warn" dot>Verification pending</Badge> : <Badge>Not verified</Badge>}
      </div>
      <div className="a-tabs" style={{ padding: "0 12px", marginTop: 10 }}>
        {([["profile", "Profile"], ["services", "Services"], ["hours", "Weekly hours"], ["leave", "Leave"], ["verify", "Verification"]] as const).map(([k, l]) => <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div style={{ padding: 20 }}>
        {tab === "profile" && <ProfileTab p={p} />}
        {tab === "services" && <ServicesTab p={p} />}
        {tab === "hours" && <HoursTab p={p} />}
        {tab === "leave" && <LeaveTab p={p} />}
        {tab === "verify" && <VerifyTab p={p} />}
      </div>
    </section>
  );
}

function ProfileTab({ p }: { p: Prac }) {
  const os = useOs();
  const toast = useToast();
  const [f, setF] = useState({ name: p.display_name, title: p.title ?? "", speciality: p.speciality, bio: p.bio ?? "", langs: p.languages.join(", "), listing: p.listing_status });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (f.name.trim().length < 2) return toast("Enter a name");
    setBusy(true);
    try {
      await updatePractitioner(os.uid, os.practice!.id, p.id, {
        display_name: f.name.trim(),
        title: f.title.trim() || null,
        speciality_slug: f.speciality.trim() || null,
        bio: f.bio.trim() || null,
        languages: f.langs.split(",").map((x) => x.trim()).filter(Boolean),
        listing_status: f.listing as "listed" | "unlisted",
      });
      toast("Profile saved");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <div className="two-col" style={{ gap: 14 }}>
        <Field label="Name" htmlFor="e1"><input id="e1" className="a-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Title" htmlFor="e2"><input id="e2" className="a-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Speciality" htmlFor="e3"><input id="e3" className="a-input" value={f.speciality} onChange={(e) => setF({ ...f, speciality: e.target.value })} /></Field>
        <Field label="Languages" htmlFor="e4" hint="Separate with commas"><input id="e4" className="a-input" value={f.langs} onChange={(e) => setF({ ...f, langs: e.target.value })} /></Field>
      </div>
      <Field label="About" htmlFor="e5" hint="Shown on your public profile. Write it for patients."><textarea id="e5" className="a-textarea" style={{ minHeight: 120 }} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
      <Field label="Visibility" htmlFor="e6" hint="Only listed practitioners appear in patient search, and only when the practice is live.">
        <select id="e6" className="a-select" value={f.listing} onChange={(e) => setF({ ...f, listing: e.target.value })}>
          <option value="listed">Listed — patients can find and book</option><option value="draft">Draft — not visible</option><option value="hidden">Hidden — temporarily off</option>
        </select>
      </Field>
      {f.listing === "listed" && os.practice?.status !== "active" && <Notice tone="warn">The practice isn&apos;t live yet, so this practitioner is not visible to patients.</Notice>}
      <div><Btn className="primary" loading={busy} onClick={save}>Save profile</Btn></div>
    </div>
  );
}

function ServicesTab({ p }: { p: Prac }) {
  const os = useOs();
  const toast = useToast();
  const svcs = useQuery(() => loadServices(os.uid, os.practice!.id), [os.practice?.id, os.uid]);
  const links = useQuery(() => listPractitionerServices(os.uid, os.practice!.id, p.id), [p.id, os.practice?.id, os.uid]);
  async function toggle(sid: string, on: boolean) {
    try {
      // The procedure takes the whole set, so the toggle sends the new set rather than an
      // insert or a delete of one row.
      const now = new Set((links.data ?? []).map((l) => l.service_id));
      if (on) now.add(sid); else now.delete(sid);
      await setPractitionerServices(os.uid, os.practice!.id, p.id, [...now]);
    } catch (e) { toast(friendlyError(e)); }
  }
  const has = new Set((links.data ?? []).map((l) => l.service_id));
  return (
    <div style={{ maxWidth: 640 }}>
      <p className="a-hint" style={{ marginBottom: 12 }}>Choose which services {p.display_name} offers. Create or edit services on the Services page.</p>
      {(svcs.data ?? []).filter((s) => s.active).map((s) => (
        <label key={s.id} className="a-check" style={{ padding: "12px 0", borderTop: "1px solid var(--line-2)", alignItems: "center" }}>
          <input type="checkbox" checked={has.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
          <span style={{ flex: 1 }}><b style={{ color: "var(--deep)" }}>{s.name}</b><br /><span style={{ fontSize: 13, color: "var(--ink-3)" }}>{s.duration_min} min{s.buffer_min ? ` + ${s.buffer_min} buffer` : ""}</span></span>
        </label>
      ))}
      {svcs.data?.length === 0 && <Notice tone="info">No services yet. Add some on the Services page.</Notice>}
    </div>
  );
}

function HoursTab({ p }: { p: Prac }) {
  const os = useOs();
  const toast = useToast();
  const rules = useQuery(
    () =>
      listAvailability(os.uid, os.practice!.id, p.id).then((r) =>
        r.map((x) => ({ weekday: x.weekday, s: x.start_time ?? "", e: x.end_time ?? "" })),
      ),
    [p.id, os.practice?.id, os.uid],
  );
  const [days, setDays] = useState<Range[][] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (rules.data && days === null) {
      const d: Range[][] = Array.from({ length: 7 }, () => []);
      for (const r of rules.data) d[r.weekday].push({ s: r.s.slice(0, 5), e: r.e.slice(0, 5) });
      setDays(d);
    }
  }, [rules.data, days]);
  if (!days) return <div className="a-skel" style={{ height: 240 }} />;

  const bad = days.some((rs) => rs.some((r) => !r.s || !r.e || r.e <= r.s) || rs.some((r, i) => rs.some((o, j) => j > i && r.s < o.e && o.s < r.e)));
  const set = (d: number, next: Range[]) => setDays(days.map((x, i) => (i === d ? next : x)));
  const current = days;
  async function save() {
    setBusy(true);
    try {
      const flat = current.flatMap((rs, d) => rs.map((r) => [d, r.s, r.e] as const));
      // The three arrays are read positionally by the procedure, so they are built together.
      // One call replaces the delete-then-insert that ran from the browser;
      // `overlapping_availability` and `invalid_range` are the procedure's to raise.
      await setAvailability(os.uid, os.practice!.id, p.id, {
        weekdays: flat.map((x) => x[0]),
        starts: flat.map((x) => x[1]),
        ends: flat.map((x) => x[2]),
      });
      toast("Weekly hours saved");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 640 }}>
      <p className="a-hint" style={{ marginBottom: 8 }}>Patients can only book inside these hours. Add two ranges for a lunch break.</p>
      {DAYS.map((name, d) => (
        <div key={name} className="hours-row" style={{ gridTemplateColumns: "100px 54px 1fr" }}>
          <b style={{ color: "var(--deep)" }}>{name}</b>
          <Switch on={days[d].length > 0} label={`${name} open`} onChange={(v) => set(d, v ? [{ s: "08:00", e: "17:00" }] : [])} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {days[d].length === 0 && <span style={{ color: "var(--ink-3)" }}>Closed</span>}
            {days[d].map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="time" className="a-input sm" style={{ width: 120 }} value={r.s} onChange={(e) => set(d, days[d].map((x, k) => (k === i ? { ...x, s: e.target.value } : x)))} aria-label={`${name} start`} />
                <span style={{ color: "var(--ink-3)" }}>to</span>
                <input type="time" className="a-input sm" style={{ width: 120 }} value={r.e} onChange={(e) => set(d, days[d].map((x, k) => (k === i ? { ...x, e: e.target.value } : x)))} aria-label={`${name} end`} />
                <button className="a-btn ghost icon sm" aria-label="Remove range" onClick={() => set(d, days[d].filter((_, k) => k !== i))}><Trash2 size={15} /></button>
                {i === days[d].length - 1 && <button className="a-link" style={{ fontSize: 13 }} onClick={() => set(d, [...days[d], { s: "14:00", e: "17:00" }])}>+ Add range</button>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {bad && <div style={{ marginTop: 12 }}><Notice tone="bad">Each range needs an end after its start, and ranges on the same day can&apos;t overlap.</Notice></div>}
      <div style={{ marginTop: 16 }}><Btn className="primary" disabled={bad} loading={busy} onClick={save}><Clock size={16} /> Save weekly hours</Btn></div>
    </div>
  );
}

function LeaveTab({ p }: { p: Prac }) {
  const os = useOs();
  const toast = useToast();
  const off = useQuery(
    () =>
      listTimeOff(os.uid, os.practice!.id, p.id, new Date()).then((r) =>
        r.map((x) => ({
          id: x.timeoff_id,
          a: x.starts_at instanceof Date ? x.starts_at : new Date(String(x.starts_at)),
          b: x.ends_at instanceof Date ? x.ends_at : new Date(String(x.ends_at)),
          reason: x.reason,
        })),
      ),
    [p.id, os.practice?.id, os.uid],
  );
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (to < from) return toast("The end date must be on or after the start date");
    setBusy(true);
    try {
      // The hard-coded +02:00 is gone: `practice_timeoff_add` builds the window in the
      // practice's own timezone, so a practice in Africa/Lagos gets Lagos days.
      await addTimeOff(os.uid, os.practice!.id, {
        practitioner_id: p.id,
        from,
        to,
        reason: reason.trim() || null,
      });
      toast("Leave added. Those days are blocked for booking.");
      setReason("");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="a-card flat pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ color: "var(--deep)" }}>Add leave or blocked time</b>
        <div className="two-col" style={{ gap: 12 }}>
          <Field label="From" htmlFor="l1"><input id="l1" type="date" className="a-input" value={from} min={todayKey()} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></Field>
          <Field label="To (inclusive)" htmlFor="l2"><input id="l2" type="date" className="a-input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Field label="Reason (optional)" htmlFor="l3"><input id="l3" className="a-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Annual leave, conference" /></Field>
        <div><Btn className="primary sm" loading={busy} onClick={add}><CalendarOff size={15} /> Add leave</Btn></div>
      </div>
      {(off.data ?? []).map((o) => (
        <div key={o.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line-2)" }}>
          <CalendarOff size={18} color="#b4332c" />
          <span style={{ flex: 1 }}><b style={{ color: "var(--deep)" }}>{fmtDayMonth(o.a)} – {fmtDayMonth(new Date(o.b.getTime() - 1))}</b><br /><span style={{ fontSize: 13, color: "var(--ink-3)" }}>{o.reason ?? "Leave"}</span></span>
          <button className="a-btn ghost sm" onClick={async () => { try { await removeTimeOff(os.uid, os.practice!.id, o.id); toast("Leave removed"); } catch (e) { toast(friendlyError(e)); } }}>Remove</button>
        </div>
      ))}
      {off.data?.length === 0 && <p className="a-hint">No upcoming leave.</p>}
    </div>
  );
}

function VerifyTab({ p }: { p: Prac }) {
  const os = useOs();
  const toast = useToast();
  const reg = useQuery(
    () =>
      listRegistrations(os.uid, os.practice!.id, p.id).then((r) =>
        r[0] ? { body: r[0].body_code ?? "", registration_number: r[0].registration_number ?? "" } : null,
      ),
    [p.id, os.practice?.id, os.uid],
  );
  const [body, setBody] = useState("HPCSA");
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await submitRegistration(os.uid, os.practice!.id, p.id, { body_code: body, number: num });
      toast("Submitted for review");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }}>
      {p.verification_status === "verified" && <Notice tone="good" icon={<BadgeCheck size={20} />}><b>Verified.</b> Patients see a verified badge on this profile. {reg.data ? `Registered with ${reg.data.body} (${reg.data.registration_number}).` : ""}</Notice>}
      {p.verification_status === "pending" && <Notice tone="warn" icon={<Clock size={20} />}><b>Under review.</b> A BabyBlue admin is checking {reg.data?.body} registration {reg.data?.registration_number}. Until then the profile shows &ldquo;Verification pending&rdquo;.</Notice>}
      {(p.verification_status === "unverified" || p.verification_status === "rejected") && (
        <>
          <Notice tone="info" icon={<ShieldQuestion size={20} />}>A verified badge only appears once BabyBlue has checked this registration against the council&apos;s public register. Until then, patients see &ldquo;Not yet verified&rdquo;.{p.verification_status === "rejected" ? " Your last submission could not be verified. Please check the details and resubmit." : ""}</Notice>
          <Field label="Registration body" htmlFor="v1"><select id="v1" className="a-select" value={body} onChange={(e) => setBody(e.target.value)}>{BODIES.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="Registration number" htmlFor="v2"><input id="v2" className="a-input" value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. MP0000000" /></Field>
          <div><Btn className="primary" loading={busy} disabled={num.trim().length < 3} onClick={submit}><Check size={16} /> Submit for verification</Btn></div>
        </>
      )}
    </div>
  );
}

interface Member { user_id: string; email: string; display_name: string | null; role: string }
function Staff() {
  const os = useOs();
  const toast = useToast();
  const team = useQuery(
    () =>
      listMembers(os.uid, os.practice!.id).then((r) =>
        r.map<Member>((m) => ({
          user_id: m.user_id ?? "",
          email: m.email ?? "",
          display_name: m.display_name,
          role: m.role ?? "staff",
        })),
      ),
    [os.practice?.id, os.uid],
  );
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("receptionist");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => team.data ?? [], [team.data]);
  async function add() {
    setBusy(true);
    try {
      await addMember(os.uid, os.practice!.id, { email, role: role as PracticeRole });
      toast("Added to the team");
      setEmail("");
      team.reload();
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <div className="os-grid even" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
      <section className="a-card">
        <div className="os-card-h"><h2>Team members</h2></div>
        <div style={{ marginTop: 10 }}>
          {rows.map((m) => (
            <div key={m.user_id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--line-2)" }}>
              <Avatar name={m.display_name ?? m.email} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ color: "var(--deep)" }}>{m.display_name}</b>{m.user_id === os.uid && <span className="a-hint"> (you)</span>}<br /><span style={{ fontSize: 13, color: "var(--ink-3)" }}>{m.email}</span></span>
              <select className="a-select sm" style={{ width: 140 }} value={m.role} disabled={m.user_id === os.uid} aria-label={`Role for ${m.display_name}`}
                onChange={async (e) => {
                  // This used to write the practice_members row straight from the browser,
                  // guarded only by the `disabled` attribute above — so the last owner could
                  // demote themselves and strand the practice. `practice_member_role_set`
                  // raises `sole_owner`, which arrives here as copy the user can act on.
                  try { await setMemberRole(os.uid, os.practice!.id, m.user_id, e.target.value as PracticeRole); toast("Role updated"); team.reload(); }
                  catch (x) { toast(friendlyError(x)); team.reload(); }
                }}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="a-btn ghost sm" disabled={m.user_id === os.uid} onClick={async () => { try { await removeMember(os.uid, os.practice!.id, m.user_id); toast("Removed"); team.reload(); } catch (x) { toast(friendlyError(x)); } }}>Remove</button>
            </div>
          ))}
        </div>
      </section>
      <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 17 }}>Add a team member</h2>
        <p className="a-hint">They need a BabyBlue OS account first. Owners manage everything, reception runs the day, practitioners and staff see the diary.</p>
        <Field label="Email" htmlFor="m1"><input id="m1" type="email" className="a-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@practice.co.za" /></Field>
        <Field label="Role" htmlFor="m2"><select id="m2" className="a-select" value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div><Btn className="primary" loading={busy} disabled={!email.includes("@")} onClick={add}><UserPlus size={16} /> Add to team</Btn></div>
      </section>
    </div>
  );
}
