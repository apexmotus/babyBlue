"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Clock, EyeOff, MapPin, Users } from "lucide-react";
import { Btn, Empty, Field, Notice } from "@/components/app/primitives";
import { Logo } from "@/components/ui";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

export default function JoinQueue() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const info = useQuery(() => query<{ practice_name: string; address: string | null; city: string | null; waiting: number; accepting: boolean }>(null, "select * from public.public_queue_info($1)", [slug]).then((r) => r[0] ?? null), [slug], { poll: 8000 });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const i = info.data;
  if (info.loading && info.data === undefined) return <div style={{ maxWidth: 460, margin: "40px auto", padding: 20 }}><div className="a-card pad"><div className="a-skel" style={{ height: 300 }} /></div></div>;
  if (!i) return <div style={{ maxWidth: 460, margin: "40px auto", padding: 20 }}><div className="a-card"><Empty icon={<Users size={28} />} title="This queue isn't available" action={<Link href="/patient" className="a-btn primary">Find a practitioner</Link>}>The QR code may be out of date, or the practice isn&apos;t open for walk-ins.</Empty></div></div>;

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Please enter your name.");
    setBusy(true);
    setError("");
    try {
      const [{ token }] = await mutate<{ token: string }>(null, "select public.join_queue($1, $2, $3) as token", [slug, name.trim(), phone.trim() || null]);
      router.push(`/patient/queue/${token}`);
    } catch (err) { setError(friendlyError(err)); setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "28px 20px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ textAlign: "center" }}><Logo size={30} /></div>
      <div className="a-card pad" style={{ textAlign: "center", background: "linear-gradient(160deg,#eaf5f8,#e8f4ee)", border: 0 }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--info)", textTransform: "uppercase", letterSpacing: ".08em" }}>You&apos;re joining the queue at</p>
        <h1 style={{ fontSize: 26, marginTop: 6 }}>{i.practice_name}</h1>
        <p style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 4, display: "flex", gap: 5, justifyContent: "center", alignItems: "center" }}><MapPin size={14} /> {i.address}, {i.city}</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 18 }}>
          <div><b className="tnum" style={{ fontFamily: "var(--font-head)", fontSize: 30, color: "var(--deep)" }}>{i.waiting}</b><p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>waiting now</p></div>
          <div><b className="tnum" style={{ fontFamily: "var(--font-head)", fontSize: 30, color: "var(--deep)" }}>{i.waiting === 0 ? "<10" : `${Math.max(1, i.waiting) * 10}+`}</b><p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>est. minutes</p></div>
        </div>
        <p className="a-hint" style={{ marginTop: 10 }}>Estimates are a guide, not a booked time.</p>
      </div>
      <form className="a-card pad" onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
        <Field label="Your name" htmlFor="n"><input id="n" className="a-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="Mobile number (optional)" htmlFor="p" hint="So the practice can reach you if you step out."><input id="p" className="a-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <Btn type="submit" className="primary lg block" loading={busy}><Clock size={19} /> Join the queue</Btn>
      </form>
      <p className="a-hint" style={{ textAlign: "center", display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}><EyeOff size={14} /> Other patients never see your name, and you won&apos;t be asked why you&apos;re here.</p>
    </div>
  );
}
