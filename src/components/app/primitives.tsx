"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { initials } from "@/lib/format";

export function Avatar({ name, size = 44, className = "" }: { name: string; size?: number; className?: string }) {
  const v = (name.charCodeAt(0) + name.length) % 5 + 1;
  return (
    <span className={`a-avatar v${v} ${className}`} style={{ ["--s" as string]: `${size}px` }} aria-hidden="true">
      {initials(name) || "?"}
    </span>
  );
}

export function Badge({ tone = "neutral", dot, children }: { tone?: "neutral" | "info" | "good" | "warn" | "bad" | "deep"; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`a-badge ${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Skel({ w = "100%", h = 16, r, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="a-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="a-empty">
      <div className="ic">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", icon, children }: { tone?: "info" | "good" | "warn" | "bad" | "neutral"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`a-notice ${tone}`} role={tone === "bad" ? "alert" : undefined}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <div className="a-orbit" role="status" aria-label="Loading" />;
}

/** Accessible modal dialog: Esc closes, focus moves in and returns, page scroll is locked. */
export function Sheet({ title, sub, onClose, children, footer, size, labelledBy }: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "narrow" | "wide"; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])");
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="a-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`a-sheet ${size ?? ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? "sheet-title"} tabIndex={-1}>
        <div className="a-sheet-h">
          <div>
            <h2 id="sheet-title">{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button className="a-btn ghost icon sm" onClick={onClose} aria-label="Close" data-close>
            <X size={18} />
          </button>
        </div>
        <div className="a-sheet-b">{children}</div>
        {footer && <div className="a-sheet-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, sub, onClose, children, footer }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="a-drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} className="a-drawer" role="dialog" aria-modal="true" aria-label="Details" tabIndex={-1}>
        <div className="a-drawer-h">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 20 }}>{title}</h2>
            {sub && <div style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 3 }}>{sub}</div>}
          </div>
          <button className="a-btn ghost icon sm" onClick={onClose} aria-label="Close panel">
            <X size={18} />
          </button>
        </div>
        <div className="a-drawer-b">{children}</div>
        {footer && <div className="a-drawer-f">{footer}</div>}
      </aside>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | false | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="a-field">
      <label className="a-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="a-error" role="alert">{error}</span> : hint ? <span className="a-hint">{hint}</span> : null}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="a-switch" onClick={() => onChange(!on)} />;
}

export function Btn({ loading, className = "", children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button {...rest} className={`a-btn ${className} ${loading ? "loading" : ""}`} disabled={rest.disabled || loading}>
      {children}
    </button>
  );
}
