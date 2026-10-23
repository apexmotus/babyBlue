"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, FlaskConical, MonitorSmartphone, RotateCcw, ShieldCheck, UserPlus, Users, WifiOff, X, Smartphone } from "lucide-react";
import type { Status, Urgency } from "@/lib/types";
import { DEMO_VISIT_ID } from "@/lib/seed";
import { resetDemo, simulateJoin, useDB } from "@/lib/store";
import { useOffline } from "@/lib/offline";

/* ───── logo ───── */
export function Logo({ href = "/", size = 28 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="logo" aria-label="BabyBlue home">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="bbg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2f86d6" />
            <stop offset="1" stopColor="#0b5aa8" />
          </linearGradient>
        </defs>
        <path d="M16 2.5 4.5 6.6v8.2c0 7.1 4.7 12.3 11.5 14.7 6.8-2.4 11.5-7.6 11.5-14.7V6.6L16 2.5Z" fill="url(#bbg)" />
        <path d="M10.5 16.2l4 4 7.2-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      BabyBlue
    </Link>
  );
}

/* ───── pills ───── */
export const STATUS_LABEL: Record<Status, string> = {
  waiting: "Waiting",
  in_consultation: "In consultation",
  done: "Done",
  cancelled: "Cancelled",
};
export function StatusPill({ status, className = "" }: { status: Status; className?: string }) {
  return <span className={`pill ${status} ${className}`}>{STATUS_LABEL[status]}</span>;
}
export const URGENCY_LABEL: Record<Urgency, string> = { routine: "Routine", soon: "Soon", urgent: "Urgent" };
export function UrgencyPill({ urgency }: { urgency: Urgency }) {
  return <span className={`pill sm ${urgency}`}>{URGENCY_LABEL[urgency]}</span>;
}

/* ───── toast ───── */
interface ToastItem {
  id: number;
  text: string;
}
const ToastCtx = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const n = useRef(0);
  const push = useCallback((text: string) => {
    const id = ++n.current;
    setItems((x) => [...x, { id, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <Check size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───── modal ───── */
export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  small,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  small?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${small ? "sm" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <div>
            <h2>{title}</h2>
            {sub && <p className="muted t13" style={{ marginTop: 4 }}>{sub}</p>}
          </div>
          <button className="x-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* ───── field ───── */
export function Field({ label, hint, error, ok, children }: { label: string; hint?: string; error?: string | false | null; ok?: string | false | null; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error ? <span className="error-text">{error}</span> : ok ? <span className="ok-text">{ok}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export function Banner({ tone = "info", icon, children }: { tone?: "info" | "warn" | "good" | "neutral"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`banner ${tone}`}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <p className="b6 t16">{title}</p>
      {children && <p className="muted" style={{ marginTop: 6 }}>{children}</p>}
    </div>
  );
}

/* ───── demo panel ───── */
export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const { offline, setOffline } = useOffline();
  const toast = useToast();
  const db = useDB();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const demoVisit = db.visits.find((v) => v.id === DEMO_VISIT_ID);
  return (
    <div className="demo-fab" ref={ref}>
      {open && (
        <div className="demo-pop">
          <h4>Patient side</h4>
          <Link href={`/q/${DEMO_VISIT_ID}`} onClick={() => setOpen(false)}>
            <Smartphone size={16} /> Open Thabo&apos;s phone{demoVisit ? "" : " (no longer in queue)"}
          </Link>
          <Link href="/c/rosebank-family" onClick={() => setOpen(false)}>
            <Users size={16} /> Clinic page (QR landing)
          </Link>
          <button
            onClick={() => {
              setOffline(!offline);
              toast(offline ? "Back online" : "Phone is offline — open a queue screen to see it");
            }}
          >
            <WifiOff size={16} /> {offline ? "Go back online" : "Simulate patient offline"}
          </button>
          <h4>Staff side</h4>
          <Link href="/staff" onClick={() => setOpen(false)}>
            <MonitorSmartphone size={16} /> Staff queue dashboard
          </Link>
          <button
            onClick={() => {
              const name = simulateJoin();
              toast(`${name} joined the queue`);
            }}
          >
            <UserPlus size={16} /> Simulate a patient joining
          </button>
          <h4>Demo data</h4>
          <button
            onClick={() => {
              resetDemo();
              toast("Demo data reset");
              setOpen(false);
            }}
          >
            <RotateCcw size={16} /> Reset demo data
          </button>
          <p className="hint" style={{ padding: "4px 10px 8px" }}>
            Everything is made-up and stored in this browser. Open staff and patient views in two tabs — they stay in sync.
          </p>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <FlaskConical size={15} /> Demo
      </button>
    </div>
  );
}

/* little shield badge used on POPIA notes */
export function PopiaNote({ children }: { children: ReactNode }) {
  return (
    <p className="hint" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <ShieldCheck size={15} style={{ flex: "none", marginTop: 1, color: "var(--primary)" }} />
      <span>{children}</span>
    </p>
  );
}
