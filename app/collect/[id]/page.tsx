"use client";

// Сбор отчётности: сводная таблица для ведомства — кто сдал, кто нет, у кого риск.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { downloadGet } from "@/components/download";
import { STATUS_LABEL, STATUS_TONE, isOverdue, daysLeft, type CampaignStats, type RowStatus } from "@/lib/collect/collect";

const btn = "rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const dmy = (d: string) => d.split("-").reverse().join(".");
const BAND: Record<string, string> = { ok: "bg-fl-green/15 text-fl-green", watch: "bg-fl-amber/15 text-fl-amber", risk: "bg-fl-red/15 text-fl-red" };
const BAND_LABEL: Record<string, string> = { ok: "устойчиво", watch: "внимание", risk: "высокий риск" };

interface Board {
  campaign: { id: string; title: string; segment: string; periodEnd: string; deadline: string; note: string | null; closedAt: string | null };
  rows: Array<{ companyId: string; name: string; inn: string | null; status: RowStatus; submittedAt: string | null; signer: string | null; returnReason: string | null; score: number | null; band: string | null; verdict: string | null }>;
  stats: CampaignStats; today: string;
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { fetch(`/api/collect/${id}`).then(async (r) => { const x = await r.json(); if (!r.ok) throw new Error(x.error); setB(x); }).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);
  async function act(action: "close" | "reopen" | "demo") {
    setBusy(true); setErr(null);
    try { const r = await fetch(`/api/collect/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const x = await r.json(); if (!r.ok) throw new Error(x.error); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  if (err && !b) return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-fl-red">{t(err)}</main>;
  if (!b) return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-fl-cream/50">{t("Загружаю…")}</main>;
  const c = b.campaign, s = b.stats, left = daysLeft(c.deadline, b.today);
  const order: Record<RowStatus, number> = { returned: 0, submitted: 1, draft: 2, none: 3, accepted: 4 };
  const rows = [...b.rows].sort((x, y) => order[x.status] - order[y.status] || x.name.localeCompare(y.name, "ru"));
  const demo = /\(демо\)/.test(c.segment);
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <Link href="/collect" className="text-sm text-fl-cream/55 hover:text-fl-cream">← {t("Сбор отчётности")}</Link>
      <header className="mb-5 mt-2">
        <h1 className="font-display text-3xl font-bold text-fl-cream">{t(c.title)}</h1>
        <p className="mt-1 text-sm text-fl-cream/60">{t(c.segment)} · {t("период на {date}", { date: dmy(c.periodEnd) })} · {t("срок сдачи {date}", { date: dmy(c.deadline) })}{c.closedAt ? ` · ${t("сбор закрыт")}` : left >= 0 ? ` · ${t("осталось {n} дн.", { n: left })}` : ` · ${t("срок прошёл")}`}</p>
        {c.note && <p className="mt-1 text-sm text-fl-cream/70">{c.note}</p>}
      </header>
      {err && <p className="mb-4 text-sm text-fl-red">{t(err)}</p>}
      <div className="grid gap-3 sm:grid-cols-5">
        {[[t("Сдали"), `${s.in} / ${s.total}`, "text-fl-green"], [t("Приняты"), String(s.accepted), "text-fl-cream"], [t("Заполняют"), String(s.draft + s.returned), "text-fl-cream"], [t("Не начинали"), String(s.none), "text-fl-cream"], [t("Просрочили"), String(s.overdue), s.overdue ? "text-fl-red" : "text-fl-cream"]].map(([k, v, tone]) => (
          <div key={k} className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4"><div className="text-xs text-fl-cream/55">{k}</div><div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{v}</div></div>
        ))}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-fl-surface-2"><div className="h-full bg-fl-green" style={{ width: `${s.pct}%` }} /></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={btn} onClick={() => downloadGet(`/api/collect/${id}?format=xlsx`, "sbor-otchetnosti.xlsx")}>{t("Сводка в Excel")}</button>
        <Link className={btn} href="/portfolio">{t("Портфель по сданным отчётам")}</Link>
        {c.closedAt ? <button className={btn} disabled={busy} onClick={() => act("reopen")}>{t("Открыть сбор снова")}</button> : <button className={btn} disabled={busy} onClick={() => { if (confirm(t("Закрыть сбор? Предприятия больше не смогут сдавать и исправлять отчёты."))) act("close"); }}>{t("Закрыть сбор")}</button>}
        {demo && !c.closedAt && s.in === 0 && <button className={btn} disabled={busy} onClick={() => act("demo")}>{t("Демо: заполнить статусы")}</button>}
      </div>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-fl-line bg-fl-charcoal-2">
        <table className="w-full min-w-[860px] text-sm">
          <thead><tr className="text-left text-xs text-fl-cream/50">{[t("Предприятие"), t("Статус"), t("Сдан"), t("Подписант"), t("Оценка по отчёту"), ""].map((h, i) => <th key={i} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-fl-line">{rows.map((r) => {
            const late = isOverdue(r.status, c.deadline, b.today);
            return (
              <tr key={r.companyId} className={late ? "bg-fl-red/[0.04]" : ""}>
                <td className="px-3 py-2"><div className="font-medium text-fl-cream">{r.name}</div><div className="text-xs text-fl-cream/45">{r.inn ?? ""}</div></td>
                <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status]}`}>{t(STATUS_LABEL[r.status])}</span>{late && <div className="mt-1 text-xs text-fl-red">{t("просрочен")}</div>}{r.status === "returned" && r.returnReason && <div className="mt-1 max-w-[220px] text-xs text-fl-amber">{r.returnReason}</div>}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-fl-cream/70">{r.submittedAt ? new Date(r.submittedAt).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td className="px-3 py-2 text-xs text-fl-cream/70">{r.signer ?? "—"}</td>
                <td className="px-3 py-2">{r.band ? <><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${BAND[r.band]}`}>{t(BAND_LABEL[r.band])} · {r.score}</span>{r.verdict && <div className="mt-1 max-w-[260px] text-xs text-fl-cream/55">{t(r.verdict)}</div>}</> : <span className="text-xs text-fl-cream/40">—</span>}</td>
                <td className="px-3 py-2 text-right"><Link href={`/collect/${id}/${r.companyId}`} className="text-sm text-fl-gold underline">{r.status === "submitted" ? t("проверить") : t("открыть")}</Link></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fl-cream/50">{t("Напоминания уходят сами: за 3 дня до срока, в день срока и на следующий день — тем, кто не сдал (если на сервере настроена почта). Сданные цифры сразу попадают в портфель и финансовую диагностику.")}</p>
    </main>
  );
}
