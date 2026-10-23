"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Empty } from "@/components/app/primitives";
import { useOs } from "@/components/os/OsContext";

/** Pages for practice owners only. Row-level security enforces this in the database too. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const os = useOs();
  if (!os.practice) return null;
  if (!os.isOwner)
    return (
      <div className="a-card"><Empty icon={<Lock size={26} />} title="Owners only" action={<Link href="/practice" className="a-btn primary">Back to dashboard</Link>}>Your role ({os.role?.replace("practice_", "")}) doesn&apos;t include this area. Ask a practice owner for access.</Empty></div>
    );
  return <>{children}</>;
}
