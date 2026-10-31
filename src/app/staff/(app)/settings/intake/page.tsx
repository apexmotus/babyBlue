"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CircleSlash, GripVertical, ListChecks, Plus, SlidersHorizontal, ToggleLeft, Type, X } from "lucide-react";
import { Banner, Field, Switch, useToast } from "@/components/ui";
import { QuestionInput } from "@/components/question";
import { deleteQuestion, moveQuestion, newQuestionId, saveQuestion, useDB } from "@/lib/store";
import type { QType, Question } from "@/lib/types";

const TYPE_LABEL: Record<QType, string> = { choice: "Multiple choice", scale: "Scale", yesno: "Yes / no", text: "Free text" };

export default function IntakeBuilder() {
  const db = useDB();
  const toast = useToast();
  const active = db.questions.filter((q) => q.active);
  const inactive = db.questions.filter((q) => !q.active);
  const [editing, setEditing] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pv, setPv] = useState<string | number | undefined>(undefined);

  const previewQ = db.questions.find((q) => q.id === (previewId ?? editing)) ?? active[2] ?? active[0];

  function add(type: Exclude<QType, "text">) {
    const q: Question =
      type === "choice"
        ? { id: newQuestionId(), type, label: "New multiple choice question", options: ["Option 1", "Option 2"], required: true, active: true }
        : type === "scale"
          ? { id: newQuestionId(), type, label: "New scale question", min: 0, max: 5, lowLabel: "None", highLabel: "Severe", required: true, active: true }
          : { id: newQuestionId(), type, label: "New yes / no question", required: true, active: true };
    saveQuestion(q);
    setEditing(q.id);
    setPreviewId(q.id);
    setAdding(false);
    toast("Question added — edit it below");
  }

  return (
    <>
      <div className="flex between center gap12 wrap" style={{ marginBottom: 20 }}>
        <p className="muted">{active.length} active questions · shown to patients after they join the queue</p>
        <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}><Plus size={16} /> Add question</button>
      </div>

      {adding && (
        <section className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="flex between center"><h2 style={{ fontSize: 16 }}>Add a question</h2><button className="icon-btn" aria-label="Close" onClick={() => setAdding(false)}><X size={16} /></button></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginTop: 14 }}>
            {([["choice", ListChecks, "Multiple choice", "Pick one from a list you define"], ["scale", SlidersHorizontal, "Scale", "A number in a range, with end labels"], ["yesno", ToggleLeft, "Yes / no", "Two tap targets, nothing to type"]] as const).map(([t, I, l, d]) => (
              <button key={t} className="card" style={{ padding: 16, textAlign: "left" }} onClick={() => add(t)}>
                <I size={20} color="#1d6f86" />
                <p className="b6 t13" style={{ marginTop: 8 }}>{l}</p>
                <p className="muted t12">{d}</p>
              </button>
            ))}
            <div className="card" style={{ padding: 16, background: "var(--bg)", opacity: 0.8 }}>
              <Type size={20} color="#94a3b8" />
              <p className="b6 t13" style={{ marginTop: 8 }}>Free text <span className="pill sm neutral">Off</span></p>
              <p className="muted t12">Narrative detail belongs in the consult</p>
            </div>
          </div>
        </section>
      )}

      <div className="detail-grid">
        <div className="flex col gap16">
          <section className="card" style={{ padding: 20 }}>
            <div className="flex between center">
              <h2 style={{ fontSize: 16 }}>Active questions</h2>
              <span className="muted t12">Reorder with the arrows</span>
            </div>
            <div className="flex col gap8" style={{ marginTop: 14 }}>
              {active.map((q, i) => (
                <div key={q.id} className="card" style={{ boxShadow: "none", borderColor: editing === q.id ? "var(--primary)" : "var(--border)" }}>
                  <div className="flex center gap12" style={{ padding: "12px 14px" }} onMouseEnter={() => setPreviewId(q.id)}>
                    <GripVertical size={16} color="#94a3b8" />
                    <div className="grow">
                      <p className="b6 t13">{q.label}</p>
                      <p className="muted t12">
                        {TYPE_LABEL[q.type]}
                        {q.type === "choice" ? ` · ${q.options?.length ?? 0} options` : ""}
                        {q.required ? " · required" : " · optional"}
                      </p>
                    </div>
                    <button className="tbtn" disabled={i === 0} onClick={() => moveQuestion(q.id, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                    <button className="tbtn" disabled={i === active.length - 1} onClick={() => moveQuestion(q.id, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                    <button className="tbtn" onClick={() => { setEditing(editing === q.id ? null : q.id); setPreviewId(q.id); }}>{editing === q.id ? "Close" : "Edit"}</button>
                  </div>
                  {editing === q.id && <Editor key={q.id} q={q} onClose={() => setEditing(null)} />}
                </div>
              ))}
              {!active.length && <p className="muted">No active questions — patients go straight to the queue.</p>}
            </div>
          </section>

          {inactive.length > 0 && (
            <section className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16 }}>Switched off</h2>
              <div className="flex col gap8" style={{ marginTop: 12 }}>
                {inactive.map((q) => (
                  <div key={q.id} className="flex center gap12" style={{ padding: "10px 0" }}>
                    <CircleSlash size={16} color="#94a3b8" />
                    <div className="grow">
                      <p className="b6 t13">{q.label}</p>
                      <p className="muted t12">{TYPE_LABEL[q.type]} · {q.note ?? "off"}</p>
                    </div>
                    <button className="tbtn" onClick={() => { saveQuestion({ ...q, active: true }); toast("Question switched on"); }}>Switch on</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <Banner tone="neutral">
            Free-text answers are switched off for this practice. Structured answers keep intake out of the patient&apos;s public view and readable at a glance in the queue.
          </Banner>
        </div>

        <section className="card" style={{ padding: 20, position: "sticky", top: 16 }}>
          <h2 style={{ fontSize: 16 }}>Patient preview</h2>
          {previewQ ? (
            <>
              <p className="muted t12" style={{ marginTop: 4 }}>
                Question {Math.max(1, active.findIndex((q) => q.id === previewQ.id) + 1)} of {active.length}, as it appears on a phone
              </p>
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, marginTop: 14 }}>
                <p className="muted t12" style={{ fontWeight: 600 }}>Question {Math.max(1, active.findIndex((q) => q.id === previewQ.id) + 1)}</p>
                <h3 style={{ fontSize: 17, margin: "6px 0 14px" }}>{previewQ.label}</h3>
                <QuestionInput key={previewQ.id} q={previewQ} value={pv} onChange={setPv} />
              </div>
            </>
          ) : <p className="muted">Nothing to preview.</p>}
        </section>
      </div>
    </>
  );
}

function Editor({ q, onClose }: { q: Question; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Question>(q);
  const [optText, setOptText] = useState((q.options ?? []).join("\n"));
  const [confirmDel, setConfirmDel] = useState(false);
  const options = optText.split("\n").map((s) => s.trim()).filter(Boolean);
  const err = {
    label: !d.label.trim() && "Write the question",
    options: d.type === "choice" && options.length < 2 && "Add at least two options, one per line",
    range: d.type === "scale" && (d.min ?? 0) >= (d.max ?? 5) && "Max must be greater than min",
  };
  const bad = !!(err.label || err.options || err.range);
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: 16, background: "var(--bg)", display: "flex", flexDirection: "column", gap: 14, borderRadius: "0 0 12px 12px" }}>
      <Field label="Question" error={err.label}>
        <input className="input sm" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      </Field>
      <Field label="Question type">
        <select className="select sm" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as QType })}>
          {(["choice", "scale", "yesno"] as QType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </Field>
      {d.type === "choice" && (
        <Field label="Options (one per line)" error={err.options}>
          <textarea className="textarea" style={{ minHeight: 120 }} value={optText} onChange={(e) => setOptText(e.target.value)} />
        </Field>
      )}
      {d.type === "scale" && (
        <>
          <div className="two-col">
            <Field label="Min"><input className="input sm" type="number" min={0} max={9} value={d.min ?? 0} onChange={(e) => setD({ ...d, min: Number(e.target.value) })} /></Field>
            <Field label="Max" error={err.range}><input className="input sm" type="number" min={1} max={10} value={d.max ?? 5} onChange={(e) => setD({ ...d, max: Number(e.target.value) })} /></Field>
          </div>
          <div className="two-col">
            <Field label="Low label"><input className="input sm" value={d.lowLabel ?? ""} onChange={(e) => setD({ ...d, lowLabel: e.target.value })} /></Field>
            <Field label="High label"><input className="input sm" value={d.highLabel ?? ""} onChange={(e) => setD({ ...d, highLabel: e.target.value })} /></Field>
          </div>
        </>
      )}
      <div className="flex center between">
        <span className="b6 t13">Required</span>
        <Switch on={d.required} label="Required" onChange={(v) => setD({ ...d, required: v })} />
      </div>
      <div className="flex center gap8 wrap">
        {confirmDel ? (
          <>
            <span className="t13">Delete this question?</span>
            <button className="btn btn-danger sm" onClick={() => { deleteQuestion(q.id); toast("Question deleted"); }}>Yes, delete</button>
            <button className="btn btn-ghost sm" onClick={() => setConfirmDel(false)}>No</button>
          </>
        ) : (
          <button className="btn btn-danger-soft sm" onClick={() => setConfirmDel(true)}>Delete question</button>
        )}
        <span className="grow" />
        <button className="btn btn-ghost sm" onClick={() => { saveQuestion({ ...q, active: false, note: "switched off" }); toast("Question switched off"); onClose(); }}>Switch off</button>
        <button className="btn btn-ghost sm" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary sm"
          disabled={bad}
          onClick={() => {
            saveQuestion({ ...d, label: d.label.trim(), options: d.type === "choice" ? options : undefined, min: d.type === "scale" ? d.min ?? 0 : undefined, max: d.type === "scale" ? d.max ?? 5 : undefined });
            toast("Question saved");
            onClose();
          }}
        >
          Save question
        </button>
      </div>
    </div>
  );
}
