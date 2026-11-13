"use client";

// Ошибка в самом каркасе сайта (меню, разметка): своя страница, раз основной вид не отрисовался.
import { useEffect } from "react";
import { reportError } from "@/lib/monitor/report";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, { digest: error.digest }); }, [error]);
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#f7f7f5", color: "#1a1f2b" }}>
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "64px 16px" }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>FinLite KG не открылся</h1>
          <p style={{ color: "#555", lineHeight: 1.5 }}>Произошла ошибка. Мы уже получили сообщение о ней. Нажмите «Повторить»; если не поможет — обновите страницу через минуту.</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 12, fontSize: 12 }}>{error.message || "Без описания"}{error.digest ? `\nкод: ${error.digest}` : ""}</pre>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: 0, background: "#1a1f2b", color: "#fff", cursor: "pointer" }}>Повторить</button>
            <a href="/" style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ccc", color: "#1a1f2b", textDecoration: "none" }}>На главную</a>
          </div>
        </main>
      </body>
    </html>
  );
}
