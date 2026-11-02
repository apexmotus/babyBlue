"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Check, Download, FileText, MessageSquare, Paperclip, Plus, Send, Upload } from "lucide-react";
import { Avatar, Badge, Btn, Empty, Field, Notice } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { fmtDayMonth, fmtTime, money, relativeDay } from "@/lib/format";
import { G_STATUS, MAX_FILE, OPERATOR_ACTIONS, OWNER_ACTIONS, PIPELINE, fileSize } from "@/lib/growth";
import {
  addApproval,
  addAsset,
  createReport,
  decideApproval,
  getRequest,
  listApprovals,
  listAssets,
  listReports,
  listUpdates,
  postUpdate,
  setRequestStatus,
  type MarketingStatus,
} from "@/lib/api/growth";
import { friendlyError } from "@/lib/api/messages";
import { getApiBaseUrl, hasRemoteApi } from "@/lib/api/http";
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
  // A three-way coalesce over `marketing_inbox`, `practices` and a join replaced by the one
  // procedure written for this screen. `_require_request_access` decides who may read it, so an
  // operator sees a request without being a member of the practice that owns it.
  const req = useQuery(
    () =>
      getRequest(os.uid, id).then((x) =>
        x
          ? ({
              id: x.request_id,
              practice_id: x.practice_id,
              practice_name: x.practice_name ?? "",
              service_name: x.service_name ?? "",
              created_by: x.created_by ?? "",
              title: x.title ?? "",
              brief: x.brief ?? "",
              budget_min_cents: x.budget_min_cents,
              budget_max_cents: x.budget_max_cents,
              deadline: x.deadline as Req["deadline"],
              status: x.status ?? "draft",
              created_at: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
              updated_at: x.updated_at instanceof Date ? x.updated_at : new Date(String(x.updated_at)),
            } as Req)
          : null,
      ),
    [id, os.uid],
    { poll: 8000 },
  );
  const upds = useQuery(
    () =>
      listUpdates(os.uid, id).then((r) =>
        r.map<Upd>((x) => ({
          id: x.update_id,
          author_id: x.author_id ?? "",
          body: x.body ?? "",
          created_at: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
        })),
      ),
    [id, os.uid],
    { poll: 8000 },
  );
  const apprs = useQuery(
    () =>
      listApprovals(os.uid, id).then((r) =>
        r.map<Appr>((x) => ({
          id: x.approval_id,
          item: x.item ?? "",
          status: (x.status ?? "pending") as Appr["status"],
          comment: x.comment,
          decided_at: x.decided_at as Appr["decided_at"],
          created_at: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
        })),
      ),
    [id, os.uid],
    { poll: 8000 },
  );
  // Metadata only: the `bytea` column is never part of a list response.
  const assets = useQuery(
    () =>
      listAssets(os.uid, id).then((r) =>
        r.map<Asset>((x) => ({
          id: x.asset_id,
          kind: x.kind ?? "brief_asset",
          file_name: x.file_name ?? "",
          mime: x.mime,
          size_bytes: x.size_bytes,
          created_at: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
          uploaded_by: x.uploaded_by ?? "",
        })),
      ),
    [id, os.uid],
  );
  // `growth_reports_list` returns one row per metric; group them back into reports.
  const reps = useQuery(
    () =>
      listReports(os.uid, id).then((rows) => {
        const byReport = new Map<string, Rep>();
        for (const x of rows) {
          const key = x.report_id;
          if (!byReport.has(key)) {
            byReport.set(key, {
              id: key,
              period: x.period ?? "",
              summary: x.summary ?? "",
              metrics: {},
              created_at: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
            });
          }
          if (x.metric_key) byReport.get(key)!.metrics[x.metric_key] = x.metric_value ?? 0;
        }
        return [...byReport.values()];
      }),
    [id, os.uid],
  );

  const r = req.data;
  if (req.loading && req.data === undefined) return <div className="a-card pad"><div className="a-skel" style={{ height: 320 }} /></div>;
  if (!r) return <div className="a-card"><Empty icon={<FileText size={28} />} title="Request not found" action={<Link href={mode === "owner" ? "/practice/growth" : "/practice/operator"} className="a-btn primary">Back</Link>}>It may have been removed, or you may not have access.</Empty></div>;

  const st = G_STATUS[r.status] ?? G_STATUS.draft;
  const actions = (mode === "owner" ? OWNER_ACTIONS : OPERATOR_ACTIONS)[r.status] ?? [];
  const back = mode === "owner" ? "/practice/growth" : "/practice/operator";
  const author = (a: string) => (a === os.uid ? "You" : a === r.created_by ? "Practice" : "BabyBlue Growth");

  async function move(to: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    try { await setRequestStatus(os.uid, id, to as MarketingStatus); toast(`Status: ${G_STATUS[to].label}`); req.reload(); } catch (e) { toast(friendlyError(e)); }
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
    try { await postUpdate(os.uid, id, text.trim()); setText(""); } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
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
    try { await addApproval(os.uid, id, item.trim()); setItem(""); toast("Sent for approval"); } catch (e) { toast(friendlyError(e)); }
  }
  async function decide(aid: string, status: string) {
    try {
      await decideApproval(os.uid, aid, status as "approved" | "changes_requested", comments[aid] ?? null);
      toast(status === "approved" ? "Approved" : "Changes requested");
    } catch (e) { toast(friendlyError(e)); }
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
        // No declared size is sent: the API measures the bytes it read and the database guards
        // on `octet_length` (F-13). Who may upload which `kind` is the procedure's decision.
        await addAsset(os.uid, id, f, mode === "owner" ? "brief_asset" : "deliverable");
      }
      toast("Uploaded");
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  /**
   * Download an asset.
   *
   * Remote mode fetches the API route, which serves the bytes as an `attachment` with `nosniff`
   * and an allowlisted media type — an uploaded `text/html` comes back as
   * `application/octet-stream` rather than running on the API origin. The blob is built from
   * what the server declared, not from the row the uploader wrote.
   */
  async function download(a: Asset) {
    if (hasRemoteApi()) {
      const res = await fetch(`${getApiBaseUrl()}/v1/growth/assets/${a.id}/content`, {
        headers: { authorization: `Bearer ${os.uid}` },
        cache: "no-store",
      });
      if (!res.ok) { toast("Could not download that file"); return; }
      const url = URL.createObjectURL(await res.blob());
      const el = document.createElement("a"); el.href = url; el.download = a.file_name; el.click(); URL.revokeObjectURL(url);
      return;
    }

    const { query } = await import("@/local/db");
    const [row] = await query<{ file_name: string; mime: string | null; content: Uint8Array }>(
      os.uid, "select * from public.growth_asset_download($1)", [a.id]);
    if (!row) { toast("Could not download that file"); return; }
    const url = URL.createObjectURL(new Blob([row.content as BlobPart], { type: row.mime ?? "application/octet-stream" }));
    const el = document.createElement("a"); el.href = url; el.download = row.file_name || a.file_name; el.click(); URL.revokeObjectURL(url);
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
      // An unrecognised metric key is `400 metric_unknown` from the procedure, which names the
      // offending key — the browser no longer decides what a valid metric is.
      await createReport(os.uid, id, {
        period: f.period.trim(),
        summary: f.summary.trim(),
        metrics: metrics as Record<string, number>,
      });
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
