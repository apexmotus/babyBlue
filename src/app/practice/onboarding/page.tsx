"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Rocket } from "lucide-react";
import { Btn, Field, Notice } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { Logo } from "@/components/ui";
import { friendlyError, mutate } from "@/local/db";

const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export default function Onboarding() {
  const os = useOs();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [p, setP] = useState({ name: "", slug: "", slugTouched: false, address: "", city: "", province: "Gauteng" });
  const [me, setMe] = useState({ name: os.session.name, title: "", speciality: "", langs: "English", bio: "" });
  const [svc, setSvc] = useState({ name: "Consultation", mins: "30", buffer: "5", price: "" });
  const [open, setOpen] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("17:00");

  const steps = ["Practice", "You", "First service", "Hours"];
  const ok1 = p.name.trim().length >= 2 && p.slug.length >= 3 && p.city.trim().length >= 2;
  const ok2 = me.name.trim().length >= 2 && me.speciality.trim().length >= 2;
  const ok3 = svc.name.trim().length >= 2 && Number(svc.mins) >= 5;
  const ok4 = open.some(Boolean) && to > from;

  async function finish() {
    setBusy(true);
    setError("");
    try {
      const [{ id }] = await mutate<{ id: string }>(os.uid, "select public.create_practice($1, $2) as id", [p.name.trim(), p.slug]);
      await mutate(os.uid, "update public.practices set province = $2 where id = $1", [id, p.province]);
      await mutate(os.uid, "insert into public.locations (practice_id, name, address, city, province) values ($1, 'Main rooms', nullif($2, ''), $3, $4)", [id, p.address.trim(), p.city.trim(), p.province]);
      const [pt] = await mutate<{ id: string }>(os.uid, "insert into public.practitioners (practice_id, user_id, display_name, title, speciality, bio, languages) values ($1, $2, $3, nullif($4, ''), $5, $6, $7) returning id", [id, os.uid, me.name.trim(), me.title.trim(), me.speciality.trim(), me.bio.trim(), me.langs.split(",").map((x) => x.trim()).filter(Boolean)]);
      const [sv] = await mutate<{ id: string }>(os.uid, "insert into public.services (practice_id, name, duration_min, buffer_min, price_cents) values ($1, $2, $3, $4, $5) returning id", [id, svc.name.trim(), Number(svc.mins), Number(svc.buffer || 0), svc.price === "" ? null : Math.round(Number(svc.price) * 100)]);
      await mutate(os.uid, "insert into public.practitioner_services values ($1, $2, $3)", [pt.id, sv.id, id]);
      const days = open.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
      await mutate(os.uid, "insert into public.availability_rules (practice_id, practitioner_id, weekday, start_time, end_time) select $1, $2, d, $3::time, $4::time from unnest($5::int[]) d", [id, pt.id, from, to, days]);
      os.setPracticeId(id);
      router.replace("/practice");
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  return (
    <div className="ob-wrap">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}><Logo size={34} href="/" /></div>
        <div className="ob-steps" role="list">
          {steps.map((s, i) => (
            <span key={s} style={{ display: "contents" }}>
              <span className={`s ${step === i + 1 ? "on" : ""} ${step > i + 1 ? "done" : ""}`} role="listitem"><i>{step > i + 1 ? <Check size={14} strokeWidth={3} /> : i + 1}</i>{s}</span>
              {i < steps.length - 1 && <span className="bar" />}
            </span>
          ))}
        </div>

        <div className="a-card pad" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 18 }}>
          {step === 1 && (
            <>
              <div><h1 style={{ fontSize: 28 }}>Set up your practice</h1><p style={{ color: "var(--ink-2)", marginTop: 4 }}>This is what patients see. You can change everything later.</p></div>
              <Field label="Practice name" htmlFor="o1"><input id="o1" className="a-input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value, slug: p.slugTouched ? p.slug : slugify(e.target.value) })} placeholder="e.g. Rosebank Family Practice" /></Field>
              <Field label="Web address" htmlFor="o2" hint={`babyblue … /patient/join/${p.slug || "your-practice"}`}><input id="o2" className="a-input" value={p.slug} onChange={(e) => setP({ ...p, slug: slugify(e.target.value), slugTouched: true })} /></Field>
              <div className="two-col" style={{ gap: 14 }}>
                <Field label="Street address" htmlFor="o3"><input id="o3" className="a-input" value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} /></Field>
                <Field label="City" htmlFor="o4"><input id="o4" className="a-input" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></Field>
              </div>
              <Field label="Province" htmlFor="o5"><select id="o5" className="a-select" value={p.province} onChange={(e) => setP({ ...p, province: e.target.value })}>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            </>
          )}
          {step === 2 && (
            <>
              <div><h1 style={{ fontSize: 28 }}>About you</h1><p style={{ color: "var(--ink-2)", marginTop: 4 }}>Your profile is what patients compare. You can add more practitioners later.</p></div>
              <div className="two-col" style={{ gap: 14 }}>
                <Field label="Name" htmlFor="m1"><input id="m1" className="a-input" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} /></Field>
                <Field label="Title" htmlFor="m2"><input id="m2" className="a-input" value={me.title} onChange={(e) => setMe({ ...me, title: e.target.value })} placeholder="e.g. Physiotherapist" /></Field>
              </div>
              <Field label="Speciality" htmlFor="m3" hint="e.g. General practice, Dentistry, Physiotherapy, Psychology"><input id="m3" className="a-input" value={me.speciality} onChange={(e) => setMe({ ...me, speciality: e.target.value })} /></Field>
              <Field label="Languages" htmlFor="m4" hint="Separate with commas"><input id="m4" className="a-input" value={me.langs} onChange={(e) => setMe({ ...me, langs: e.target.value })} /></Field>
              <Field label="About you" htmlFor="m5"><textarea id="m5" className="a-textarea" value={me.bio} onChange={(e) => setMe({ ...me, bio: e.target.value })} placeholder="A few sentences patients will read before booking." /></Field>
            </>
          )}
          {step === 3 && (
            <>
              <div><h1 style={{ fontSize: 28 }}>Your first service</h1><p style={{ color: "var(--ink-2)", marginTop: 4 }}>Start with one. Add more on the Services page.</p></div>
              <Field label="Service name" htmlFor="s1"><input id="s1" className="a-input" value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} /></Field>
              <div className="two-col" style={{ gap: 14 }}>
                <Field label="Duration (minutes)" htmlFor="s2"><input id="s2" type="number" min={5} step={5} className="a-input" value={svc.mins} onChange={(e) => setSvc({ ...svc, mins: e.target.value })} /></Field>
                <Field label="Buffer after (minutes)" htmlFor="s3"><input id="s3" type="number" min={0} step={5} className="a-input" value={svc.buffer} onChange={(e) => setSvc({ ...svc, buffer: e.target.value })} /></Field>
              </div>
              <Field label="Fee (rand, optional)" htmlFor="s4"><input id="s4" type="number" min={0} step={10} className="a-input" value={svc.price} onChange={(e) => setSvc({ ...svc, price: e.target.value })} /></Field>
            </>
          )}
          {step === 4 && (
            <>
              <div><h1 style={{ fontSize: 28 }}>When do you see patients?</h1><p style={{ color: "var(--ink-2)", marginTop: 4 }}>Patients can only book inside these hours. Fine-tune per day later.</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DAYS.map((d, i) => <button key={d} type="button" className="a-chip" aria-pressed={open[i]} onClick={() => setOpen(open.map((o, k) => (k === i ? !o : o)))}>{d}</button>)}
              </div>
              <div className="two-col" style={{ gap: 14 }}>
                <Field label="From" htmlFor="h1"><input id="h1" type="time" className="a-input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="To" htmlFor="h2"><input id="h2" type="time" className="a-input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              </div>
              <Notice tone="info" icon={<Rocket size={18} />}>When you finish, your practice is created as <b>pending</b>. In production a BabyBlue admin activates it; in this demo you can activate it yourself from the dashboard.</Notice>
            </>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
            {step > 1 ? <button className="a-btn ghost" onClick={() => setStep(step - 1)}>Back</button> : <span />}
            {step < 4 ? <button className="a-btn primary" disabled={(step === 1 && !ok1) || (step === 2 && !ok2) || (step === 3 && !ok3)} onClick={() => setStep(step + 1)}>Continue</button> : <Btn className="primary" disabled={!ok4} loading={busy} onClick={finish}>Create my practice</Btn>}
          </div>
        </div>
      </div>
    </div>
  );
}
