"use client";

// Protection against two people (or two tabs) overwriting each other's settings and reference data.
// The server returns the versions of the records it read in X-FL-Versions; this module remembers
// them per API address and company and sends them back with the next save to the same address.
// If the record was saved by someone else in between, the server answers 409 and the page shows
// its usual error message. Pages need no changes: the browser's fetch is wrapped once here.
import { useEffect } from "react";

const VERSIONS = "x-fl-versions";
const CLIENT = "x-fl-client";
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function tabId(): string {
  try {
    let id = sessionStorage.getItem("fl-tab");
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("fl-tab", id); }
    return id;
  } catch { return "no-storage"; }
}

function companyOf(url: URL, body: unknown): string {
  const q = url.searchParams.get("companyId");
  if (q) return q;
  if (typeof body === "string" && body.startsWith("{")) {
    try { const v = JSON.parse(body); if (typeof v?.companyId === "string") return v.companyId; } catch { /* not JSON */ }
  }
  return "";
}

export function installVersionTracker(): void {
  const w = window as typeof window & { __flVersions?: boolean };
  if (w.__flVersions) return;
  w.__flVersions = true;
  const known = new Map<string, Map<string, string>>(); // "path|companyId" → record → version
  const tab = tabId();
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try { url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url, location.href); } catch { return original(input, init); }
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/") || input instanceof Request) return original(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    const slot = `${url.pathname}|${companyOf(url, init?.body)}`;
    const headers = new Headers(init?.headers);
    headers.set(CLIENT, tab);
    const seen = known.get(slot);
    if (UNSAFE.has(method) && seen?.size) {
      headers.set(VERSIONS, [...seen].map(([k, v]) => `${encodeURIComponent(k)}@${encodeURIComponent(v)}`).join(","));
    }
    const res = await original(input, { ...init, headers });
    const got = res.headers.get(VERSIONS);
    if (got && res.ok) {
      const m = known.get(slot) ?? new Map<string, string>();
      for (const part of got.split(",")) {
        const i = part.lastIndexOf("@");
        if (i > 0) { try { m.set(decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1))); } catch { /* malformed */ } }
      }
      known.set(slot, m);
    }
    return res;
  };
}

// installed as soon as the module loads in the browser — before the pages' own first requests
if (typeof window !== "undefined") installVersionTracker();

export function VersionTracker() {
  useEffect(() => { installVersionTracker(); }, []);
  return null;
}
