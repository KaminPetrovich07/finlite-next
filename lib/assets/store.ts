// Server-side: asset cards of a company (CompanyRecord kind "asset") and the
// tax-depreciation settings (kind "assetTax").
import { listRecords, getRecord } from "@/lib/records";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { DEMO_ASSETS } from "./demo";
import { defaultTaxSettings, type TaxSettings } from "./depreciation";
import type { FixedAsset } from "./types";

export async function loadAssets(companyId: string): Promise<FixedAsset[]> {
  if (companyId === DEMO_COMPANY.id) return DEMO_ASSETS;
  return (await listRecords<FixedAsset>(companyId, "asset")).map((r) => ({ ...r.data, id: r.key }));
}

export async function loadTaxSettings(companyId: string, assets: FixedAsset[]): Promise<TaxSettings> {
  const base = defaultTaxSettings(assets);
  if (companyId === DEMO_COMPANY.id) return base;
  const saved = await getRecord<Partial<TaxSettings>>(companyId, "assetTax");
  return { ...base, ...(saved ?? {}), opening: saved?.opening ?? {}, objectOpening: saved?.objectOpening ?? {}, repairs: saved?.repairs ?? {} };
}
