"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { Spinner } from "@/components/app/primitives";
import { useSession } from "@/local/auth";

function Guard({ children }: { children: ReactNode }) {
  const { session, ready } = useSession("patient");
  const router = useRouter();
  const path = usePathname();
  const qs = useSearchParams().toString();
  useEffect(() => {
    if (ready && !session) router.replace(`/patient/login?next=${encodeURIComponent(path + (qs ? `?${qs}` : ""))}`);
  }, [ready, session, router, path, qs]);
  if (!ready || !session) return <div style={{ display: "grid", placeItems: "center", padding: 80 }}><Spinner /></div>;
  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}
