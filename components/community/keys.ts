"use client";

// Keys that let this browser edit what it created (posts, comments, profiles,
// reviews) and the remembered author name. Kept in localStorage; when storage
// is blocked, editing works until the page is closed.

const KEY = "finlite:keys";
const ME = "finlite:author";
const CLIENT = "finlite:client";
const mem: Record<string, string> = {};

function all(): Record<string, string> {
  try { return { ...JSON.parse(localStorage.getItem(KEY) ?? "{}"), ...mem }; } catch { return { ...mem }; }
}

export function saveKey(kind: "post" | "comment" | "spec" | "review", id: string, key: string) {
  mem[`${kind}:${id}`] = key;
  try { localStorage.setItem(KEY, JSON.stringify({ ...all(), [`${kind}:${id}`]: key })); } catch { /* memory only */ }
}

export function getKey(kind: "post" | "comment" | "spec" | "review", id: string): string | null {
  return all()[`${kind}:${id}`] ?? null;
}

export function keysOf(kind: "comment" | "review"): string[] {
  return Object.entries(all()).filter(([k]) => k.startsWith(`${kind}:`)).map(([, v]) => v);
}

export function author(): { name: string; org: string } {
  try { return { name: "", org: "", ...JSON.parse(localStorage.getItem(ME) ?? "{}") }; } catch { return { name: "", org: "" }; }
}

export function rememberAuthor(name: string, org: string) {
  try { localStorage.setItem(ME, JSON.stringify({ name, org })); } catch { /* ignore */ }
}

export function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CLIENT, id); }
    return id;
  } catch { return (mem.client ??= crypto.randomUUID()); }
}
