"use client";

import { useSyncExternalStore } from "react";

/** Device-local flag used to demo the "offline / reconnecting" patient state (P8). */
let simulated = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const snapshot = () => simulated || !navigator.onLine;

export function useOffline() {
  const offline = useSyncExternalStore(subscribe, snapshot, () => false);
  return {
    offline,
    setOffline(v: boolean) {
      simulated = v;
      listeners.forEach((l) => l());
    },
  };
}
