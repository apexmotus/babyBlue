"use client";

import { useEffect, useState } from "react";
import { Switch, useToast } from "@/components/ui";
import { saveSettings, useDB } from "@/lib/store";
import type { DayHours } from "@/lib/types";
import { DAYS, toMins } from "@/lib/util";

export default function Hours() {
  const db = useDB();
  const toast = useToast();
  const [hours, setHours] = useState<DayHours[]>(db.settings.hours);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (db.startedAt && !synced) {
      setHours(db.settings.hours);
      setSynced(true);
    }
  }, [db.startedAt, db.settings.hours, synced]);

  const bad = hours.map((h) => !h.closed && toMins(h.close) <= toMins(h.open));
  const dirty = JSON.stringify(hours) !== JSON.stringify(db.settings.hours);
  const set = (i: number, patch: Partial<DayHours>) => setHours((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  return (
    <div className="flex col gap16" style={{ maxWidth: 760 }}>
      <section className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17 }}>Practice hours</h2>
        <p className="muted t13" style={{ marginTop: 4 }}>Patients can only join the queue while you&apos;re open.</p>
        <div className="flex col" style={{ marginTop: 14 }}>
          {hours.map((h, i) => (
            <div key={i} className="flex center gap12 wrap" style={{ padding: "10px 0", borderTop: i ? "1px solid var(--border)" : 0 }}>
              <span className="b6" style={{ width: 100 }}>{DAYS[i]}</span>
              <Switch on={!h.closed} label={`${DAYS[i]} open`} onChange={(v) => set(i, v ? { closed: false, open: h.open || "08:00", close: h.close || "12:00" } : { closed: true })} />
              {h.closed ? (
                <span className="muted">Closed</span>
              ) : (
                <>
                  <input type="time" className="input sm" style={{ width: 120 }} value={h.open} onChange={(e) => set(i, { open: e.target.value })} aria-label={`${DAYS[i]} opens`} />
                  <span className="muted">to</span>
                  <input type="time" className={`input sm ${bad[i] ? "bad" : ""}`} style={{ width: 120 }} value={h.close} onChange={(e) => set(i, { close: e.target.value })} aria-label={`${DAYS[i]} closes`} />
                  {bad[i] && <span className="error-text">Closing time must be after opening</span>}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap8" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-ghost" disabled={!dirty} onClick={() => setHours(db.settings.hours)}>Discard</button>
          <button className="btn btn-primary" disabled={!dirty || bad.some(Boolean)} onClick={() => { saveSettings({ hours }); toast("Hours saved"); }}>Save hours</button>
        </div>
      </section>

      <section className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17 }}>Estimates</h2>
        <p className="muted t13" style={{ marginTop: 4 }}>
          Estimates use your average consult duration until there are enough real consults to measure. Today&apos;s median is {db.settings.medianWait} minutes.
        </p>
        <div className="flex center between gap16" style={{ marginTop: 16 }}>
          <div>
            <p className="b6 t13">Show estimates to patients</p>
            <p className="muted t12">Always labelled “Estimated”, never as a time slot</p>
          </div>
          <Switch on={db.settings.showEstimates} label="Show estimates to patients" onChange={(v) => { saveSettings({ showEstimates: v }); toast(v ? "Patients will see estimates" : "Estimates hidden from patients"); }} />
        </div>
      </section>
    </div>
  );
}
