"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/auth/session";

export interface Me {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** sign-in is switched off on this deployment */
  public?: boolean;
}

// One request per page load, shared by every component that asks.
let cached: Promise<Me | null> | null = null;

export function fetchMe(): Promise<Me | null> {
  if (typeof window !== "undefined" && ["/login", "/register"].includes(window.location.pathname)) return Promise.resolve(null);
  cached ??= fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cached;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchMe().then((m) => { if (alive) { setMe(m); setLoaded(true); } });
    return () => { alive = false; };
  }, []);
  return { me, loaded };
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  cached = null;
  window.location.href = "/login";
}
