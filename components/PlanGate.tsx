"use client";

// Whether the signed-in user's plan includes a feature — for banners and
// disabled buttons. The server checks the same thing on every write, so this
// is only about telling the user early, never about security.

import { useEffect, useState } from "react";
import { cheapestWith, FEATURE_LABEL, type Feature } from "@/lib/plans";
import { AUTH_ON } from "@/lib/auth/mode";

let cache: Promise<{ features: string[] | null; signedIn: boolean }> | null = null;

function me() {
  cache ??= fetch("/api/auth/me").then((r) => r.json()).then((b) => ({
    signedIn: !!b.user,
    // administrators get `features: null` — everything is allowed
    features: b.plan ? (b.plan.features ?? null) : [],
  })).catch(() => ({ signedIn: false, features: [] }));
  return cache;
}

/** true / false once known; null while loading or when nobody is signed in (demo browsing). */
export function usePlanFeature(f: Feature): boolean | null {
  const [v, setV] = useState<boolean | null>(AUTH_ON ? null : true);
  useEffect(() => {
    if (!AUTH_ON) return; // открытый режим — всё доступно
    let alive = true;
    me().then((m) => { if (alive) setV(!m.signedIn ? null : m.features === null ? true : m.features.includes(f)); });
    return () => { alive = false; };
  }, [f]);
  return v;
}

export function PlanNotice({ feature }: { feature: Feature }) {
  const p = cheapestWith(feature);
  return (
    <div className="mb-5 rounded-xl border border-fl-gold/40 bg-fl-gold/10 px-4 py-3 text-sm text-fl-cream/85">
      «{FEATURE_LABEL[feature]}» входит в тариф {p ? <b className="text-fl-gold">«{p.name}»</b> : "выше текущего"} и выше. Смотреть можно, а изменения
      сохранятся после подключения тарифа. <a href="/pricing" className="text-fl-gold underline underline-offset-2">Тарифы</a>
    </div>
  );
}
