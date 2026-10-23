"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Field, Logo } from "@/components/ui";
import { completeOnboarding, useDB } from "@/lib/store";
import { validPhone } from "@/lib/util";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
const TAKEN = ["rosebank-family-practice", "parktown-north-dental", "melville-community-clinic", "killarney-medical-centre"];

export default function Onboarding() {
  const db = useDB();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [tried, setTried] = useState(false);
  const [name, setName] = useState("Rosebank Family Practice");
  const [slug, setSlug] = useState("rosebank-family");
  const [slugTouched, setSlugTouched] = useState(false);
  const [address, setAddress] = useState(db.settings.address);
  const [phone, setPhone] = useState(db.settings.phone);
  const [avg, setAvg] = useState(15);
  const [first, setFirst] = useState(db.profile.first);
  const [last, setLast] = useState(db.profile.last);
  const [mobile, setMobile] = useState(db.profile.mobile);
  const [hpcsa, setHpcsa] = useState(db.profile.hpcsa);
  const [ack, setAck] = useState(true);

  const slugOk = slug.length >= 3 && !TAKEN.includes(slug);
  const e1 = { name: !name.trim(), slug: !slugOk, address: address.trim().length < 6, phone: !validPhone(phone) };
  const e2 = { first: !first.trim(), last: !last.trim(), mobile: !validPhone(mobile) };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="flex between center">
          <Logo />
          <Link href="/staff/login" className="t13 muted">Back to sign in</Link>
        </div>
        <ol className="flex gap16 center" style={{ listStyle: "none", padding: 0, margin: "28px 0 20px" }}>
          {["Practice", "Your profile"].map((l, i) => (
            <li key={l} className="flex center gap8" style={{ color: step === i + 1 ? "var(--ink)" : "var(--ink-3)", fontWeight: 600 }}>
              <span className="step-n" style={{ background: step > i + 1 ? "var(--accent)" : step === i + 1 ? "var(--primary)" : "var(--border)", color: step === i + 1 || step > i + 1 ? "#fff" : "var(--ink-3)", width: 28, height: 28 }}>
                {step > i + 1 ? <Check size={15} /> : i + 1}
              </span>
              {l}
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <div className="card r16" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 22, letterSpacing: -0.4 }}>Set up your practice</h1>
              <p className="muted t13" style={{ marginTop: 4 }}>This is what patients see when they scan your code. You can change all of it later.</p>
            </div>
            <Field label="Practice name" error={tried && e1.name && "Enter the practice name"}>
              <input className="input" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
            </Field>
            <Field
              label="Patient link"
              error={tried && e1.slug && (TAKEN.includes(slug) ? "That link is taken" : "Use at least 3 characters")}
              ok={!e1.slug && "Available"}
            >
              <div className="flex center" style={{ border: "1px solid var(--border)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
                <span className="muted t13" style={{ padding: "0 4px 0 14px", whiteSpace: "nowrap" }}>bby.co.za/c/</span>
                <input className="input" style={{ border: 0, boxShadow: "none", paddingLeft: 0 }} value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
              </div>
            </Field>
            <Field label="Street address" error={tried && e1.address && "Enter the street address"}>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="Reception phone" error={tried && e1.phone && "Enter a South African phone number"}>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Average consult duration" hint="Used for the first estimates until we've watched a few real days.">
              <select className="select" value={avg} onChange={(e) => setAvg(Number(e.target.value))}>
                {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} minutes</option>)}
              </select>
            </Field>
            <div className="flex between" style={{ marginTop: 6 }}>
              <Link href="/staff/login" className="btn btn-ghost">Back</Link>
              <button className="btn btn-primary" onClick={() => { setTried(true); if (!Object.values(e1).some(Boolean)) { setTried(false); setStep(2); } }}>Continue</button>
            </div>
          </div>
        ) : (
          <div className="card r16" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 22, letterSpacing: -0.4 }}>Your staff profile</h1>
              <p className="muted t13" style={{ marginTop: 4 }}>Your name shows on the queue log when you call or cancel a patient.</p>
            </div>
            <div className="two-col">
              <Field label="First name" error={tried && e2.first && "Required"}><input className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
              <Field label="Last name" error={tried && e2.last && "Required"}><input className="input" value={last} onChange={(e) => setLast(e.target.value)} /></Field>
            </div>
            <Field label="Mobile number" error={tried && e2.mobile && "Enter a South African mobile number"}><input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" /></Field>
            <Field label="HPCSA number (optional)"><input className="input" value={hpcsa} onChange={(e) => setHpcsa(e.target.value)} /></Field>
            <div className="banner info">
              <ShieldCheck size={16} />
              <div>You&apos;ll be set as Admin — the only role that can change settings and add staff. Your practice is created as pending and goes live once it&apos;s approved. You can invite reception and clinician accounts after that.</div>
            </div>
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              By continuing you confirm you&apos;re authorised to process patient information for this practice under POPIA.
            </label>
            {tried && !ack && <span className="error-text">Please confirm to continue.</span>}
            <div className="flex between" style={{ marginTop: 6 }}>
              <button className="btn btn-ghost" onClick={() => { setTried(false); setStep(1); }}>Back</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setTried(true);
                  if (Object.values(e2).some(Boolean) || !ack) return;
                  completeOnboarding(
                    { name: name.trim(), slug, address: address.trim(), phone: phone.trim(), avgConsult: avg },
                    { first: first.trim(), last: last.trim(), mobile: mobile.trim(), hpcsa: hpcsa.trim() },
                  );
                  router.push("/staff");
                }}
              >
                Go to queue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
