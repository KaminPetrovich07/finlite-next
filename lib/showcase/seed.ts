// Server side: создать демо-компанию для показа по плану lib/showcase/plan.ts — через те же функции,
// что и интерфейс (накладные, ввоз, оплаты), чтобы все разделы видели данные как настоящие.
import { prisma } from "@/lib/db";
import { createEntry, loadEntries } from "@/lib/ledger/repo";
import { quietly, recordEntryEvent } from "@/lib/ledger/guard";
import { createDoc, payDoc } from "@/lib/trade/server";
import { createImport } from "@/lib/import-goods/server";
import { putRecord } from "@/lib/records";
import { showcasePlan, SHOWCASE, VAT_SETTLE } from "./plan";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthEnd = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

export async function createShowcase(ownerId: string | null) {
  const company = await prisma.company.create({ data: { name: SHOWCASE.name, defaultRegime: SHOWCASE.regime, activity: SHOWCASE.activity, ownerId } });
  const companyId = company.id;
  const tags = new Map<string, string>();
  let count = 0;
  const notes: string[] = [];
  try {
    // склад: себестоимость списывается сама при каждой реализации (по средней)
    await putRecord(companyId, "stock", "main", { auto: true });
    await quietly(async () => {
      for (const op of showcasePlan()) {
        if (op.kind === "entry") {
          await createEntry(prisma, { companyId, date: op.date, description: op.description, source: op.source ?? "manual", sourceRef: op.sourceRef, lines: op.lines });
        } else if (op.kind === "trade") {
          const r = await createDoc(companyId, op.doc);
          if (op.tag) tags.set(op.tag, r.entryId);
          notes.push(...r.problems);
        } else if (op.kind === "import") {
          await createImport(companyId, op.doc);
        } else {
          const id = tags.get(op.tag);
          if (id) await payDoc(companyId, id, { amount: op.amount, date: op.date, via: op.via });
        }
        count++;
      }
      // НДС за месяц: зачёт входного НДС (1540) в счёт начисленного (3430) и уплата остатка
      const entries = await loadEntries(companyId);
      for (const v of VAT_SETTLE) {
        let out = 0, inp = 0;
        for (const e of entries) {
          if (e.date.slice(0, 7) !== v.month) continue;
          for (const l of e.lines) { if (l.account === "3430") out += l.credit; if (l.account === "1540") inp += l.debit; }
        }
        const offset = r2(Math.min(out, inp)), due = r2(out - offset);
        if (offset > 0) await createEntry(prisma, { companyId, date: monthEnd(v.month), description: `Зачёт НДС к вычету за ${v.month.slice(5)}.${v.month.slice(0, 4)}`, source: "manual", lines: [{ account: "3430", debit: offset, credit: 0 }, { account: "1540", debit: 0, credit: offset }] });
        if (v.pay && due > 0) await createEntry(prisma, { companyId, date: v.pay, description: `Уплата НДС за ${v.month.slice(5)}.${v.month.slice(0, 4)}`, source: "manual", lines: [{ account: "3430", debit: due, credit: 0 }, { account: "1210", debit: 0, credit: due }] });
      }
      await recordEntryEvent(prisma, { companyId, action: "import", source: "demo", entryDate: "2026-08-01", note: `Демо-компания для показа: ${count} операций` });
    });
  } catch (e) {
    // не оставлять полупустую компанию
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    throw e;
  }
  return { id: companyId, name: company.name, operations: count, notes };
}
