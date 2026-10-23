"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, LogOut, Search, UserRound } from "lucide-react";
import { DbGate } from "@/components/app/DbGate";
import { Avatar } from "@/components/app/primitives";
import { Logo } from "@/components/ui";
import { useSession } from "@/local/auth";
import { resetLocalDb } from "@/local/db";

const TABS = [
  { href: "/patient", label: "Discover", icon: Search, match: (p: string) => p === "/patient" || p.startsWith("/patient/search") || p.startsWith("/patient/p/") || p.startsWith("/patient/book") },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarDays, match: (p: string) => p.startsWith("/patient/appointments") },
  { href: "/patient/account", label: "Account", icon: UserRound, match: (p: string) => p.startsWith("/patient/account") },
] as const;

export function PatientRoot({ children }: { children: ReactNode }) {
  const path = usePathname();
  const bare = /^\/patient\/(login|signup)/.test(path) || /^\/patient\/(join|queue)\//.test(path);
  return (
    <div className="app-root pt">
      <DbGate>
        <DemoStrip />
        <Header bare={bare} />
        <main className={bare ? "" : "pt-main"} id="main">
          {children}
        </main>
        {!bare && <TabBar />}
      </DbGate>
    </div>
  );
}

function DemoStrip() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="a-demo" role="note">
      <span>
        <b>Demo environment.</b> Every practitioner, patient and figure is fictional and lives only in this browser.
      </span>
      <button onClick={() => resetLocalDb()}>Reset demo data</button>
      <button onClick={() => setOpen(false)} aria-label="Dismiss notice">Dismiss</button>
    </div>
  );
}

function Header({ bare }: { bare: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const { session, signOut } = useSession("patient");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  return (
    <header className="pt-header">
      <div className="pt-header-in">
        <Logo href="/patient" size={32} />
        {!bare && (
          <nav className="pt-nav" aria-label="Main">
            {TABS.slice(0, 2).map((t) => (
              <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}>{t.label}</Link>
            ))}
          </nav>
        )}
        <div className="pt-user" ref={ref}>
          {session ? (
            <div className="pt-menu">
              <button className="pt-menu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
                <Avatar name={session.name} size={32} />
                <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name.split(" ")[0]}</span>
                <ChevronDown size={16} />
              </button>
              {open && (
                <div className="pt-menu-pop" role="menu">
                  <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid var(--line-2)", marginBottom: 6 }}>
                    <p style={{ fontWeight: 700, color: "var(--deep)", fontSize: 14 }}>{session.name}</p>
                    <p style={{ fontSize: 12.5, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis" }}>{session.email}</p>
                  </div>
                  <Link href="/patient/appointments" role="menuitem"><CalendarDays size={17} /> My appointments</Link>
                  <Link href="/patient/account" role="menuitem"><UserRound size={17} /> Account</Link>
                  <button role="menuitem" onClick={() => { signOut(); router.push("/patient"); }}><LogOut size={17} /> Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href={`/patient/login?next=${encodeURIComponent(path)}`} className="a-btn ghost sm">Sign in</Link>
              <Link href="/patient/signup" className="a-btn primary sm">Create account</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function TabBar() {
  const path = usePathname();
  return (
    <nav className="pt-tabbar" aria-label="Main">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}>
          <t.icon />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
