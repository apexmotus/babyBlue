"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { Logo } from "@babyblue/flow-demo/components/ui";
import { NAV, PRO_NAV } from "@/lib/site";

/** "patient" is the public site. "pro" is the practitioner site, which patients are never sent to. */
export function Nav({ variant = "patient" }: { variant?: "patient" | "pro" }) {
  const pro = variant === "pro";
  const links = pro ? PRO_NAV : NAV;
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);

  // Transparent over the hero; gains a glass ground and hairline once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobile menu: lock page scroll, move focus in, keep Tab inside, close on Escape and give focus back.
  useEffect(() => {
    if (!open) return;
    const toggle = btn.current;
    drawer.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle?.focus();
        return;
      }
      if (e.key !== "Tab" || !drawer.current || !toggle) return;
      const items = [...drawer.current.querySelectorAll<HTMLElement>("a[href]"), toggle];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // Growing past the mobile breakpoint with the menu open would strand the scroll lock.
    const mq = window.matchMedia("(min-width: 1081px)");
    const onMq = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onMq);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      mq.removeEventListener("change", onMq);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`x-nav ${scrolled ? "is-scrolled" : ""} ${open ? "is-open" : ""}`}>
      <div className="x-container x-nav-in">
        <Logo size={34} href={pro ? "/practitioners" : "/"} />
        <nav className="x-nav-links" aria-label="Primary">
          {links.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="x-nav-cta">
          {pro ? (
            <>
              <Link href="/practice/login" className="x-nav-text">Practice login</Link>
              <Link href="/practitioners/contact" className="x-btn x-btn-primary x-btn-sm">Talk to us</Link>
            </>
          ) : (
            <>
              <Link href="/patient/login" className="x-nav-text">Sign in</Link>
              <Link href="/patient" className="x-btn x-btn-primary x-btn-sm"><Search size={16} aria-hidden="true" /> Find care</Link>
            </>
          )}
          <button ref={btn} className="x-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="x-drawer" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <div id="x-drawer" ref={drawer} className="x-drawer" role="dialog" aria-label="Menu">
          {links.map((n) => (
            <Link key={n.href} href={n.href} className="x-dl" aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
          {pro ? (
            <>
              <Link href="/practice/login" className="x-dl">Practice login</Link>
              <Link href="/practitioners/contact" className="x-btn x-btn-primary" style={{ marginTop: 24 }}>Talk to us</Link>
            </>
          ) : (
            <>
              <Link href="/patient/login" className="x-dl">Sign in</Link>
              <Link href="/patient" className="x-btn x-btn-primary" style={{ marginTop: 24 }}><Search size={18} aria-hidden="true" /> Find care</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
