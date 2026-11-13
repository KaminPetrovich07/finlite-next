"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitor/report";

/** Ловит ошибки скриптов на любой странице и отправляет их в журнал ошибок сайта. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      if (ev.filename && !ev.filename.startsWith(location.origin)) return; // чужие скрипты и расширения
      reportError(ev.error ?? ev.message);
    };
    const onRejection = (ev: PromiseRejectionEvent) => reportError(ev.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
