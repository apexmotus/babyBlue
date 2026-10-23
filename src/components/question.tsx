"use client";

import { Check } from "lucide-react";
import type { Question } from "@/lib/types";

export function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string | number | undefined;
  onChange: (v: string | number) => void;
}) {
  if (q.type === "choice") {
    return (
      <div className="flex col gap8">
        {(q.options ?? []).map((o) => (
          <button key={o} type="button" className={`choice ${value === o ? "on" : ""}`} onClick={() => onChange(o)} aria-pressed={value === o}>
            {o}
            {value === o && <Check size={18} />}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "yesno") {
    return (
      <div className="two-col" style={{ gap: 10 }}>
        {["Yes", "No"].map((o) => (
          <button
            key={o}
            type="button"
            className={`choice ${value === o ? "on" : ""}`}
            style={{ justifyContent: "center", minHeight: 64, fontSize: 17 }}
            onClick={() => onChange(o)}
            aria-pressed={value === o}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  const min = q.min ?? 0;
  const max = q.max ?? 5;
  const nums = Array.from({ length: Math.max(1, max - min + 1) }, (_, i) => min + i);
  return (
    <div>
      <div className="scale" style={{ gridTemplateColumns: `repeat(${Math.min(nums.length, 6)}, 1fr)` }}>
        {nums.map((n) => (
          <button key={n} type="button" className={value === n ? "on" : ""} onClick={() => onChange(n)} aria-pressed={value === n}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex between muted t12" style={{ marginTop: 8 }}>
        <span>{min} — {(q.lowLabel ?? "low").toLowerCase()}</span>
        <span>{max} — {(q.highLabel ?? "high").toLowerCase()}</span>
      </div>
    </div>
  );
}
