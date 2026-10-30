"use client";

/** POSTs JSON and saves the file the server returns (name from Content-Disposition). */
export async function downloadPost(url: string, body: unknown, fallbackName: string): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error ?? "Не удалось сформировать файл");
  }
  const blob = await res.blob();
  const m = (res.headers.get("Content-Disposition") ?? "").match(/filename\*=UTF-8''([^;]+)/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}
