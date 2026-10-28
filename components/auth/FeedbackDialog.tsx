"use client";

import { useEffect, useRef, useState } from "react";

const KINDS = [
  { k: "idea", label: "Идея или пожелание" },
  { k: "bug", label: "Ошибка в работе" },
  { k: "question", label: "Вопрос" },
  { k: "other", label: "Другое" },
] as const;

/** Modal form: the message is stored for the system's creator. */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["k"]>("idea");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); setState("idle"); setError(null); }
    if (!open && d.open) d.close();
  }, [open]);

  async function send() {
    setState("sending");
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message, page: window.location.pathname }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Не удалось отправить"); setState("idle"); return; }
    setMessage("");
    setState("sent");
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="w-[min(520px,calc(100vw-32px))] rounded-2xl border border-fl-line bg-fl-charcoal-2 p-0 text-fl-cream shadow-lift backdrop:bg-black/40"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold">Обратная связь</h2>
            <p className="mt-1 text-sm text-fl-cream/60">Сообщение получит создатель FinLite. Если нужен ответ, оставьте в тексте контакт — email или Telegram.</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-md p-1 text-fl-cream/50 hover:text-fl-cream">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>
        {state === "sent" ? (
          <div className="mt-5 rounded-lg border-l-4 border-fl-green bg-fl-green/10 px-4 py-3 text-sm">
            Спасибо, сообщение отправлено создателю FinLite.
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {KINDS.map((x) => (
                <button key={x.k} onClick={() => setKind(x.k)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${kind === x.k ? "border-fl-accent bg-fl-accent text-fl-on-accent" : "border-fl-line text-fl-cream/75 hover:text-fl-cream"}`}>
                  {x.label}
                </button>
              ))}
            </div>
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)} rows={6} autoFocus
              placeholder="Что работает не так, чего не хватает, что непонятно…"
              className="mt-4 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm leading-relaxed focus:border-fl-info focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-fl-red">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-fl-line px-4 py-2 text-sm">Отмена</button>
              <button onClick={send} disabled={state === "sending" || message.trim().length < 5}
                className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">
                {state === "sending" ? "Отправляю…" : "Отправить"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
