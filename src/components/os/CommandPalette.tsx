"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarDays, ClipboardList, LayoutDashboard, ListChecks, Megaphone, Plus, Settings, Stethoscope, User, Users, UsersRound } from "lucide-react";
import { useOs } from "@/components/os/OsContext";
import { query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Item { id: string; group: string; label: string; hint?: string; icon: typeof Users; run: () => void }

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const os = useOs();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const clients = useQuery(
    () => (os.practice && q.trim().length >= 2 ? query<{ id: string; name: string; phone: string | null }>(os.uid, "select id, trim(first_name || ' ' || last_name) name, phone from public.clients where practice_id = $1 and (first_name || ' ' || last_name ilike $2 or phone ilike $2) order by first_name limit 6", [os.practice.id, `%${q.trim()}%`]) : Promise.resolve([])),
    [q, os.practice?.id, os.uid],
  );

  const go = (href: string) => () => { onClose(); router.push(href); };
  const items = useMemo<Item[]>(() => {
    const nav: Item[] = os.practice ? [
      { id: "new", group: "Actions", label: "New appointment", icon: Plus, run: () => { onClose(); os.newAppointment(); } },
      { id: "dash", group: "Go to", label: "Dashboard", icon: LayoutDashboard, run: go("/practice") },
      { id: "cal", group: "Go to", label: "Calendar", icon: CalendarDays, run: go("/practice/calendar") },
      { id: "appts", group: "Go to", label: "Appointments", icon: ClipboardList, run: go("/practice/appointments") },
      { id: "clients", group: "Go to", label: "Clients", icon: Users, run: go("/practice/clients") },
      { id: "queue", group: "Go to", label: "Queue (Flow)", icon: ListChecks, run: go("/practice/queue") },
      ...(os.isOwner ? [
        { id: "team", group: "Go to", label: "Team & hours", icon: UsersRound, run: go("/practice/team") },
        { id: "svc", group: "Go to", label: "Services", icon: Stethoscope, run: go("/practice/services") },
        { id: "ins", group: "Go to", label: "Insights", icon: BarChart3, run: go("/practice/insights") },
        { id: "gr", group: "Go to", label: "Growth", icon: Megaphone, run: go("/practice/growth") },
        { id: "set", group: "Go to", label: "Settings", icon: Settings, run: go("/practice/settings") },
      ] : []),
    ] : [];
    const needle = q.trim().toLowerCase();
    const filtered = nav.filter((n) => !needle || n.label.toLowerCase().includes(needle));
    const cl: Item[] = (clients.data ?? []).map((c) => ({ id: c.id, group: "Clients", label: c.name, hint: c.phone ?? "", icon: User, run: go(`/practice/clients/${c.id}`) }));
    return [...cl, ...filtered];
  }, [q, clients.data, os.practice, os.isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel(0), [q]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run(); }
    else if (e.key === "Escape") onClose();
  };

  let last = "";
  return (
    <div className="a-overlay" style={{ alignItems: "flex-start" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKey}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients or jump to a page…" aria-label="Search" />
        <ul role="listbox">
          {items.length === 0 && <li style={{ padding: 18, color: "var(--ink-3)" }}>No results</li>}
          {items.map((it, i) => {
            const head = it.group !== last ? <div className="grp" key={`g-${it.group}`}>{it.group}</div> : null;
            last = it.group;
            return (
              <li key={it.id}>
                {head}
                <button role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={it.run}>
                  <it.icon size={17} color="#1d6f86" /> <span style={{ flex: 1 }}>{it.label}</span>{it.hint && <span style={{ color: "var(--ink-3)", fontSize: 13 }}>{it.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
