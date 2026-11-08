"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onDbChange } from "./db";

/**
 * Run an async query and keep it fresh: re-runs when deps change, when any tab writes to the database,
 * and optionally on an interval. The previous data stays visible while refreshing (no flicker).
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[], opts: { poll?: number; enabled?: boolean } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const enabled = opts.enabled ?? true;

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++run.current;
    try {
      const out = await fnRef.current();
      if (id === run.current) {
        setData(out);
        setError(null);
      }
    } catch (e) {
      if (id === run.current) setError(e as Error);
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, [enabled]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = JSON.stringify(deps);
  useEffect(() => {
    setLoading(true);
    load();
  }, [key, load]);
  useEffect(() => onDbChange(load), [load]);
  useEffect(() => {
    if (!opts.poll || !enabled) return;
    const t = setInterval(load, opts.poll);
    return () => clearInterval(t);
  }, [opts.poll, enabled, load]);

  return { data, error, loading, reload: load };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
