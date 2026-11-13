"use client";

import { useEffect } from "react";

/** Registers the service worker (offline notice only) so the site can be installed as an app. */
export function InstallApp() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || location.hostname === "localhost") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* not critical */ });
  }, []);
  return null;
}
