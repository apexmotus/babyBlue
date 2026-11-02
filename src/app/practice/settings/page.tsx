"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn, Field, Notice } from "@/components/app/primitives";
import { OwnerOnly } from "@/components/os/OwnerOnly";
import { useOs } from "@/components/os/OsContext";
import { useToast } from "@/components/ui";
import { getSettings, listLocations, updateSettings, upsertLocation } from "@/lib/api/practice";
import { listCities } from "@/lib/api/public";
import { friendlyError } from "@/lib/api/messages";
import { useQuery } from "@/local/hooks";

/**
 * Province is no longer typed in. After the 4NF change a location references a city, and the
 * province is a property of that city — so storing it again on the practice could disagree with
 * the city it claims to be in. Pick the city; the province follows.
 */

export default function SettingsPage() {
  return <OwnerOnly><Settings /></OwnerOnly>;
}

function Settings() {
  const os = useOs();
  const toast = useToast();
  const p = os.practice!;
  const settings = useQuery(() => getSettings(os.uid, p.id), [p.id, os.uid]);
  const locations = useQuery(() => listLocations(os.uid, p.id), [p.id, os.uid]);
  const cities = useQuery(() => listCities(os.uid), [os.uid]);

  const primary = (locations.data ?? []).find((l) => l.is_primary) ?? locations.data?.[0] ?? null;
  const [f, setF] = useState({
    name: p.name,
    timezone: p.timezone,
    notice: String(p.min_notice_minutes),
    cancel: String(p.cancellation_notice_hours),
    address: "",
    cityId: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setF((x) => ({
        ...x,
        name: settings.data!.name ?? x.name,
        timezone: settings.data!.timezone ?? x.timezone,
        notice: String(settings.data!.min_notice_minutes),
        cancel: String(settings.data!.cancellation_notice_hours),
      }));
    }
  }, [settings.data]);

  useEffect(() => {
    if (primary) setF((x) => ({ ...x, address: primary.address ?? "", cityId: primary.city_id ?? "" }));
  }, [primary?.location_id, primary?.address, primary?.city_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const province = cities.data?.find((c) => c.city_id === f.cityId)?.province ?? settings.data?.province ?? null;

  async function save() {
    const notice = Number(f.notice), cancel = Number(f.cancel);
    if (f.name.trim().length < 2) return toast("Enter the practice name");
    if (!(notice >= 0) || !(cancel >= 0)) return toast("Notice periods must be zero or more");
    setBusy(true);
    try {
      await updateSettings(os.uid, p.id, {
        name: f.name.trim(),
        timezone: f.timezone,
        min_notice_minutes: notice,
        cancellation_notice_hours: cancel,
      });

      // One upsert whether or not the practice already has a primary location.
      await upsertLocation(os.uid, p.id, {
        location_id: primary?.location_id ?? null,
        name: primary?.name ?? "Main rooms",
        address: f.address.trim() || null,
        city_id: f.cityId || null,
        is_primary: true,
      });

      toast("Settings saved");
      settings.reload();
      locations.reload();
    } catch (e) { toast(friendlyError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="os-page-h"><div><h1>Settings</h1><p>Practice details and booking rules.</p></div></div>
      <div className="os-grid even" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
        <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 style={{ fontSize: 18 }}>Practice details</h2>
          <Field label="Practice name" htmlFor="n"><input id="n" className="a-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="two-col" style={{ gap: 14 }}>
            <Field label="Street address" htmlFor="a"><input id="a" className="a-input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Field label="City" htmlFor="c" hint="Sets the province and where patients find you.">
              <select id="c" className="a-select" value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value })}>
                <option value="">Select…</option>
                {(cities.data ?? []).map((c) => <option key={c.city_id} value={c.city_id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Province" htmlFor="pr" hint="Follows the city you chose.">
            <input id="pr" className="a-input" value={province ?? ""} readOnly disabled />
          </Field>
          <Field label="Timezone" htmlFor="tz" hint="Booking times and leave are worked out in this zone.">
            <input id="tz" className="a-input" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
          </Field>
          <hr className="a-divider" />
          <h2 style={{ fontSize: 18 }}>Booking rules</h2>
          <div className="two-col" style={{ gap: 14 }}>
            <Field label="Minimum notice to book (minutes)" htmlFor="mn" hint="Patients can't book a time sooner than this."><input id="mn" type="number" min={0} step={15} className="a-input" value={f.notice} onChange={(e) => setF({ ...f, notice: e.target.value })} /></Field>
            <Field label="Free cancellation window (hours)" htmlFor="cw" hint="Patients can cancel or move online until this long before."><input id="cw" type="number" min={0} step={1} className="a-input" value={f.cancel} onChange={(e) => setF({ ...f, cancel: e.target.value })} /></Field>
          </div>
          <div><Btn className="primary" loading={busy} onClick={save}>Save settings</Btn></div>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ fontSize: 18 }}>Status</h2>
            <p style={{ color: "var(--ink-2)" }}>{p.status === "active" ? "Your practice is live. Listed practitioners can be found and booked." : p.status === "pending" ? "Your practice is awaiting activation." : "Your practice is suspended."}</p>
            <p className="a-hint">Web address: <code>/patient/join/{p.slug}</code></p>
          </section>
          <section className="a-card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ fontSize: 18 }}>Privacy & data</h2>
            <Notice tone="info">Each practice&apos;s data is kept separate from every other practice, access is role-based, and client health information is never used to target marketing. See the <Link href="/popia" target="_blank">POPIA position</Link>.</Notice>
          </section>
        </div>
      </div>
    </>
  );
}
