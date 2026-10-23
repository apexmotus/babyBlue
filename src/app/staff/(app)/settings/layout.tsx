"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/staff/settings", "Hours"],
  ["/staff/settings/blocked", "Blocked time"],
  ["/staff/settings/intake", "Intake questions"],
  ["/staff/settings/practice", "Practice details"],
  ["/staff/settings/staff", "Staff"],
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <div className="page-h" style={{ marginBottom: 16 }}>
        <div>
          <h1>Settings</h1>
          <p>Practice hours, blocked time and the intake questions patients answer</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Settings">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? "on" : ""}>{label}</Link>
        ))}
      </nav>
      {children}
    </>
  );
}
