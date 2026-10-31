"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { QuestionInput } from "@/components/question";
import { Logo, useToast } from "@/components/ui";
import { activeQuestions, submitIntake, useDB, visitById } from "@/lib/store";

export default function Intake() {
  const { id } = useParams<{ id: string }>();
  const db = useDB();
  const toast = useToast();
  const visit = visitById(db, id);
  const qs = activeQuestions(db);
  const [answers, setAnswers] = useState<Record<string, string | number>>(visit?.intake?.answers ?? {});
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const back = `/q/${id}`;
  if (!visit) {
    return (
      <Wrap back="/">
        <p className="b6">We can&apos;t find this visit.</p>
      </Wrap>
    );
  }
  const pos = visit.status === "waiting" ? db.visits.filter((v) => v.day === visit.day && v.status === "waiting" && v.seq <= visit.seq).length : 0;

  if (submitted) {
    return (
      <Wrap back={back} title="Quick intake">
        <div className="card r16" style={{ padding: 28, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--accent-50)", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check size={28} color="#2b7557" />
          </div>
          <p style={{ fontSize: 22, fontWeight: 700, marginTop: 14, letterSpacing: -0.4 }}>Intake submitted</p>
          <p className="muted" style={{ marginTop: 8 }}>
            {visit.doctor ? visit.doctor : "The doctor"} will see your answers before you go in.{pos ? ` You're still #${pos} in line.` : ""}
          </p>
        </div>
        <Link href={back} className="btn btn-primary lg">Back to my queue position</Link>
      </Wrap>
    );
  }
  if (!qs.length) {
    return (
      <Wrap back={back} title="Quick intake">
        <p className="muted">This practice isn&apos;t asking intake questions right now.</p>
      </Wrap>
    );
  }
  const q = qs[step];
  const answered = answers[q.id] !== undefined;
  const last = step === qs.length - 1;
  return (
    <Wrap back={back} title="Quick intake" sub={`${step + 1} of ${qs.length}`}>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 99 }}>
        <div style={{ height: 6, width: `${((step + 1) / qs.length) * 100}%`, background: "var(--primary)", borderRadius: 99, transition: "width .2s" }} />
      </div>
      <p className="muted t13">
        {qs.length} short questions. Reception and the doctor see your answers as categories — nothing you type is shown publicly.
      </p>
      {qs.slice(0, step).map((p, i) => (
        <button key={p.id} className="card" style={{ padding: "12px 16px", textAlign: "left", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", border: "1px solid var(--border)" }} onClick={() => setStep(i)}>
          <span>
            <span className="muted t12" style={{ display: "block" }}>Question {i + 1} · answered</span>
            <span className="t13 b6">{p.label}</span>
            <span className="t13 muted" style={{ display: "block" }}>{String(answers[p.id] ?? "—")}</span>
          </span>
          <span className="t12" style={{ color: "var(--primary)", fontWeight: 600 }}>Edit</span>
        </button>
      ))}
      <div className="card r16" style={{ padding: 20 }}>
        <p className="muted t12" style={{ fontWeight: 600 }}>Question {step + 1}</p>
        <h2 style={{ fontSize: 19, margin: "6px 0 16px", letterSpacing: -0.3 }}>{q.label}</h2>
        <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
      </div>
      <div className="flex gap8">
        {step > 0 && <button className="btn btn-ghost lg" style={{ flex: "0 0 auto" }} onClick={() => setStep(step - 1)}>Back</button>}
        <button
          className="btn btn-primary lg grow"
          disabled={q.required && !answered}
          onClick={() => {
            if (!last) return setStep(step + 1);
            submitIntake(visit.id, answers);
            toast("Intake submitted");
            setSubmitted(true);
          }}
        >
          {last ? "Submit intake" : "Next"}
        </button>
      </div>
      {!q.required && !answered && !last && <button className="btn-link" onClick={() => setStep(step + 1)}>Skip this one</button>}
    </Wrap>
  );
}

function Wrap({ children, back, title, sub }: { children: React.ReactNode; back: string; title?: string; sub?: string }) {
  return (
    <div className="m-wrap">
      <div className="m-app">
        <div className="m-head">
          <div className="flex center gap12">
            <Link href={back} className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 600 }}>{title ?? "Intake"}</h1>
              {sub && <p className="muted t12">{sub}</p>}
            </div>
          </div>
          <Logo size={26} />
        </div>
        <div className="m-body">{children}</div>
      </div>
    </div>
  );
}
