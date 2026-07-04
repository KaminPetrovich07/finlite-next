"use client";

import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";

interface ToastProps {
  message: string;
  kind?: ToastKind;
  duration?: number;
  onDismiss: () => void;
}

export function Toast({ message, kind = "success", duration = 3500, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, duration);
    return () => { cancelAnimationFrame(show); clearTimeout(hide); };
  }, [duration, onDismiss]);

  const colors = {
    success: "border-fl-green/60 bg-fl-green/10 text-fl-green",
    error:   "border-fl-red/60 bg-fl-red/10 text-fl-red",
    info:    "border-fl-gold/40 bg-fl-gold/10 text-fl-gold-bright",
  };

  const icons = { success: "✓", error: "✕", info: "i" };

  return (
    <div
      className={`
        fixed bottom-24 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 
        shadow-xl text-sm font-medium backdrop-blur-sm
        transition-all duration-300 ease-out
        ${colors[kind]}
        ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}
      `}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-bold flex-shrink-0">
        {icons[kind]}
      </span>
      <span>{message}</span>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface ToastState {
  id: number;
  message: string;
  kind: ToastKind;
}

let _toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  function show(message: string, kind: ToastKind = "success") {
    const id = ++_toastId;
    setToasts((t) => [...t, { id, message, kind }]);
  }

  function dismiss(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  const ToastContainer = () => (
    <>
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} kind={t.kind} onDismiss={() => dismiss(t.id)} />
      ))}
    </>
  );

  return { show, ToastContainer };
}
