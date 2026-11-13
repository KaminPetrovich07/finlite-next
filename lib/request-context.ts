// Per-request state on the server (AsyncLocalStorage), set up by route() in lib/auth/server.ts.
// Holds the versions of company records read or written during the request; route() returns them
// in the X-FL-Versions response header, the browser sends them back with the next save (see
// components/VersionTracker.tsx), and putRecord refuses a save made over somebody else's newer version.
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestState { versions: Map<string, string> }
export const requestContext = new AsyncLocalStorage<RequestState>();

export const VERSIONS_HEADER = "x-fl-versions";
export const CLIENT_HEADER = "x-fl-client";

/** "policy/main@2026-11-13T10:00:00.000Z,budget/2026@…" — keys and values URI-encoded */
export function encodeVersions(m: Map<string, string>): string {
  return [...m].map(([k, v]) => `${encodeURIComponent(k)}@${encodeURIComponent(v)}`).join(",");
}
export function decodeVersions(s: string | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of (s ?? "").split(",")) {
    const i = part.lastIndexOf("@");
    if (i <= 0) continue;
    try { m.set(decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1))); } catch { /* malformed */ }
  }
  return m;
}

export function noteVersion(kind: string, key: string, updatedAt: Date): void {
  requestContext.getStore()?.versions.set(`${kind}/${key}`, updatedAt.toISOString());
}
