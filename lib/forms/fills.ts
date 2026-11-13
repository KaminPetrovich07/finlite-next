// Реквизиты компании для бланков — из учётной политики и карточки компании.
import { loadPrimaryCtx } from "@/lib/primary/context";
import type { FillValues } from "./types";

export async function loadFills(companyId: string): Promise<FillValues> {
  const c = await loadPrimaryCtx(companyId);
  const today = new Date().toISOString().slice(0, 10).split("-").reverse().join(".");
  return {
    org: c.companyName, inn: c.inn, director: c.people.director, directorTitle: c.people.directorTitle,
    chief: c.people.chief, cashier: c.people.cashier, storekeeper: c.people.storekeeper, today, year: today.slice(-4),
  };
}
