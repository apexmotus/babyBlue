"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, CalendarDays, ChevronsUpDown, ClipboardList, LayoutDashboard, ListChecks, LogOut, Megaphone, Menu, Plus, Rocket, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Users, UsersRound, X,
} from "lucide-react";
import { DbGate } from "@/components/app/DbGate";
import { Avatar, Btn, Spinner } from "@/components/app/primitives";
import { AppointmentDrawer } from "@/components/os/AppointmentDrawer";
import { CommandPalette } from "@/components/os/CommandPalette";
import { NewAppointmentModal } from "@/components/os/NewAppointmentModal";
import { OsProvider, useOs } from "@/components/os/OsContext";
import { Logo, useToast } from "@/components/ui";
import { friendlyError, mutate, query, resetLocalDb } from "@/local/db";
import { useSession } from "@/local/auth";
import { useQuery } from "@/local/hooks";
import { ROLE_LABEL } from "@/lib/os-data";

const AUTH_PATHS = /^\/practice\/(login|signup)/;

export function OsRoot({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-root os">
      <DbGate>{AUTH_PATHS.test(path) ? children : <Authed>{children}</Authed>}</DbGate>
    </div>
  );
}

function Authed({ children }: { children: ReactNode }) {
  const { session } = useSession("practice");
  const router = useRouter();
  useEffect(() => { if (!session) router.replace("/practice/login"); }, [session, router]);
  if (!session) return <div style={{ display: "grid", placeItems: "center", minHeight: "60dvh" }}><Spinner /></div>;
  return (
    <OsProvider session={session}>
      <Gate>{children}</Gate>
    </OsProvider>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const os = useOs();
  const path = usePathname();
  const router = useRouter();
  const onboarding = path.startsWith("/practice/onboarding");

  useEffect(() => {
    if (os.loading) return;
    if (!os.practice && !onboarding) {
      if (os.platformRole === "platform_admin" && !path.startsWith("/practice/admin") && !path.startsWith("/practice/operator")) router.replace("/practice/admin");
      else if (os.platformRole === "marketing_operator" && !path.startsWith("/practice/operator")) router.replace("/practice/operator");
      else if (!os.platformRole) router.replace("/practice/onboarding");
    }
  }, [os.loading, os.practice, os.platformRole, onboarding, path, router]);

  if (os.loading) return <div style={{ display: "grid", placeItems: "center", minHeight: "60dvh" }}><Spinner /></div>;
  if (onboarding) return <>{children}</>;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const os = useOs();
  const path = usePathname();
  const router = useRouter();
  const { signOut } = useSession("practice");
  const [menu, setMenu] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const pid = os.practice?.id;
  const waiting = useQuery(() => (pid ? query<{ n: number }>(os.uid, "select count(*)::int n from public.queue_entries where practice_id = $1 and status = 'waiting'", [pid]).then((r) => r[0].n) : Promise.resolve(0)), [pid, os.uid], { poll: 6000, enabled: !!pid });

  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((c) => !c); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);

  const owner = os.isOwner;
  const staff = !!os.practice;
  type Item = { href: string; label: string; icon: typeof Search; count?: number; exact?: boolean };
  const groups: { title?: string; items: Item[] }[] = [];
  if (staff) {
    groups.push({ items: [{ href: "/practice", label: "Dashboard", icon: LayoutDashboard, exact: true }] });
    groups.push({ title: "Practice", items: [
      { href: "/practice/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/practice/appointments", label: "Appointments", icon: ClipboardList },
      { href: "/practice/clients", label: "Clients", icon: Users },
      { href: "/practice/queue", label: "Queue (Flow)", icon: ListChecks, count: waiting.data || undefined },
    ] });
    if (owner) groups.push({ title: "Manage", items: [
      { href: "/practice/team", label: "Team & hours", icon: UsersRound },
      { href: "/practice/services", label: "Services", icon: Stethoscope },
      { href: "/practice/insights", label: "Insights", icon: BarChart3 },
      { href: "/practice/growth", label: "Growth", icon: Megaphone },
      { href: "/practice/settings", label: "Settings", icon: Settings },
    ] });
  }
  if (os.platformRole) groups.push({ title: "Platform", items: [
    ...(os.platformRole === "platform_admin" ? [{ href: "/practice/admin", label: "Admin", icon: ShieldCheck }] : []),
    { href: "/practice/operator", label: "Growth operator", icon: Sparkles },
  ] });

  const active = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const Nav = (
    <>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <div className="os-group">{g.title}</div>}
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className="os-nav" aria-current={active(i) ? "page" : undefined}>
              <i.icon /> {i.label}{i.count ? <span className="count">{i.count}</span> : null}
            </Link>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <>
      <div className="os-mobilebar">
        <Logo light size={28} href="/practice" />
        <div style={{ display: "flex", gap: 6 }}>
          <button className="a-btn icon sm" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }} onClick={() => setCmd(true)} aria-label="Search"><Search size={17} /></button>
          <button className="a-btn icon sm" style={{ background: "rgba(255,255,255,.12)", color: "#fff" }} onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}>{menu ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </div>
      {menu && <div className="os-drawer">{Nav}<button className="os-nav" style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => { signOut(); router.push("/practice/login"); }}><LogOut /> Sign out</button></div>}

      <div className="os-shell">
        <aside className="os-side" aria-label="Sidebar">
          <div className="os-brand"><Logo light size={34} href="/practice" /> <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginLeft: 4, letterSpacing: ".08em", fontWeight: 700 }}>OS</span></div>
          {os.practice ? (
            <div style={{ position: "relative" }}>
              <button className="os-switch" onClick={() => setSwitcher((s) => !s)} aria-expanded={switcher}>
                <Avatar name={os.practice.name} size={34} />
                <span style={{ flex: 1, minWidth: 0 }}><b>{os.practice.name}</b><small>{ROLE_LABEL[os.practice.role]}{os.practice.status !== "active" ? " · not live" : ""}</small></span>
                {os.practices.length > 1 && <ChevronsUpDown size={16} />}
              </button>
              {switcher && os.practices.length > 1 && (
                <div className="pt-menu-pop" style={{ left: 0, right: "auto", width: "100%" }}>
                  {os.practices.map((p) => <button key={p.id} onClick={() => { os.setPracticeId(p.id); setSwitcher(false); }}>{p.name}</button>)}
                </div>
              )}
            </div>
          ) : <div style={{ height: 8 }} />}
          {Nav}
          <div className="os-user">
            <div className="os-user-row">
              <Avatar name={os.session.name} size={34} />
              <span style={{ minWidth: 0, flex: 1 }}><b style={{ display: "block", color: "#fff", fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{os.session.name}</b><small style={{ color: "rgba(255,255,255,.55)", fontSize: 11.5 }}>{os.session.email}</small></span>
            </div>
            <button className="os-nav" style={{ background: "none", border: 0, cursor: "pointer", width: "100%" }} onClick={() => { signOut(); router.push("/practice/login"); }}><LogOut /> Sign out</button>
            <button className="os-nav" style={{ background: "none", border: 0, cursor: "pointer", width: "100%", fontSize: 12.5, opacity: .7 }} onClick={() => resetLocalDb()}>Reset demo data</button>
          </div>
        </aside>

        <div className="os-main">
          <div className="os-top">
            {os.practice && <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{os.practice.name}</span>}
            <span className="grow" />
            <button className="os-cmd" onClick={() => setCmd(true)} aria-label="Search or jump to"><Search size={16} /> Search clients, jump to…<kbd>Ctrl K</kbd></button>
            {staff && <Btn className="primary sm" onClick={() => os.newAppointment()}><Plus size={16} /> New appointment</Btn>}
          </div>
          <main className="os-content" id="main">
            <DemoNote />
            {os.practice && os.practice.status !== "active" && <ActivateBanner />}
            {children}
          </main>
        </div>
      </div>
      {cmd && <CommandPalette onClose={() => setCmd(false)} />}
      <NewAppointmentModal />
      <AppointmentDrawer />
    </>
  );
}

function DemoNote() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="a-notice neutral" style={{ marginBottom: 18, alignItems: "center" }} role="note">
      <ShieldCheck size={18} />
      <div style={{ flex: 1 }}><b>Demo environment.</b> Every practice, client and number here is fictional and stored only in this browser.</div>
      <button className="a-link" onClick={() => setOpen(false)}>Dismiss</button>
    </div>
  );
}

function ActivateBanner() {
  const os = useOs();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="a-notice warn" style={{ marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
      <Rocket size={20} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <b>{os.practice!.status === "pending" ? "Your practice isn't live yet." : "This practice is suspended."}</b> Patients can&apos;t find or book you until a platform admin activates it.
      </div>
      {os.practice!.status === "pending" && os.isOwner && (
        <Btn className="primary sm" loading={busy} onClick={async () => {
          setBusy(true);
          try { await mutate(os.uid, "select public.demo_activate_practice($1)", [os.practice!.id]); toast("Practice is live in the demo"); } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
        }}>Activate (demo shortcut)</Btn>
      )}
    </div>
  );
}
