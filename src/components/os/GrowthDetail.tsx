"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Check, Download, FileText, MessageSquare, Paperclip, Plus, Send, Upload } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Notice } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { fmtDayMonth, fmtTime, money, relativeDay } from "@/lib/format";
import { G_STATUS, MAX_FILE, OPERATOR_ACTIONS, OWNER_ACTIONS, PIPELINE, fileSize } from "@/lib/growth";
import { friendlyError, mutate, query } from "@/local/db";
import { useQuery } from "@/local/hooks";

interface Req { id: string; practice_id: string; practice_name: string; service_name: string; created_by: string; title: string; brief: string; budget_min_cents: number | null; budget_max_cents: number | null; deadline: Date | null; status: string; created_at: Date; updated_at: Date }
interface Upd { id: string; author_id: string; body: string; created_at: Date }
interface Appr { id: string; item: string; status: "pending" | "approved" | "changes_requested"; comment: string | null; decided_at: Date | null; created_at: Date }
interface Asset { id: string; kind: string; file_name: string; mime: string | null; size_bytes: number | null; created_at: Date; uploaded_by: string }
interface Rep { id: string; period: string; summary: string; metrics: Record<string, number | string>; created_at: Date }

export function GrowthDetail({ id, mode }: { id: string; mode: "owner" | "operator" }) {
  const os = useOs();
  const toast = useToast();
  const [tab, setTab] = useState<"overview" | "updates" | "approvals" | "files" | "reports">("overview");
  const req = useQuery(() => query<Req>(os.uid, `select r.id, r.practice_id, coalesce((select i.practice_name from public.marketing_inbox() i where i.id = r.id), (select p.name from public.practices p where p.id = r.practice_id), '') practice_name, s.name service_name, r.created_by, r.title, r.brief, r.budget_min_cents, r.budget_max_cents, r.deadline, r.status::text, r.created_at, r.updated_at
      from public.marketing_requests r join public.marketing_services s on s.id = r.service_id where r.id = $1`, [id]).then((r) => r[0] ?? null), [id, os.uid], { poll: 8000 });
  const upds = useQuery(() => query<Upd>(os.uid, "select id, author_id, body, created_at from public.campaign_updates where request_id = $1 order by created_at", [id]), [id, os.uid], { poll: 8000 });
  const apprs = useQuery(() => query<Appr>(os.uid, "select id, item, status, comment, decided_at, created_at from public.marketing_approvals where request_id = $1 order by created_at", [id]), [id, os.uid], { poll: 8000 });
  const assets = useQuery(() => query<Asset>(os.uid, "select id, kind, file_name, mime, size_bytes, created_at, uploaded_by from public.marketing_assets where request_id = $1 order by created_at", [id]), [id, os.uid]);
  const reps = useQuery(() => query<Rep>(os.uid, "select id, period, summary, metrics, created_at from public.campaign_reports where request_id = $1 order by created_at desc", [id]), [id, os.uid]);

  const r = req.data;
  if (req.loading && req.data === undefined) return <div className="a-card pad"><div className="a-skel" style={{ height: 320 }} /></div>;
  if (!r) return <div className="a-card"><Empty icon={<FileText size={28} />} title="Request not found" action={<Link href={mode === "owner" ? "/practice/growth" : "/practice/operator"} className="a-btn primary">Back</Link>}>It may have been removed, or you may not have access.</Empty></div>;

  const st = G_STATUS[r.status] ?? G_STATUS.draft;
  const actions = (mode === "owner" ? OWNER_ACTIONS : OPERATOR_ACTIONS)[r.status] ?? [];
  const back = mode === "owner" ? "/practice/growth" : "/practice/operator";
  const author = (a: string) => (a === os.uid ? "You" : a === r.created_by ? "Practice" : "BabyBlue Growth");

  async function move(to: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    try { await mutate(os.uid, "select public.marketing_set_status($1, $2::public.marketing_status)", [id, to]); toast(`Status: ${G_STATUS[to].label}`); } catch (e) { toast(friendlyError(e)); }
  }
  const pendingAppr = (apprs.data ?? []).filter((a) => a.status === "pending").length;

  return (
    <>
      <Link href={back} className="a-link" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 14, fontSize: 14 }}><ArrowLeft size={16} /> {mode === "owner" ? "All requests" : "Inbox"}</Link>
      <div className="os-page-h">
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}><Badge tone={st.tone} dot>{st.label}</Badge><span className="a-hint">{r.service_name}{mode === "operator" ? ` · ${r.practice_name}` : ""}</span></div>
          <h1 style={{ fontSize: 26 }}>{r.title}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {actions.map((a) => <button key={a.to} className={`a-btn ${a.tone === "primary" ? "primary" : a.tone === "danger" ? "danger" : a.tone === "good" ? "good" : "secondary"}`} onClick={() => move(a.to, a.confirm)}>{a.label}</button>)}
        </div>
      </div>

      {st.step >= 0 && (
        <div className="a-card pad" style={{ marginBottom: 18 }}>
          <div className="os-pipeline" aria-hidden="true">{PIPELINE.map((_, i) => <i key={i} className={i < st.step ? "on" : i === st.step ? "now" : ""} />)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--ink-3)", gap: 4 }}>{PIPELINE.map((p, i) => <span key={p} style={{ fontWeight: i === st.step ? 700 : 500, color: i === st.step ? "var(--deep)" : undefined, textAlign: "center", flex: 1 }}>{p}</span>)}</div>
        </div>
      )}

      {mode === "owner" && r.status === "proposal_sent" && <div style={{ marginBottom: 18 }}><Notice tone="warn">The Growth team sent a proposal. Read the updates, then approve or decline it.</Notice></div>}
      {mode === "owner" && pendingAppr > 0 && <div style={{ marginBottom: 18 }}><Notice tone="warn">{pendingAppr} item{pendingAppr === 1 ? " is" : "s are"} waiting for your approval. Nothing is published in your name until you approve it.</Notice></div>}

      <div className="a-tabs" style={{ marginBottom: 18 }}>
        {([["overview", "Overview"], ["updates", `Updates${upds.data?.length ? ` · ${upds.data.length}` : ""}`], ["approvals", `Approvals${pendingAppr ? ` · ${pendingAppr}` : ""}`], ["files", `Files${assets.data?.length ? ` · ${assets.data.length}` : ""}`], ["reports", `Reports${reps.data?.length ? ` · ${reps.data.length}` : ""}`]] as const).map(([k, l]) => <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "overview" && (
        <div className="os-grid even" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
          <section className="a-card pad"><h2 style={{ fontSize: 17, marginBottom: 10 }}>Brief</h2><p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "var(--ink-2)" }}>{r.brief}</p></section>
          <section className="a-card pad"><dl className="a-kv">
            <dt>Service</dt><dd>{r.service_name}</dd>
            {mode === "operator" && <><dt>Practice</dt><dd>{r.practice_name}</dd></>}
            <dt>Budget</dt><dd className="tnum">{r.budget_min_cents != null || r.budget_max_cents != null ? `${money(r.budget_min_cents) || "—"} – ${money(r.budget_max_cents) || "—"}` : "Not set"}</dd>
            <dt>Deadline</dt><dd>{r.deadline ? fmtDayMonth(r.deadline) : "Flexible"}</dd>
            <dt>Requested</dt><dd>{relativeDay(r.created_at)}</dd>
            <dt>Last update</dt><dd>{relativeDay(r.updated_at)}</dd>
          </dl></section>
        </div>
      )}
      {tab === "updates" && <Updates id={id} items={upds.data ?? []} author={author} canPost={r.status !== "draft" || mode === "owner"} />}
      {tab === "approvals" && <Approvals id={id} items={apprs.data ?? []} mode={mode} />}
      {tab === "files" && <Files id={id} items={assets.data ?? []} mode={mode} author={author} />}
      {tab === "reports" && <Reports id={id} items={reps.data ?? []} mode={mode} />}
    </>
  );
}

function Updates({ id, items, author, canPost }: { id: string; items: Upd[]; author: (a: string) => string; canPost: boolean }) {
  const os = useOs();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function post() {
    if (!text.trim()) return;
    setBusy(true);
    try { await mutate(os.uid, "insert into public.campaign_updates (request_id, author_id, body) values ($1, $2, $3)", [id, os.uid, text.trim()]); setText(""); } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((u) => (
        <div key={u.id} className="a-card pad" style={{ display: "flex", gap: 14 }}>
          <Avatar name={author(u.author_id)} size={38} />
          <div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ color: "var(--deep)" }}>{author(u.author_id)}</b><span className="a-hint">{relativeDay(u.created_at)} · {fmtTime(u.created_at)}</span></div><p style={{ marginTop: 4, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{u.body}</p></div>
        </div>
      ))}
      {items.length === 0 && <div className="a-card"><Empty icon={<MessageSquare size={26} />} title="No updates yet">Progress notes and questions from both sides appear here.</Empty></div>}
      {canPost && (
        <div className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea className="a-textarea" style={{ minHeight: 80 }} placeholder="Write an update or ask a question…" value={text} onChange={(e) => setText(e.target.value)} aria-label="New update" />
          <div><Btn className="primary sm" loading={busy} disabled={!text.trim()} onClick={post}><Send size={14} /> Post update</Btn></div>
        </div>
      )}
    </div>
  );
}

function Approvals({ id, items, mode }: { id: string; items: Appr[]; mode: "owner" | "operator" }) {
  const os = useOs();
  const toast = useToast();
  const [item, setItem] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  async function add() {
    try { await mutate(os.uid, "insert into public.marketing_approvals (request_id, item) values ($1, $2)", [id, item.trim()]); setItem(""); toast("Sent for approval"); } catch (e) { toast(friendlyError(e)); }
  }
  async function decide(aid: string, status: string) {
    try { await mutate(os.uid, "select public.decide_approval($1, $2, $3)", [aid, status, comments[aid] ?? null]); toast(status === "approved" ? "Approved" : "Changes requested"); } catch (e) { toast(friendlyError(e)); }
  }
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((a) => (
        <div key={a.id} className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><b style={{ color: "var(--deep)" }}>{a.item}</b><Badge tone={a.status === "approved" ? "good" : a.status === "pending" ? "warn" : "bad"} dot>{a.status === "approved" ? "Approved" : a.status === "pending" ? "Awaiting approval" : "Changes requested"}</Badge></div>
          {a.comment && <p style={{ color: "var(--ink-2)", fontSize: 14 }}>“{a.comment}”</p>}
          {mode === "owner" && a.status === "pending" && (
            <>
              <input className="a-input sm" placeholder="Optional comment" value={comments[a.id] ?? ""} onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })} aria-label="Comment" />
              <div style={{ display: "flex", gap: 8 }}><Btn className="primary sm" onClick={() => decide(a.id, "approved")}><Check size={14} /> Approve</Btn><Btn className="secondary sm" onClick={() => decide(a.id, "changes_requested")}>Request changes</Btn></div>
            </>
          )}
        </div>
      ))}
      {items.length === 0 && <div className="a-card"><Empty icon={<Check size={26} />} title="Nothing to approve yet">The Growth team adds drafts and creative here. You approve every piece before it is used.</Empty></div>}
      {mode === "operator" && (
        <div className="a-card pad" style={{ display: "flex", gap: 10 }}>
          <input className="a-input" placeholder="Item for the practice to approve, e.g. Homepage design v1" value={item} onChange={(e) => setItem(e.target.value)} aria-label="Approval item" />
          <Btn className="primary" disabled={item.trim().length < 3} onClick={add}><Plus size={16} /> Request approval</Btn>
        </div>
      )}
    </div>
  );
}

function Files({ id, items, mode, author }: { id: string; items: Asset[]; mode: "owner" | "operator"; author: (a: string) => string }) {
  const os = useOs();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_FILE) { toast(`${f.name} is over 2 MB`); continue; }
        const bytes = new Uint8Array(await f.arrayBuffer());
        await mutate(os.uid, "insert into public.marketing_assets (request_id, uploaded_by, kind, file_name, mime, size_bytes, content) values ($1, $2, $3, $4, $5, $6, $7)", [id, os.uid, mode === "owner" ? "brief_asset" : "deliverable", f.name, f.type || null, f.size, bytes]);
      }
      toast("Uploaded");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function download(a: Asset) {
    const [row] = await query<{ content: Uint8Array }>(os.uid, "select content from public.marketing_assets where id = $1", [a.id]);
    const url = URL.createObjectURL(new Blob([row.content as BlobPart], { type: a.mime ?? "application/octet-stream" }));
    const el = document.createElement("a"); el.href = url; el.download = a.file_name; el.click(); URL.revokeObjectURL(url);
  }
  const groups = [["Your brief assets", items.filter((a) => a.kind === "brief_asset")], ["Deliverables library", items.filter((a) => a.kind === "deliverable")]] as const;
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 18 }}>
      {groups.map(([title, list]) => (
        <section key={title} className="a-card"><div className="os-card-h"><h2>{title}</h2></div>
          <div style={{ marginTop: 8 }}>{list.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--line-2)" }}>
              <Paperclip size={18} color="#5a7282" /><span style={{ flex: 1, minWidth: 0 }}><b style={{ color: "var(--deep)" }}>{a.file_name}</b><br /><span className="a-hint">{fileSize(a.size_bytes)} · {author(a.uploaded_by)} · {relativeDay(a.created_at)}</span></span>
              <button className="a-btn secondary sm" onClick={() => download(a)}><Download size={14} /> Download</button>
            </div>
          ))}
          {list.length === 0 && <p className="a-hint" style={{ padding: "6px 20px 18px" }}>{title.startsWith("Your") ? "Logos, photos or examples you'd like us to use." : "Finished work will be stored here, ready to download."}</p>}</div>
        </section>
      ))}
      <div><input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} /><Btn className="primary" loading={busy} onClick={() => input.current?.click()}><Upload size={16} /> {mode === "owner" ? "Upload brief asset" : "Upload deliverable"}</Btn><span className="a-hint" style={{ marginLeft: 10 }}>Up to 2 MB per file</span></div>
    </div>
  );
}

function Reports({ id, items, mode }: { id: string; items: Rep[]; mode: "owner" | "operator" }) {
  const os = useOs();
  const toast = useToast();
  const [f, setF] = useState({ period: "", summary: "", metrics: [{ k: "", v: "" }] });
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      const metrics = Object.fromEntries(f.metrics.filter((m) => m.k.trim() && m.v.trim()).map((m) => [m.k.trim(), Number.isFinite(Number(m.v)) ? Number(m.v) : m.v.trim()]));
      await mutate(os.uid, "insert into public.campaign_reports (request_id, period, summary, metrics, created_by) values ($1, $2, $3, $4::jsonb, $5)", [id, f.period.trim(), f.summary.trim(), JSON.stringify(metrics), os.uid]);
      setF({ period: "", summary: "", metrics: [{ k: "", v: "" }] }); toast("Report added");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }
  return (
    <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((r) => (
        <section key={r.id} className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><h3 style={{ fontSize: 17 }}>{r.period}</h3><span className="a-hint">{relativeDay(r.created_at)}</span></div>
          <p style={{ color: "var(--ink-2)" }}>{r.summary}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {Object.entries(r.metrics).map(([k, v]) => <div key={k} className="a-card flat" style={{ padding: 12 }}><b className="tnum" style={{ fontFamily: "var(--font-head)", fontSize: 24, color: "var(--deep)" }}>{String(v)}</b><p className="a-hint">{k}</p></div>)}
          </div>
        </section>
      ))}
      {items.length === 0 && <div className="a-card"><Empty icon={<FileText size={26} />} title="No reports yet">Plain-language reports with real figures appear here as work goes live.</Empty></div>}
      {mode === "operator" && (
        <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 17 }}>Add a report</h3>
          <Field label="Period" htmlFor="rp"><input id="rp" className="a-input" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} placeholder="e.g. Last 30 days" /></Field>
          <Field label="Summary" htmlFor="rs"><textarea id="rs" className="a-textarea" style={{ minHeight: 80 }} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
          <div><p className="a-label" style={{ marginBottom: 8 }}>Measured figures</p>
            {f.metrics.map((m, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}><input className="a-input sm" placeholder="Metric" value={m.k} onChange={(e) => setF({ ...f, metrics: f.metrics.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} aria-label="Metric name" /><input className="a-input sm" style={{ width: 130 }} placeholder="Value" value={m.v} onChange={(e) => setF({ ...f, metrics: f.metrics.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })} aria-label="Metric value" /></div>)}
            <button className="a-link" onClick={() => setF({ ...f, metrics: [...f.metrics, { k: "", v: "" }] })}>+ Add figure</button>
          </div>
          <Notice tone="neutral">Only report figures that were actually measured. If attribution isn&apos;t reliable, say so in the summary.</Notice>
          <div><Btn className="primary" loading={busy} disabled={f.period.trim().length < 2 || f.summary.trim().length < 5} onClick={add}>Add report</Btn></div>
        </section>
      )}
    </div>
  );
}
