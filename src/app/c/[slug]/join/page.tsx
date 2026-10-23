"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { Banner, Field, Logo, Modal } from "@/components/ui";
import { clearDevice, isOpenNow, joinQueue, useDB } from "@/lib/store";
import { checkRsaId, makeDemoId, validPhone } from "@/lib/util";

export default function Join() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const db = useDB();
  const dev = db.device;

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [wa, setWa] = useState(true);
  const [idType, setIdType] = useState("RSA ID");
  const [idNo, setIdNo] = useState("");
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [popia, setPopia] = useState(false);
  const [recognised, setRecognised] = useState<boolean | null>(null);

  // Pre-fill once from the remembered device (client-only, after hydration).
  if (recognised === null && typeof window !== "undefined" && db.startedAt) {
    if (dev) {
      setFirst(dev.first);
      setLast(dev.last);
      setPhone(dev.phone);
      setWa(dev.whatsapp);
      setIdType(dev.idType);
      setIdNo(dev.idNumber);
      setRecognised(true);
    } else {
      setRecognised(false);
    }
  }

  const idCheck = idType === "RSA ID" && idNo.trim() ? checkRsaId(idNo) : null;
  const errors = {
    first: !first.trim() && "Enter your first name",
    last: !last.trim() && "Enter your last name",
    phone: !validPhone(phone) && "Enter a South African mobile number, e.g. 082 431 9087",
    id: idCheck && !idCheck.ok && (idCheck.msg ?? "Check this number"),
  };
  const open = isOpenNow(db);

  if (slug !== db.settings.slug) {
    return (
      <Frame>
        <Banner tone="neutral">Joining is only wired up for Rosebank Family Practice in this demo.</Banner>
        <Link className="btn btn-primary" href={`/c/${db.settings.slug}`}>Go to Rosebank Family Practice</Link>
      </Frame>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (errors.first || errors.last || errors.phone || errors.id || !open) return;
    const id = joinQueue({
      first: first.trim(),
      last: last.trim(),
      phone: phone.trim(),
      whatsapp: wa,
      idType,
      idNumber: idNo.trim() || undefined,
      dob: idCheck?.dob,
      consent,
      remember: true,
      source: "qr",
    });
    router.push(`/q/${id}`);
  }

  return (
    <Frame>
      <h1 style={{ fontSize: 24, letterSpacing: -0.5 }}>Join the queue</h1>
      {recognised ? (
        <Banner tone="info" icon={<Sparkles size={16} />}>
          We recognised these details from this device. Nothing is stored until you join.{" "}
          <button
            className="btn-link"
            style={{ color: "var(--primary)", fontWeight: 600 }}
            onClick={() => {
              clearDevice();
              setFirst(""); setLast(""); setPhone(""); setIdNo(""); setConsent(false);
              setRecognised(false);
            }}
          >
            Not you? Clear and start fresh
          </button>
        </Banner>
      ) : (
        <button
          type="button"
          className="btn-link"
          style={{ color: "var(--primary)", alignSelf: "flex-start", fontSize: 13 }}
          onClick={() => {
            setFirst("Thabo"); setLast("Mokone"); setPhone("082 555 0142"); setWa(true); setIdType("RSA ID"); setIdNo(makeDemoId()); setConsent(true);
          }}
        >
          Fill with demo details
        </button>
      )}
      {!open && <Banner tone="warn">The practice is closed, so the queue isn&apos;t taking new patients right now.</Banner>}
      <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="First name" error={tried && errors.first}>
          <input className={`input ${tried && errors.first ? "bad" : ""}`} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="Last name" error={tried && errors.last}>
          <input className={`input ${tried && errors.last ? "bad" : ""}`} value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
        </Field>
        <Field label="Phone number" error={tried && errors.phone}>
          <input className={`input ${tried && errors.phone ? "bad" : ""}`} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="082 000 0000" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} />
          This is my WhatsApp number
        </label>
        <hr className="divider" />
        <p className="b6">Identification <span className="muted" style={{ fontWeight: 400 }}>— optional for a walk-in</span></p>
        <Field label="ID type">
          <select className="select" value={idType} onChange={(e) => setIdType(e.target.value)}>
            {["RSA ID", "Passport", "Asylum / refugee permit", "Other"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field
          label="ID number"
          error={errors.id}
          ok={idCheck?.ok && "Valid ID number"}
          hint={idType === "RSA ID" ? "13 digits" : undefined}
        >
          <input className={`input ${errors.id ? "bad" : ""}`} value={idNo} onChange={(e) => setIdNo(e.target.value)} inputMode={idType === "RSA ID" ? "numeric" : "text"} maxLength={idType === "RSA ID" ? 13 : 20} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree that {db.settings.name} may store my visit records so my care team can see my history on future visits. I can withdraw this at any time.{" "}
            <button type="button" className="btn-link" style={{ color: "var(--primary)" }} onClick={() => setPopia(true)}>POPIA notice</button>
          </span>
        </label>
        <button className="btn btn-primary lg" type="submit" disabled={!open}>Join the queue</button>
        <p className="hint" style={{ textAlign: "center" }}>Your details are used to manage this visit only. We don&apos;t share them with anyone outside the practice.</p>
      </form>
      {popia && (
        <Modal title="POPIA notice" onClose={() => setPopia(false)} small footer={<button className="btn btn-primary" onClick={() => setPopia(false)}>Got it</button>}>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            <ShieldCheck size={15} style={{ verticalAlign: "-2px", color: "var(--primary)" }} /> {db.settings.name} is the responsible party for your information. We keep your name, contact number and ID number only if you tick the consent box, and only for this practice. You can ask the practice to remove them at any time.{" "}
            <Link href="/popia">Read more</Link>
          </p>
        </Modal>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="m-wrap">
      <div className="m-app">
        <div className="m-head">
          <Logo />
          <Link href={`/c/${slug}`} className="t13 muted flex center gap8"><ArrowLeft size={14} /> Back</Link>
        </div>
        <div className="m-body">{children}</div>
      </div>
    </div>
  );
}
