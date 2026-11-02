"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getPlatformRole, listMemberships, type MembershipRow } from "@/lib/api/practice";
import { useSession, type Session } from "@/local/auth";
import { useQuery } from "@/local/hooks";

export type { PracticeRole } from "@/lib/api/practice";
import type { PracticeRole } from "@/lib/api/practice";

export interface PracticeRef {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "active" | "suspended";
  province: string | null;
  role: PracticeRole;
  min_notice_minutes: number;
  cancellation_notice_hours: number;
  /** The practice's own IANA zone. Date arithmetic belongs in the procedures, not here. */
  timezone: string;
  city: string | null;
}

/**
 * `practice_memberships_list` names the key `practice_id`; the OS has always called it `id`.
 * Mapped in one place rather than renaming the field across every screen.
 */
function toPracticeRef(r: MembershipRow): PracticeRef {
  // `pg_proc` carries no nullability for `returns table` columns, so the generator types every
  // text column as nullable. These are all NOT NULL in the schema; coalescing here keeps that
  // assumption in one place instead of spreading `?? ""` through every screen.
  return {
    id: r.practice_id,
    name: r.name ?? "",
    slug: r.slug ?? "",
    status: (r.status ?? "pending") as PracticeRef["status"],
    province: r.province,
    role: (r.role ?? "staff") as PracticeRole,
    min_notice_minutes: r.min_notice_minutes,
    cancellation_notice_hours: r.cancellation_notice_hours,
    timezone: r.timezone ?? "Africa/Johannesburg",
    city: r.city,
  };
}
export interface Prefill { date?: string; time?: string; practitionerId?: string; clientId?: string }

interface Ctx {
  session: Session;
  uid: string;
  practices: PracticeRef[];
  practice: PracticeRef | null;
  role: PracticeRole | null;
  isOwner: boolean;
  platformRole: "platform_admin" | "marketing_operator" | null;
  loading: boolean;
  setPracticeId: (id: string) => void;
  newAppointment: (p?: Prefill) => void;
  openAppointment: (id: string) => void;
  newAppt: { open: boolean; prefill: Prefill };
  closeNewAppt: () => void;
  apptId: string | null;
  closeAppointment: () => void;
}

const OsCtx = createContext<Ctx | null>(null);
export const useOs = () => {
  const c = useContext(OsCtx);
  if (!c) throw new Error("useOs outside OsProvider");
  return c;
};

export const PRACTICE_KEY = "bb_practice_id";

/** Colours used to tell practitioners apart on the calendar and lists. */
export const PRAC_COLORS = [
  { solid: "#3097b2", bg: "#e3f3f8", ink: "#14586b" },
  { solid: "#3f9a76", bg: "#e4f3ec", ink: "#1f5d44" },
  { solid: "#8b6cd6", bg: "#eee9fb", ink: "#4d3a8a" },
  { solid: "#d9962b", bg: "#fdf1d9", ink: "#7a5200" },
  { solid: "#d86a8c", bg: "#fbe6ed", ink: "#8a2c4a" },
  { solid: "#5e7d8c", bg: "#e8eef1", ink: "#2c4757" },
] as const;

export function OsProvider({ session, children }: { session: Session; children: ReactNode }) {
  const uid = session.userId;
  // `practice_memberships_list()` keys on auth.uid() inside the procedure, so there is no user
  // id to pass and no way for a caller to ask about someone else's memberships.
  const memberships = useQuery(
    () => listMemberships(uid).then((rows) => rows.map(toPracticeRef)),
    [uid],
  );
  const platform = useQuery(() => getPlatformRole(uid), [uid]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [newAppt, setNewAppt] = useState<{ open: boolean; prefill: Prefill }>({ open: false, prefill: {} });
  const [apptId, setApptId] = useState<string | null>(null);

  useEffect(() => setChosen(localStorage.getItem(PRACTICE_KEY)), []);
  const practices = memberships.data ?? [];
  const practice = practices.find((p) => p.id === chosen) ?? practices[0] ?? null;

  const setPracticeId = useCallback((id: string) => {
    localStorage.setItem(PRACTICE_KEY, id);
    setChosen(id);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      session, uid, practices, practice, role: practice?.role ?? null, isOwner: practice?.role === "practice_owner",
      platformRole: (platform.data as Ctx["platformRole"]) ?? null,
      loading: memberships.loading && !memberships.data,
      setPracticeId,
      newAppointment: (p = {}) => setNewAppt({ open: true, prefill: p }),
      closeNewAppt: () => setNewAppt({ open: false, prefill: {} }),
      newAppt,
      openAppointment: setApptId,
      closeAppointment: () => setApptId(null),
      apptId,
    }),
    [session, uid, practices, practice, platform.data, memberships.loading, memberships.data, setPracticeId, newAppt, apptId],
  );
  return <OsCtx.Provider value={value}>{children}</OsCtx.Provider>;
}

export { useSession };
