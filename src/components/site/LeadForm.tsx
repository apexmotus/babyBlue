"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";

type Status = "idle" | "sending" | "done" | "not_configured" | "error";

const TOPICS = [
  ["general", "General question"],
  ["practitioner-partnership", "Practitioner partnership"],
  ["growth-services", "Marketing & Growth services"],
  ["support", "Support"],
  ["press", "Press"],
  ["privacy-request", "Privacy request (POPIA)"],
] as const;

/** Contact form. Posts to /api/leads, which validates again on the server. */
export function LeadForm() {
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const path = usePathname();
  const first = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      kind: "contact",
      name: f.get("name"),
      email: f.get("email"),
      topic: f.get("topic"),
      message: f.get("message"),
      consent: f.get("consent") === "on",
      website: f.get("website"),
      sourcePath: path,
    };
    setStatus("sending");
    setErrors({});
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.status === 201) return setStatus("done");
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data.errors) {
        setErrors(data.errors);
        setStatus("idle");
        requestAnimationFrame(() => first.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
        return;
      }
      setStatus(res.status === 503 ? "not_configured" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="x-notice ok" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div>
          <strong style={{ display: "block", fontFamily: "var(--font-head)", fontSize: "1.15rem", marginBottom: 4 }}>Message received.</strong>
          Thank you. We&apos;ll reply to the email address you gave us. For anything urgent about your health, please contact a practitioner or emergency services directly.
        </div>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  const field = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${id}-${k}-err` : undefined }) as const;
  const Err = ({ k }: { k: string }) => (err(k) ? <span id={`${id}-${k}-err`} className="x-err" role="alert">{err(k)}</span> : null);

  return (
    <form ref={first} className="x-form" onSubmit={submit} noValidate>
      <div className="row">
        <div className="x-field">
          <label htmlFor={`${id}-name`}>Your name</label>
          <input id={`${id}-name`} name="name" className="x-input" autoComplete="name" required {...field("name")} />
          <Err k="name" />
        </div>
        <div className="x-field">
          <label htmlFor={`${id}-email`}>Email address</label>
          <input id={`${id}-email`} name="email" type="email" className="x-input" autoComplete="email" inputMode="email" required {...field("email")} />
          <Err k="email" />
        </div>
      </div>

      <div className="x-field">
        <label htmlFor={`${id}-topic`}>What can we help with?</label>
        <select id={`${id}-topic`} name="topic" className="x-input" defaultValue="" required {...field("topic")}>
          <option value="" disabled>Select a topic…</option>
          {TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Err k="topic" />
      </div>
      <div className="x-field">
        <label htmlFor={`${id}-msg`}>Message</label>
        <textarea id={`${id}-msg`} name="message" className="x-input" required {...field("message")} />
        <span className="x-small">Please don&apos;t include health information in this message.</span>
        <Err k="message" />
      </div>

      <div className="x-hp" aria-hidden="true">
        <label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div className="x-field">
        <label className="x-consent">
          <input type="checkbox" name="consent" {...field("consent")} />
          <span>I agree that BabyBlue may use these details to reply to my message. See the <a href="/privacy">privacy policy</a>.</span>
        </label>
        <Err k="consent" />
      </div>

      {status === "not_configured" && (
        <div className="x-notice warn" role="alert">
          <Info size={20} aria-hidden="true" />
          <div>
            <strong>The contact form isn&apos;t switched on for this demo yet.</strong> Nothing you typed was saved. The site owner needs to connect the database (see <code>.env.example</code>) before it can store messages.
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="x-notice err" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div>Something went wrong and your message wasn&apos;t saved. Please try again in a moment.</div>
        </div>
      )}

      <div>
        <button className="x-btn x-btn-primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? (
            <>
              <Loader2 size={18} className="spin" aria-hidden="true" /> Sending…
            </>
          ) : (
            "Send message"
          )}
        </button>
      </div>
    </form>
  );
}
