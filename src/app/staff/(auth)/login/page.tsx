"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Field, Logo } from "@/components/ui";
import { signIn, useDB } from "@/lib/store";

export default function Login() {
  const db = useDB();
  const router = useRouter();
  const [email, setEmail] = useState("reception@rosebankfamily.co.za");
  const [pw, setPw] = useState("demo-password");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg)" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Logo size={34} />
          <h1 style={{ fontSize: 22, letterSpacing: -0.5, marginTop: 18, lineHeight: 1.25 }}>
            One live list for the front desk, one honest estimate for the patient.
          </h1>
          <p className="muted t13" style={{ marginTop: 8 }}>
            {db.settings.name} · {db.settings.staff.length} staff accounts · POPIA operator agreement signed 4 March 2026
          </p>
        </div>
        <form
          className="card r16"
          style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Use your practice email address.");
            if (pw.length < 6) return setErr("Password must be at least 6 characters.");
            signIn(email.trim());
            router.push("/staff");
          }}
        >
          <div>
            <h2 style={{ fontSize: 20, letterSpacing: -0.3 }}>Sign in</h2>
            <p className="muted t13" style={{ marginTop: 4 }}>Use your practice email address.</p>
          </div>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} autoComplete="username" />
          </Field>
          <Field label="Password" error={err}>
            <div style={{ position: "relative" }}>
              <input className="input" type={show ? "text" : "password"} value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} autoComplete="current-password" style={{ paddingRight: 48 }} />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} style={{ position: "absolute", right: 4, top: 4, width: 40, height: 40, border: 0, background: "none", color: "var(--ink-3)" }}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <button className="btn btn-primary lg" type="submit">Sign in</button>
          <div className="flex between t13">
            <button type="button" className="btn-link" onClick={() => setErr("Demo: password reset isn't wired up. Any password of 6+ characters signs in.")}>Forgot password</button>
            <Link href="/staff/onboarding">New practice? Sign up</Link>
          </div>
        </form>
        <p className="hint flex center gap8" style={{ justifyContent: "center", marginTop: 16 }}>
          <ShieldCheck size={14} /> Demo sign-in is pre-filled — just press Sign in.
        </p>
      </div>
    </div>
  );
}
