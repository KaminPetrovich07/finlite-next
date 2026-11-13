// Новая компания — копия демо-компании ОсОО «Белес» со всеми операциями.
import { prisma } from "@/lib/db";
import { demoEntries, DEMO_COMPANY } from "./demo";
import { createEntry } from "./repo";
import { quietly, recordEntryEvent } from "./guard";

export async function createDemoCopy(ownerId: string | null, name = `${DEMO_COMPANY.name} (копия)`) {
  const company = await prisma.company.create({
    data: { name, defaultRegime: DEMO_COMPANY.regime, patentAmount: DEMO_COMPANY.patentAmount, activity: DEMO_COMPANY.activity, ownerId },
  });
  const entries = demoEntries();
  // одна запись в истории вместо сотен «введена»
  await quietly(() => prisma.$transaction(async (db) => {
    for (const e of entries) {
      await createEntry(db, { companyId: company.id, date: e.date, description: e.description, source: e.source === "demo" ? "manual" : e.source, sourceRef: e.sourceRef, lines: e.lines });
    }
    await recordEntryEvent(db, { companyId: company.id, action: "import", source: "demo", entryDate: entries.map((e) => e.date).sort()[0], note: `Копия демо-компании, проводок: ${entries.length}` });
  }, { timeout: 30_000 }));
  return company;
}
