"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock, MessageCircle, Smartphone } from "lucide-react";
import { Logo } from "@/components/ui";
import { estimateFor, patientOf, positionOf, useDB, visitById } from "@/lib/store";
import { fmtPhone } from "@/lib/util";

export default function Messages() {
  const { id } = useParams<{ id: string }>();
  const db = useDB();
  const visit = visitById(db, id);
  const patient = visit ? patientOf(db, visit.patientId) : undefined;
  if (!visit || !patient) {
    return (
      <div className="m-wrap"><div className="m-app"><div className="m-body"><p className="b6">We can&apos;t find this visit.</p></div></div></div>
    );
  }
  const name = db.settings.name;
  const pos = positionOf(db, visit.id) || 1;
  const est = estimateFor(db, pos).replace("–", "-");
  const short = `bby.co.za/q/${visit.id.replace(/^v-/, "").slice(0, 4)}`;
  const wa = [
    { t: visit.joinedAt, text: `You're in the queue at ${name}. Position ${pos}. Estimated wait ${estimateFor(db, pos)} — this can change. Track it live: ${short}`, sent: true },
    { t: "when two away", text: `You're two away. Please make your way to reception at ${name}. ${short}`, sent: pos <= 2 || visit.status !== "waiting" },
    { t: visit.calledAt ?? "when called", text: `${visit.doctor ?? "The doctor"} is ready for you. Please go through to ${visit.room ?? "the consulting room"}.`, sent: visit.status !== "waiting" },
  ];
  const sms = [
    { t: visit.joinedAt, text: `${name}: you are #${pos} in the queue. Estimated wait ${est} (not a booked time). Live status: ${short}`, sent: true },
    { t: "when you're next", text: `${name}: you're next. Please come to reception now. ${short}`, sent: pos <= 1 || visit.status !== "waiting" },
  ];
  return (
    <div className="m-wrap">
      <div className="m-app">
        <div className="m-head">
          <div className="flex center gap12">
            <Link href={`/q/${id}`} className="x-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
            <h1 style={{ fontSize: 16, fontWeight: 600 }}>What we&apos;ll send you</h1>
          </div>
          <Logo size={26} />
        </div>
        <div className="m-body">
          <p className="muted t13">
            Messages go to {fmtPhone(patient.phone)}. {patient.whatsapp ? "WhatsApp first; if it can't be delivered we fall back to SMS." : "SMS only — this isn't a WhatsApp number."} Both are sent by the practice, never with medical detail.
          </p>
          {patient.whatsapp && (
            <section>
              <div className="flex center between" style={{ marginBottom: 10 }}>
                <p className="b6 flex center gap8"><MessageCircle size={16} color="#0fae7b" /> WhatsApp</p>
                <span className="pill sm good">Primary</span>
              </div>
              <p className="hint" style={{ marginBottom: 10 }}>{name} · verified</p>
              <div className="flex col gap8">
                {wa.map((m, i) => <Bubble key={i} kind="wa" {...m} />)}
              </div>
            </section>
          )}
          <section>
            <div className="flex center between" style={{ marginBottom: 10 }}>
              <p className="b6 flex center gap8"><Smartphone size={16} color="#64748b" /> SMS</p>
              <span className="pill sm neutral">{patient.whatsapp ? "Fallback" : "Primary"}</span>
            </div>
            <p className="hint" style={{ marginBottom: 10 }}>Sender ID: BabyBlue</p>
            <div className="flex col gap8">
              {sms.map((m, i) => <Bubble key={i} kind="sms" {...m} />)}
            </div>
          </section>
          <div className="banner neutral">
            <Lock size={16} />
            <div>Messages never contain a reason for the visit, an intake answer or a diagnosis. Only your position, the estimate and the practice name.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ kind, t, text, sent }: { kind: "wa" | "sms"; t: string; text: string; sent: boolean }) {
  return (
    <div className={`msg ${kind}`} style={{ opacity: sent ? 1 : 0.5, borderStyle: sent ? "solid" : "dashed" }}>
      {text}
      <div className="time">
        {sent ? t : `Not sent yet · ${t}`}
        {kind === "sms" && sent ? ` · ${text.length} characters` : ""}
      </div>
    </div>
  );
}
