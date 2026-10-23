"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Field, useToast } from "@/components/ui";
import { saveSettings, useDB } from "@/lib/store";
import { validPhone } from "@/lib/util";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

export default function Practice() {
  const db = useDB();
  const toast = useToast();
  const s = db.settings;
  const [name, setName] = useState(s.name);
  const [slug, setSlug] = useState(s.slug);
  const [address, setAddress] = useState(s.address);
  const [phone, setPhone] = useState(s.phone);
  const [avg, setAvg] = useState(s.avgConsult);
  const [synced, setSynced] = useState(false);
  const [qr, setQr] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (db.startedAt && !synced) {
      setName(s.name); setSlug(s.slug); setAddress(s.address); setPhone(s.phone); setAvg(s.avgConsult);
      setSynced(true);
    }
  }, [db.startedAt, s, synced]);
  useEffect(() => setOrigin(window.location.origin), []);

  const url = origin ? `${origin}/c/${s.slug}` : "";
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 640, color: { dark: "#0b5aa8", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, [url]);

  const errors = { name: !name.trim(), slug: slug.length < 3, address: address.trim().length < 6, phone: !validPhone(phone) };
  const dirty = name !== s.name || slug !== s.slug || address !== s.address || phone !== s.phone || avg !== s.avgConsult;
  const slugChanged = slug !== s.slug;

  return (
    <div className="detail-grid" style={{ maxWidth: 1000 }}>
      <section className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 style={{ fontSize: 17 }}>Practice details</h2>
        <Field label="Practice name" error={errors.name && "Required"}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Patient link" error={errors.slug && "Use at least 3 characters"} hint={slugChanged ? "Changing the slug breaks existing QR codes and patient links." : undefined}>
          <div className="flex center" style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <span className="muted t13" style={{ padding: "0 4px 0 14px", whiteSpace: "nowrap" }}>bby.co.za/c/</span>
            <input className="input" style={{ border: 0, boxShadow: "none", paddingLeft: 0 }} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          </div>
        </Field>
        <Field label="Street address" error={errors.address && "Required"}><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Reception phone" error={errors.phone && "Enter a South African phone number"}><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Average consult duration" hint="Drives the estimates patients see.">
          <select className="select" value={avg} onChange={(e) => setAvg(Number(e.target.value))}>{[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select>
        </Field>
        <div className="flex gap8" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" disabled={!dirty} onClick={() => { setName(s.name); setSlug(s.slug); setAddress(s.address); setPhone(s.phone); setAvg(s.avgConsult); }}>Discard</button>
          <button className="btn btn-primary" disabled={!dirty || Object.values(errors).some(Boolean)} onClick={() => { saveSettings({ name: name.trim(), slug, address: address.trim(), phone: phone.trim(), avgConsult: avg }); toast("Practice details saved"); }}>Save changes</button>
        </div>
      </section>
      <section className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17 }}>Patient QR code</h2>
        <p className="muted t13" style={{ marginTop: 4 }}>Print this for reception. It opens bby.co.za/c/{s.slug}.</p>
        <div style={{ margin: "16px 0", border: "1px solid var(--border)", borderRadius: 16, padding: 14, textAlign: "center", background: "#fff" }}>
          {qr ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr} alt={`QR code linking to ${url}`} style={{ width: "100%", maxWidth: 240 }} /> : <div style={{ height: 240 }} />}
          <p className="b6 t13" style={{ marginTop: 6 }}>{s.name}</p>
          <p className="muted t12">Scan to join the queue</p>
        </div>
        <div className="flex gap8 wrap">
          <button className="btn btn-secondary sm" onClick={() => { navigator.clipboard?.writeText(url).then(() => toast("Link copied"), () => toast("Copy failed — select the link manually")); }}><Copy size={14} /> Copy link</button>
          <a className="btn btn-secondary sm" href={qr} download={`${s.slug}-qr.png`} aria-disabled={!qr}><Download size={14} /> Download QR</a>
          <Link className="btn btn-primary sm" href={`/c/${s.slug}`} target="_blank"><ExternalLink size={14} /> Open patient app</Link>
        </div>
      </section>
    </div>
  );
}
