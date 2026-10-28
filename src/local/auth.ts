"use client";

import { useCallback, useEffect, useState } from "react";
import { announceChange, system } from "./db";
import { parseWhatsApp } from "@/lib/phone";
import { hashPassword, newSalt, verifyPassword } from "./crypto";

export type AppKey = "patient" | "practice";
export interface Session {
  userId: string;
  email: string;
  name: string;
}

const key = (app: AppKey) => `bb_session_${app}`;
const EVT = "bb-session-change";

export function readSession(app: AppKey): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(app));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeSession(app: AppKey, s: Session | null) {
  if (s) localStorage.setItem(key(app), JSON.stringify(s));
  else localStorage.removeItem(key(app));
  window.dispatchEvent(new Event(EVT));
}

/** Reactive session for one of the two apps. `ready` is false until the first client render. */
export function useSession(app: AppKey) {
  // Read synchronously: these screens only render on the client, after the local database is ready.
  const [session, setSession] = useState<Session | null>(() => readSession(app));
  const [ready, setReady] = useState(() => typeof window !== "undefined");
  useEffect(() => {
    const sync = () => {
      setSession(readSession(app));
      setReady(true);
    };
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [app]);
  const signOut = useCallback(() => writeSession(app, null), [app]);
  return { session, ready, signOut };
}

export class AuthError extends Error {}

/** Public sign-up asks for a name, an email and a WhatsApp-compatible mobile number, and nothing else (no ID numbers). */
export async function signUp(app: AppKey, email: string, password: string, name: string, whatsapp?: string): Promise<Session> {
  const e = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new AuthError("Enter a valid email address.");
  if (password.length < 8) throw new AuthError("Use at least 8 characters for your password.");
  if (name.trim().length < 2) throw new AuthError("Please tell us your name.");
  let phone: string | undefined;
  if (app === "patient" || whatsapp?.trim()) {
    const r = parseWhatsApp(whatsapp ?? "");
    if (!r.ok) throw new AuthError(r.message);
    phone = r.e164;
  }
  const exists = await system("select 1 from auth.users where email = $1", [e]);
  if (exists.length) throw new AuthError("An account with this email already exists. Try signing in instead.");
  const salt = newSalt();
  const hash = await hashPassword(password, salt);
  const [u] = await system<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id", [e, JSON.stringify({ display_name: name.trim(), ...(phone ? { phone } : {}) })]);
  await system("insert into auth.credentials (user_id, salt, hash) values ($1, $2, $3)", [u.id, salt, hash]);
  const s = { userId: u.id, email: e, name: name.trim() };
  writeSession(app, s);
  announceChange();
  return s;
}

export async function signIn(app: AppKey, email: string, password: string): Promise<Session> {
  const e = email.trim().toLowerCase();
  const rows = await system<{ id: string; salt: string; hash: string; display_name: string | null }>(
    "select u.id, c.salt, c.hash, p.display_name from auth.users u join auth.credentials c on c.user_id = u.id left join public.profiles p on p.id = u.id where u.email = $1",
    [e],
  );
  const r = rows[0];
  if (!r || !(await verifyPassword(password, r.salt, r.hash))) throw new AuthError("That email and password don't match. Check them and try again.");
  const s = { userId: r.id, email: e, name: r.display_name ?? e };
  writeSession(app, s);
  return s;
}
