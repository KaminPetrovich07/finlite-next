// Server-side: write off cost of goods sold for new sales when the company
// switched automatic write-off on (Склад → «Списывать автоматически»).
import { prisma } from "@/lib/db";
import { getRecord } from "@/lib/records";
import { createEntry, loadEntries } from "@/lib/ledger/repo";
import { cogsLines, cogsRef, pendingCogs } from "./cogs";

export interface StockSettings { auto: boolean }

export async function stockSettings(companyId: string): Promise<StockSettings> {
  try { return { auto: false, ...((await getRecord<StockSettings>(companyId, "stock")) ?? {}) }; } catch { return { auto: false }; }
}

/** Post the write-offs for one sale entry. Never throws: a failed write-off must not undo the sale. */
export async function autoCogsFor(companyId: string, entryId: string, date: string): Promise<number> {
  try {
    if (!(await stockSettings(companyId)).auto) return 0;
    const entries = await loadEntries(companyId, date);
    const todo = pendingCogs(entries, { from: date, to: date }).filter((p) => p.saleEntryId === entryId && !p.problem && p.amount > 0);
    for (const p of todo) {
      await createEntry(prisma, {
        companyId, date: p.date, source: "cogs", sourceRef: cogsRef(p.saleEntryId, p.lineIndex),
        description: `Списание себестоимости: ${p.item}, ${p.qty} ${p.unit}`.trim(), lines: cogsLines(p),
      });
    }
    return todo.length;
  } catch { return 0; }
}
