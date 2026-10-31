"use client";

import Link from "next/link";
import { useState } from "react";
import { Inbox } from "lucide-react";
import { Badge, Empty, Notice } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { fmtDayMonth, relativeDay } from "@/lib/format";
import { G_STATUS } from "@/lib/growth";
import { query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Row { id: string; practice_name: string; service_name: string; title: string; status: string; deadline: Date | null; updated_at: Date }

const COLUMNS: [string, string[]][] = [
  ["New", ["submitted"]],
  ["In review", ["in_review", "proposal_sent"]],
  ["Active", ["approved", "in_progress", "awaiting_approval"]],
  ["Delivered", ["delivered"]],
  ["Closed", ["closed", "declined"]],
];

export default function OperatorPage() {
  const os = useOs();
  const [view, setView] = useState<"board" | "list">("board");
  const q = useQuery(() => query<Row>(os.uid, "select id, practice_name, service_name, title, status::text, deadline, updated_at from public.marketing_inbox()"), [os.uid], { poll: 8000 });
  const rows = q.data ?? [];

  if (os.platformRole !== "marketing_operator" && os.platformRole !== "platform_admin") {
    return <div className="a-card"><Empty icon={<Inbox size={28} />} title="Growth inbox is for the BabyBlue Growth team">Sign in as the demo operator (ops@demo.babyblue) to manage client requests.</Empty></div>;
  }

  const card = (r: Row) => {
    const st = G_STATUS[r.status];
    return (
      <Link key={r.id} href={`/practice/operator/${r.id}`} className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", color: "inherit", padding: 14 }}>
        <span className="a-hint">{r.practice_name}</span>
        <b style={{ color: "var(--deep)", lineHeight: 1.3 }}>{r.title}</b>
        <span className="a-hint">{r.service_name}</span>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}><Badge tone={st.tone} dot>{st.label}</Badge><span className="a-hint">{r.deadline ? `Due ${fmtDayMonth(r.deadline)}` : relativeDay(r.updated_at)}</span></span>
      </Link>
    );
  };

  return (
    <>
      <div className="os-page-h">
        <div><h1>Growth inbox</h1><p>Requests from client practices. Drafts are private to the practice until submitted.</p></div>
        <div className="a-seg" role="tablist">{[["board", "Board"], ["list", "List"]].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k as "board" | "list")}>{l}</button>)}</div>
      </div>
      {q.loading && !q.data ? <div className="a-card pad"><div className="a-skel" style={{ height: 200 }} /></div>
        : rows.length === 0 ? <div className="a-card"><Empty icon={<Inbox size={28} />} title="Inbox is empty">New requests from practices appear here once submitted.</Empty></div>
        : view === "board" ? (
          <div className="kanban">
            {COLUMNS.map(([name, sts]) => {
              const list = rows.filter((r) => sts.includes(r.status));
              return (
                <div key={name} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--deep)", fontSize: 14 }}><span>{name}</span><span className="a-hint">{list.length}</span></div>
                  {list.map(card)}
                  {list.length === 0 && <p className="a-hint" style={{ padding: "8px 2px" }}>Nothing here</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="a-card">{rows.map((r, i) => {
            const st = G_STATUS[r.status];
            return <Link key={r.id} href={`/practice/operator/${r.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderTop: i ? "1px solid var(--line-2)" : 0, textDecoration: "none", color: "inherit" }}>
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ color: "var(--deep)" }}>{r.title}</b><br /><span className="a-hint">{r.practice_name} · {r.service_name}</span></span><Badge tone={st.tone} dot>{st.label}</Badge><span className="a-hint" style={{ width: 90, textAlign: "right" }}>{relativeDay(r.updated_at)}</span>
            </Link>;
          })}</div>
        )}
      <div style={{ marginTop: 18 }}><Notice tone="neutral">Operators see request content and files only. Appointments, clients and health information are not accessible from this inbox.</Notice></div>
    </>
  );
}
