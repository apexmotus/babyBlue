"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui";
import { NAV } from "@/lib/site";

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="x-nav">
      <div className="x-container x-nav-in">
        <Logo size={34} />
        <nav className="x-nav-links" aria-label="Primary">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="x-nav-cta">
          <Link href="/contact" className="x-btn x-btn-outline x-btn-sm">Contact</Link>
          <Link href="/practice/login" className="x-btn x-btn-outline x-btn-sm">Practice login</Link>
          <Link href="/patient" className="x-btn x-btn-primary x-btn-sm">Open the app</Link>
          <button ref={btn} className="x-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="x-drawer" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <div id="x-drawer" className="x-drawer" role="dialog" aria-label="Menu">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="x-dl" aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
          <Link href="/os" className="x-dl">BabyBlue OS</Link>
          <Link href="/flow" className="x-dl">BabyBlue Flow</Link>
          <Link href="/contact" className="x-dl">Contact</Link>
          <Link href="/practice/login" className="x-dl">Practice login</Link>
          <Link href="/patient" className="x-btn x-btn-primary" style={{ marginTop: 24 }}>Open the app</Link>
        </div>
      )}
    </header>
  );
}
