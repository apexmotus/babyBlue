"use client";

import { useState } from "react";
import { CalendarOff, Pencil, Plus } from "lucide-react";
import { Field, Modal, useToast } from "@/components/ui";
import { deleteBlock, saveBlock, useDB } from "@/lib/store";
import type { Block } from "@/lib/types";
import { DAYS, toMins, weekdayShort } from "@/lib/util";

const describe = (b: Block) => {
  const when = b.date ? weekdayShort(b.date) : "repeats weekly";
  const time = b.allDay ? "all day" : `${b.start}–${b.end}`;
  return b.date ? `${when}, ${time}${b.doctor ? "" : ""}` : `${time} · ${when}`;
};

export default function Blocked() {
  const db = useDB();
  const [edit, setEdit] = useState<Block | "new" | null>(null);
  return (
    <div style={{ maxWidth: 760 }}>
      <section className="card" style={{ padding: 24 }}>
        <div className="flex between center gap12 wrap">
          <div>
            <h2 style={{ fontSize: 17 }}>Blocked time</h2>
            <p className="muted t13" style={{ marginTop: 4 }}>Nobody can be booked into these windows and the queue pauses.</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setEdit("new")}><Plus size={16} /> Add block</button>
        </div>
        <div className="flex col" style={{ marginTop: 14 }}>
          {db.settings.blocks.map((b, i) => (
            <div key={b.id} className="flex center gap12" style={{ padding: "14px 0", borderTop: i ? "1px solid var(--border)" : "1px solid var(--border)" }}>
              <span className="avatar" style={{ background: "var(--warn-50)", color: "var(--warn-d)" }}><CalendarOff size={18} /></span>
              <div className="grow">
                <p className="b6 t13">{b.title}</p>
                <p className="muted t12">{describe(b)}{b.doctor ? ` · ${b.doctor}` : ""}</p>
              </div>
              <button className="tbtn" onClick={() => setEdit(b)}><Pencil size={13} /> Edit</button>
            </div>
          ))}
          {!db.settings.blocks.length && <p className="muted" style={{ padding: "20px 0" }}>No blocked time.</p>}
        </div>
      </section>
      {edit && <BlockModal key={edit === "new" ? "new" : edit.id} block={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BlockModal({ block, onClose }: { block: Block | null; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const [title, setTitle] = useState(block?.title ?? "");
  const [repeat, setRepeat] = useState(block ? !block.date : false);
  const [date, setDate] = useState(block?.date ?? "2026-10-16");
  const [days, setDays] = useState<number[]>(block?.days ?? [0, 1, 2, 3, 4]);
  const [allDay, setAllDay] = useState(!!block?.allDay);
  const [start, setStart] = useState(block?.start ?? "13:00");
  const [end, setEnd] = useState(block?.end ?? "13:45");
  const [doctor, setDoctor] = useState(block?.doctor ?? "");
  const [tried, setTried] = useState(false);
  const timeBad = !allDay && toMins(end) <= toMins(start);
  const bad = !title.trim() || timeBad || (repeat && !days.length) || (!repeat && !date);
  return (
    <Modal
      title={block ? "Edit blocked time" : "Add blocked time"}
      onClose={onClose}
      small
      footer={
        <>
          {block && (
            <button className="btn btn-danger-soft" style={{ marginRight: "auto" }} onClick={() => { deleteBlock(block.id); toast("Block removed"); onClose(); }}>Delete</button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTried(true);
              if (bad) return;
              const next: Block = { id: block?.id ?? `b${Date.now().toString(36)}`, title: title.trim(), start: allDay ? "00:00" : start, end: allDay ? "23:59" : end, allDay: allDay || undefined, doctor: doctor || undefined, ...(repeat ? { days } : { date }) };
              saveBlock(next);
              toast("Block saved");
              onClose();
            }}
          >
            Save block
          </button>
        </>
      }
    >
      <Field label="Title" error={tried && !title.trim() && "Give this block a name"}>
        <input className="input sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Staff meeting" />
      </Field>
      <label className="check"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Repeats weekly</label>
      {repeat ? (
        <div className="field">
          <label>Days</label>
          <div className="seg">
            {DAYS.map((d, i) => (
              <button key={d} className={days.includes(i) ? "on" : ""} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{d.slice(0, 3)}</button>
            ))}
          </div>
          {tried && !days.length && <span className="error-text">Pick at least one day</span>}
        </div>
      ) : (
        <Field label="Date"><input type="date" className="input sm" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      )}
      <label className="check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day</label>
      {!allDay && (
        <div className="two-col">
          <Field label="From"><input type="time" className="input sm" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="To" error={timeBad && "Must be after the start"}><input type="time" className={`input sm ${timeBad ? "bad" : ""}`} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
      )}
      <Field label="Applies to">
        <select className="select sm" value={doctor} onChange={(e) => setDoctor(e.target.value)}>
          <option value="">Whole practice</option>
          {db.settings.doctors.map((d) => <option key={d}>{d}</option>)}
        </select>
      </Field>
    </Modal>
  );
}
