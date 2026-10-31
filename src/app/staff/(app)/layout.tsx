"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ListChecks, LogOut, Settings, UserRound, Users } from "lucide-react";
import { Logo } from "@/components/ui";
import { signOut, useDB } from "@/lib/store";
import { initials } from "@/lib/util";

const NAV = [
  { href: "/staff", label: "Queue", icon: ListChecks, match: (p: string) => p === "/staff" || p.startsWith("/staff/visit") },
  { href: "/staff/patients", label: "Patients", icon: Users, match: (p: string) => p.startsWith("/staff/patients") },
  { href: "/staff/profile", label: "My profile", icon: UserRound, match: (p: string) => p.startsWith("/staff/profile") },
];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const db = useDB();
  const path = usePathname();
  const router = useRouter();
  const hydrated = db.startedAt > 0;

  useEffect(() => {
    if (hydrated && !db.session) router.replace("/staff/login");
  }, [hydrated, db.session, router]);

  if (!hydrated || !db.session) {
    return <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}><span className="live-dot" /></div>;
  }
  const settingsOn = path.startsWith("/staff/settings");
  const name = db.session.name;
  const [f, ...rest] = name.split(" ");
  return (
    <div className="s-shell">
      <aside className="s-side">
        <div style={{ padding: "0 8px 4px" }}><Logo href="/staff" /></div>
        <p className="muted t12" style={{ padding: "0 8px 14px" }}>{db.settings.name}</p>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`s-nav ${n.match(path) ? "on" : ""}`}>
            <n.icon size={18} /> {n.label}
          </Link>
        ))}
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--ink-3)", padding: "16px 12px 4px", fontWeight: 600 }}>Admin</p>
        <Link href="/staff/settings" className={`s-nav ${settingsOn ? "on" : ""}`}>
          <Settings size={18} /> Settings
        </Link>
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div className="flex center gap12" style={{ padding: "0 6px" }}>
            <span className="avatar">{initials(f, rest.join(" "))}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <p className="b6 t13" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</p>
              <p className="muted t12">{db.profile.role}</p>
            </div>
          </div>
          <button
            className="s-nav"
            style={{ width: "100%", border: 0, background: "none", marginTop: 8 }}
            onClick={() => {
              signOut();
              router.push("/staff/login");
            }}
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <div>
        <nav className="s-mobilebar" aria-label="Staff">
          {NAV.map((n) => <Link key={n.href} href={n.href} className={n.match(path) ? "on" : ""}>{n.label}</Link>)}
          <Link href="/staff/settings" className={settingsOn ? "on" : ""}>Settings</Link>
          <button className="tbtn" onClick={() => { signOut(); router.push("/staff/login"); }}>Sign out</button>
        </nav>
        <main className="s-main">{children}</main>
      </div>
    </div>
  );
}
