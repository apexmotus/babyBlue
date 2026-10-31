"use client";

import { useState } from "react";
import { Building2, ScrollText, ShieldCheck, UserCog } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Notice } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { fmtDayMonth, fmtTime, relativeDay } from "@/lib/format";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Item { kind: "practice" | "practitioner"; id: string; practice_id: string; practice_name: string; label: string; detail: string; status: string; created_at: Date }
interface Log { id: number; at: Date; action: string; entity: string; meta: Record<string, unknown>; actor_name: string | null; practice_name: string | null }

const PRACTICE_TONE = { active: "good", pending: "warn", suspended: "bad" } as const;
const VERIF_TONE = { verified: "good", pending: "warn", rejected: "bad", unverified: "neutral" } as const;

export default function AdminPage() {
  const os = useOs();
  const toast = useToast();
  const [tab, setTab] = useState<"practices" | "verification" | "roles" | "audit">("practices");
  const ov = useQuery(() => query<Item>(os.uid, "select kind, id, practice_id, practice_name, label, detail, status, created_at from public.admin_overview()"), [os.uid], { poll: 8000 });
  const audit = useQuery(() => query<Log>(os.uid, `select a.id, a.at, a.action, a.entity, a.meta, p.full_name actor_name, pr.name practice_name
      from public.audit_log a left join public.profiles p on p.id = a.actor_id left join public.practices pr on pr.id = a.practice_id order by a.at desc limit 100`), [os.uid, tab], { poll: 10000 });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("marketing_operator");
  const [busy, setBusy] = useState(false);

  if (os.platformRole !== "platform_admin") return <div className="a-card"><Empty icon={<ShieldCheck size={28} />} title="Platform admin only">Sign in as the demo admin (admin@demo.babyblue) to review practices and verification.</Empty></div>;

  const practices = (ov.data ?? []).filter((i) => i.kind === "practice");
  const practitioners = (ov.data ?? []).filter((i) => i.kind === "practitioner");
  const toReview = practitioners.filter((p) => p.status === "pending").length;

  async function act(sql: string, params: unknown[], msg: string) {
    try { await mutate(os.uid, sql, params); toast(msg); } catch (e) { toast(friendlyError(e)); }
  }
  async function grant() {
    setBusy(true);
    try { await mutate(os.uid, "select public.grant_platform_role($1, $2::public.platform_role)", [email.trim(), role]); toast("Role granted"); setEmail(""); } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="os-page-h"><div><h1>Platform admin</h1><p>Activate practices, verify practitioners and see what changed. Every action here is audited.</p></div></div>
      <div className="a-tabs" style={{ marginBottom: 18 }}>
        {([["practices", `Practices · ${practices.length}`], ["verification", `Verification${toReview ? ` · ${toReview} pending` : ""}`], ["roles", "Platform roles"], ["audit", "Audit log"]] as const).map(([k, l]) => <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "practices" && (
        <div className="a-card">
          {practices.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderTop: i ? "1px solid var(--line-2)" : 0, flexWrap: "wrap" }}>
              <Building2 size={20} color="#5a7282" />
              <span style={{ flex: 1, minWidth: 180 }}><b style={{ color: "var(--deep)" }}>{p.label}</b><br /><span className="a-hint">{p.detail || "No province"} · created {fmtDayMonth(p.created_at)}</span></span>
              <Badge tone={PRACTICE_TONE[p.status as keyof typeof PRACTICE_TONE] ?? "neutral"} dot>{p.status}</Badge>
              {p.status !== "active" && <button className="a-btn primary sm" onClick={() => act("select public.activate_practice($1, 'active')", [p.id], `${p.label} activated`)}>Activate</button>}
              {p.status === "active" && <button className="a-btn danger sm" onClick={() => window.confirm(`Suspend ${p.label}? It will disappear from patient search.`) && act("select public.activate_practice($1, 'suspended')", [p.id], `${p.label} suspended`)}>Suspend</button>}
            </div>
          ))}
        </div>
      )}

      {tab === "verification" && (
        <>
          <div style={{ marginBottom: 14 }}><Notice tone="info">Only a platform admin can mark a practitioner verified. In production this step follows a check of the professional body register; in this demo, registration numbers are fictional.</Notice></div>
          <div className="a-card">
            {practitioners.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderTop: i ? "1px solid var(--line-2)" : 0, flexWrap: "wrap" }}>
                <Avatar name={p.label.split(" · ")[0]} size={40} />
                <span style={{ flex: 1, minWidth: 200 }}><b style={{ color: "var(--deep)" }}>{p.label}</b><br /><span className="a-hint">{p.practice_name} · {p.detail}</span></span>
                <Badge tone={VERIF_TONE[p.status as keyof typeof VERIF_TONE] ?? "neutral"} dot>{p.status}</Badge>
                {p.status !== "verified" && <button className="a-btn primary sm" onClick={() => act("select public.set_verification($1, 'verified')", [p.id], "Marked verified")}>Verify</button>}
                {p.status === "pending" && <button className="a-btn danger sm" onClick={() => act("select public.set_verification($1, 'rejected')", [p.id], "Rejected")}>Reject</button>}
                {p.status === "verified" && <button className="a-btn secondary sm" onClick={() => act("select public.set_verification($1, 'unverified')", [p.id], "Verification removed")}>Remove</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "roles" && (
        <div className="a-card pad" style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontSize: 17 }}><UserCog size={18} style={{ verticalAlign: -3 }} /> Grant a platform role</h2>
          <Field label="User email" htmlFor="re"><input id="re" className="a-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@demo.babyblue" /></Field>
          <Field label="Role" htmlFor="rr"><select id="rr" className="a-select" value={role} onChange={(e) => setRole(e.target.value)}><option value="marketing_operator">Marketing operator (Growth inbox)</option><option value="platform_admin">Platform admin</option></select></Field>
          <div><Btn className="primary" loading={busy} disabled={!email.includes("@")} onClick={grant}>Grant role</Btn></div>
        </div>
      )}

      {tab === "audit" && (
        <div className="a-card">
          {(audit.data ?? []).map((a, i) => (
            <div key={a.id} style={{ display: "flex", gap: 14, padding: "12px 20px", borderTop: i ? "1px solid var(--line-2)" : 0, alignItems: "baseline" }}>
              <ScrollText size={16} color="#8aa0ac" style={{ flexShrink: 0, alignSelf: "center" }} />
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ color: "var(--deep)" }}>{a.action}</b> <span className="a-hint">{a.entity}{a.practice_name ? ` · ${a.practice_name}` : ""}{a.meta && Object.keys(a.meta).length ? ` · ${Object.entries(a.meta).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}` : ""}</span></span>
              <span className="a-hint" style={{ whiteSpace: "nowrap" }}>{a.actor_name ?? "system"} · {relativeDay(a.at)} {fmtTime(a.at)}</span>
            </div>
          ))}
          {(audit.data ?? []).length === 0 && <Empty icon={<ScrollText size={26} />} title="No audit entries yet">Booking changes, verification decisions and role grants are recorded here.</Empty>}
        </div>
      )}
    </>
  );
}
