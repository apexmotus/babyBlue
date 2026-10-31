"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Notice, Sheet } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { fmtDayMonth, relativeDay } from "@/lib/format";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Row { id: string; name: string; phone: string | null; email: string | null; consent: boolean; last_visit: Date | null; next_appt: Date | null; visits: number; created_at: Date }

export default function ClientsPage() {
  const os = useOs();
  const router = useRouter();
  const pid = os.practice?.id ?? "";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "recent" | "visits">("name");
  const [add, setAdd] = useState(false);
  const [limit, setLimit] = useState(50);

  const rows = useQuery(() => query<Row>(os.uid, `select c.id, trim(c.first_name || ' ' || c.last_name) name, c.phone, c.email, c.consent_record_storage consent, c.created_at,
      (select max(a.starts_at) from public.appointments a where a.client_id = c.id and a.status = 'completed') last_visit,
      (select min(a.starts_at) from public.appointments a where a.client_id = c.id and a.status in ('booked','confirmed','checked_in') and a.starts_at > now()) next_appt,
      (select count(*)::int from public.appointments a where a.client_id = c.id and a.status = 'completed') visits
    from public.clients c where c.practice_id = $1`, [pid]), [pid, os.uid], { enabled: !!pid });

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    let r = (rows.data ?? []).filter((c) => !n || `${c.name} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase().includes(n));
    r = [...r].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "visits" ? b.visits - a.visits : (b.last_visit?.getTime() ?? 0) - (a.last_visit?.getTime() ?? 0));
    return r;
  }, [rows.data, q, sort]);

  return (
    <>
      <div className="os-page-h">
        <div><h1>Clients</h1><p>{rows.data ? `${rows.data.length} clients` : "Loading…"} · contact details, consent and history, kept simple.</p></div>
        <Btn className="primary" onClick={() => setAdd(true)}><UserPlus size={17} /> Add client</Btn>
      </div>
      <div className="os-toolbar">
        <div className="a-input-wrap"><Search size={16} /><input className="a-input sm" placeholder="Search by name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" /></div>
        <div className="a-seg">{([["name", "A–Z"], ["recent", "Recently seen"], ["visits", "Most visits"]] as const).map(([k, l]) => <button key={k} aria-selected={sort === k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>)}</div>
      </div>
      <div className="a-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="os-table">
            <thead><tr><th>Client</th><th>Contact</th><th>Last visit</th><th>Next appointment</th><th style={{ textAlign: "right" }}>Visits</th><th>Record consent</th></tr></thead>
            <tbody>
              {rows.loading && !rows.data && [0, 1, 2, 3].map((i) => <tr key={i}><td colSpan={6}><div className="a-skel" style={{ height: 24 }} /></td></tr>)}
              {list.slice(0, limit).map((c) => (
                <tr key={c.id} className="click" onClick={() => router.push(`/practice/clients/${c.id}`)} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && router.push(`/practice/clients/${c.id}`)}>
                  <td><span style={{ display: "flex", gap: 12, alignItems: "center" }}><Avatar name={c.name} size={38} /><b style={{ color: "var(--deep)" }}>{c.name}</b></span></td>
                  <td style={{ color: "var(--ink-2)", fontSize: 13.5 }}>{c.phone}<br />{c.email}</td>
                  <td>{c.last_visit ? <span><b style={{ color: "var(--deep)" }}>{relativeDay(c.last_visit)}</b><br /><span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{fmtDayMonth(c.last_visit)}</span></span> : <span style={{ color: "var(--ink-3)" }}>—</span>}</td>
                  <td>{c.next_appt ? <Badge tone="info">{relativeDay(c.next_appt)}</Badge> : <span style={{ color: "var(--ink-3)" }}>—</span>}</td>
                  <td className="tnum" style={{ textAlign: "right" }}>{c.visits}</td>
                  <td>{c.consent ? <Badge tone="good" dot>Given</Badge> : <Badge>Not given</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.loading && list.length === 0 && <Empty icon={<Users size={28} />} title={q ? "No clients match" : "No clients yet"} action={<Btn className="primary" onClick={() => setAdd(true)}>Add a client</Btn>}>{q ? "Try a different search." : "Clients appear here automatically when patients book, or you can add them yourself."}</Empty>}
      </div>
      {list.length > limit && <div style={{ textAlign: "center", marginTop: 16 }}><button className="a-btn secondary" onClick={() => setLimit((l) => l + 50)}>Show more</button></div>}
      {add && <AddClient onClose={() => setAdd(false)} />}
    </>
  );
}

function AddClient({ onClose }: { onClose: () => void }) {
  const os = useOs();
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ first: "", last: "", phone: "", email: "", consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!f.first.trim()) return setError("Enter the client's first name.");
    setBusy(true);
    try {
      const [c] = await mutate<{ id: string }>(os.uid, "insert into public.clients (practice_id, first_name, last_name, phone, email, consent_record_storage, consent_at) values ($1, $2, $3, nullif($4, ''), nullif($5, ''), $6, case when $6 then now() end) returning id",
        [os.practice!.id, f.first.trim(), f.last.trim(), f.phone.trim(), f.email.trim(), f.consent]);
      toast("Client added");
      onClose();
      router.push(`/practice/clients/${c.id}`);
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }
  return (
    <Sheet title="Add client" onClose={onClose} footer={<><button className="a-btn ghost" onClick={onClose}>Cancel</button><Btn className="primary" loading={busy} onClick={save}>Add client</Btn></>}>
      <div className="two-col" style={{ gap: 12 }}>
        <Field label="First name" htmlFor="f1"><input id="f1" className="a-input" value={f.first} onChange={(e) => set("first", e.target.value)} /></Field>
        <Field label="Last name" htmlFor="f2"><input id="f2" className="a-input" value={f.last} onChange={(e) => set("last", e.target.value)} /></Field>
        <Field label="Mobile" htmlFor="f3"><input id="f3" className="a-input" value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" /></Field>
        <Field label="Email" htmlFor="f4"><input id="f4" className="a-input" value={f.email} onChange={(e) => set("email", e.target.value)} inputMode="email" /></Field>
      </div>
      <label className="a-check"><input type="checkbox" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} /> The client has consented to the practice storing their visit records</label>
      {error && <Notice tone="bad">{error}</Notice>}
    </Sheet>
  );
}
