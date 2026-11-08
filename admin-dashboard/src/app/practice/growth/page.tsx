"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Megaphone, Plus } from "lucide-react";
import { Badge, Btn, Empty, Field, Notice, Sheet } from "@babyblue/ui/components/primitives";
import { OwnerOnly } from "@/components/os/OwnerOnly";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@babyblue/flow-demo/components/ui";
import { relativeDay } from "@babyblue/utils/format";
import { G_STATUS } from "@/lib/growth";
import { createRequest, listRequests, listServices, setRequestStatus } from "@babyblue/api-client/growth";
import { friendlyError } from "@babyblue/api-client/messages";
import { useQuery } from "@babyblue/pglite-demo/hooks";

interface Svc { id: string; slug: string; name: string; description: string }
interface Row { id: string; title: string; service_name: string; status: string; updated_at: Date; pending: number }

export default function GrowthPage() {
  return <OwnerOnly><Growth /></OwnerOnly>;
}

function Growth() {
  const os = useOs();
  const [wizard, setWizard] = useState<Svc | null | undefined>(undefined);
  const svcs = useQuery(
    () =>
      listServices(os.uid).then((r) =>
        r.map<Svc>((x) => ({ id: x.service_id, slug: x.slug ?? "", name: x.name ?? "", description: x.description ?? "" })),
      ),
    [os.uid],
  );
  // `growth_requests_list` already carries the pending-approval count, so the correlated
  // subquery is gone.
  const rows = useQuery(
    () =>
      listRequests(os.uid, os.practice!.id).then((r) =>
        r.map<Row>((x) => ({
          id: x.request_id,
          title: x.title ?? "",
          service_name: x.service_name ?? "",
          status: x.status ?? "draft",
          updated_at: x.updated_at instanceof Date ? x.updated_at : new Date(String(x.updated_at)),
          pending: x.pending_approvals,
        })),
      ),
    [os.practice?.id, os.uid],
    { poll: 8000 },
  );

  return (
    <>
      <div className="os-page-h">
        <div><h1>Growth</h1><p>Brand, website and marketing help from the BabyBlue Growth team. Request what you need, approve every piece, and see real reports.</p></div>
        <button className="a-btn primary" onClick={() => setWizard(null)}><Plus size={16} /> New request</button>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Your requests</h2>
        {rows.loading && !rows.data ? <div className="a-card pad"><div className="a-skel" style={{ height: 110 }} /></div>
          : (rows.data ?? []).length === 0 ? <div className="a-card"><Empty icon={<Megaphone size={28} />} title="No requests yet" action={<button className="a-btn primary" onClick={() => setWizard(null)}><Plus size={16} /> Start a request</button>}>Pick a service below or describe what you need. Nothing is started or charged until you approve a proposal.</Empty></div>
          : (
            <div className="a-card">
              {rows.data!.map((r, i) => {
                const st = G_STATUS[r.status] ?? G_STATUS.draft;
                return (
                  <Link key={r.id} href={`/practice/growth/${r.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderTop: i ? "1px solid var(--line-2)" : 0, textDecoration: "none", color: "inherit" }}>
                    <span style={{ flex: 1, minWidth: 0 }}><b style={{ color: "var(--deep)" }}>{r.title}</b><br /><span className="a-hint">{r.service_name} · updated {relativeDay(r.updated_at)}</span></span>
                    {r.pending > 0 && <Badge tone="warn" dot>{r.pending} to approve</Badge>}
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                    <ArrowRight size={16} color="#8aa0ac" />
                  </Link>
                );
              })}
            </div>
          )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>What we can help with</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {(svcs.data ?? []).map((s) => (
            <div key={s.id} className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h3 style={{ fontSize: 16 }}>{s.name}</h3>
              <p style={{ color: "var(--ink-2)", fontSize: 14, flex: 1 }}>{s.description}</p>
              <div><button className="a-btn secondary sm" onClick={() => setWizard(s)}>Request this</button></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18 }}><Notice tone="neutral">The Growth team is a separate service from the practice software. We don&apos;t promise rankings, patient numbers or revenue, and we never use patient health information for marketing.</Notice></div>
      </section>

      {wizard !== undefined && <RequestSheet initial={wizard} services={svcs.data ?? []} onClose={() => setWizard(undefined)} />}
    </>
  );
}

function RequestSheet({ initial, services, onClose }: { initial: Svc | null; services: Svc[]; onClose: () => void }) {
  const os = useOs();
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState({ service: initial?.id ?? "", title: initial ? `${initial.name} for ${os.practice!.name}` : "", brief: "", min: "", max: "", deadline: "" });
  const [busy, setBusy] = useState(false);
  const ok = f.service && f.title.trim().length >= 3 && f.brief.trim().length >= 10;

  async function save(submit: boolean) {
    setBusy(true);
    try {
      const id = await createRequest(os.uid, os.practice!.id, {
        service_id: f.service,
        title: f.title.trim(),
        brief: f.brief.trim(),
        budget_min_cents: f.min === "" ? null : Math.round(Number(f.min) * 100),
        budget_max_cents: f.max === "" ? null : Math.round(Number(f.max) * 100),
        deadline: f.deadline || null,
      });
      // `draft -> submitted` is the practice's move in the procedure's state machine.
      if (submit) await setRequestStatus(os.uid, id, "submitted");
      toast(submit ? "Request sent to the Growth team" : "Saved as draft");
      onClose();
      router.push(`/practice/growth/${id}`);
    } catch (e) { toast(friendlyError(e)); setBusy(false); }
  }

  return (
    <Sheet onClose={onClose} title="New request" footer={<><button className="a-btn ghost" onClick={onClose}>Cancel</button><Btn className="secondary" disabled={!ok} loading={busy} onClick={() => save(false)}>Save draft</Btn><Btn className="primary" disabled={!ok} loading={busy} onClick={() => save(true)}>Submit request</Btn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Service" htmlFor="g1"><select id="g1" className="a-select" value={f.service} onChange={(e) => { const s = services.find((x) => x.id === e.target.value); setF({ ...f, service: e.target.value, title: f.title || (s ? `${s.name} for ${os.practice!.name}` : "") }); }}><option value="">Select…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Request title" htmlFor="g2"><input id="g2" className="a-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="What do you need?" htmlFor="g3" hint="Goals, audience, anything you already have. At least a couple of sentences."><textarea id="g3" className="a-textarea" style={{ minHeight: 130 }} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} /></Field>
        <div className="two-col" style={{ gap: 14 }}>
          <Field label="Budget from (rand)" htmlFor="g4"><input id="g4" type="number" min={0} className="a-input" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          <Field label="Budget to (rand)" htmlFor="g5"><input id="g5" type="number" min={0} className="a-input" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
        </div>
        <Field label="Deadline (optional)" htmlFor="g6"><input id="g6" type="date" className="a-input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
        <Notice tone="info">You can attach logos and files after saving. Submitting sends the brief to the Growth team for review; no work starts until you approve a proposal.</Notice>
      </div>
    </Sheet>
  );
}
