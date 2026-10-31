"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarX2 } from "lucide-react";
import { Empty } from "@/components/app/primitives";
import { addDaysKey, dayKey, dayStart, fmtDayMonth, fmtTime, fmtWeekday, minutesOfDay, relativeDay, todayKey } from "@/lib/format";
import { getSlots, type Slot } from "@/lib/patient-data";
import { useQuery } from "@/local/hooks";

/** Real, server-computed availability: a 14-day date strip and time buttons grouped by part of day. */
export function SlotPicker({ userId, practitionerId, serviceId, value, onChange, days = 14, onLoaded }: {
  userId: string | null; practitionerId: string; serviceId: string | null; value: string | null; onChange: (iso: string | null) => void; days?: number; onLoaded?: (slots: Slot[]) => void;
}) {
  const slots = useQuery(() => (serviceId ? getSlots(userId, practitionerId, serviceId, days) : Promise.resolve([] as Slot[])), [userId, practitionerId, serviceId, days], { enabled: !!serviceId, poll: 20000 });
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) {
      const k = dayKey(s.starts_at);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [slots.data]);
  const keys = useMemo(() => Array.from({ length: days }, (_, i) => addDaysKey(todayKey(), i)), [days]);
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => { if (slots.data) onLoaded?.(slots.data); }, [slots.data, onLoaded]);
  // Keep the selected day valid: follow the selected slot, else jump to the first day that has times.
  useEffect(() => {
    if (!slots.data) return;
    if (value) { const k = dayKey(value); if (byDay.has(k)) { setDay(k); return; } }
    if (!day || !byDay.has(day)) setDay(keys.find((k) => byDay.has(k)) ?? null);
  }, [slots.data, byDay, keys, value, day]);

  if (!serviceId) return <p className="a-hint">Choose a service to see available times.</p>;
  if (slots.loading && !slots.data) {
    return (
      <div aria-busy="true">
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="a-skel" style={{ width: 58, height: 74, borderRadius: 16 }} />)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="a-skel" style={{ height: 44, borderRadius: 13 }} />)}</div>
      </div>
    );
  }
  if (byDay.size === 0) {
    return <Empty icon={<CalendarX2 size={26} />} title="No times in the next 2 weeks">This practitioner has no open slots right now. Try another service or check back soon.</Empty>;
  }

  const list = day ? byDay.get(day) ?? [] : [];
  const group = (from: number, to: number) => list.filter((s) => { const m = minutesOfDay(s.starts_at); return m >= from && m < to; });
  const groups = [["Morning", group(0, 720)], ["Afternoon", group(720, 1020)], ["Evening", group(1020, 1440)]] as const;

  return (
    <div>
      <div className="pt-dates" role="group" aria-label="Choose a date">
        {keys.map((k) => {
          const d = new Date(dayStart(k).getTime() + 3600000);
          const has = byDay.has(k);
          return (
            <button key={k} className="pt-date" disabled={!has} aria-pressed={day === k} onClick={() => setDay(k)} aria-label={`${relativeDay(d)}${has ? "" : ", no times"}`}>
              <small>{fmtWeekday(d)}</small>
              <b>{fmtDayMonth(d).split(" ")[0]}</b>
              {has ? <i /> : <i style={{ background: "transparent" }} />}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 8 }}>
        {groups.map(([name, items]) => items.length > 0 && (
          <div key={name} className="pt-slotgroup">
            <h4>{name}</h4>
            <div className="pt-slots">
              {items.map((s) => {
                const iso = s.starts_at.toISOString();
                return <button key={iso} className="pt-slot tnum" aria-pressed={value === iso} onClick={() => onChange(value === iso ? null : iso)}>{fmtTime(s.starts_at)}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
