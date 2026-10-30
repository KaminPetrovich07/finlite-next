// Server-side helpers shared by the costing routes.
import { getRecord } from "@/lib/records";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { calculate, costPools, normalizeOutputs, normalizeProducts, type Product } from "./calc";
import { DEMO_PRODUCTS, demoOutputs } from "./demo";

export async function costingContext(companyId: string, from: string, to: string) {
  const c = await loadPrimaryCtx(companyId);
  let products: Product[] = [];
  let outputs: Record<string, number> = {};
  if (c.demo) {
    products = DEMO_PRODUCTS;
    outputs = demoOutputs(from, to);
  } else {
    products = normalizeProducts(await getRecord<Product[]>(companyId, "product", "main"));
    outputs = normalizeOutputs(await getRecord<Record<string, number>>(companyId, "costing", `${from}_${to}`), products);
  }
  const pools = costPools(c.entries, from, to);
  const base = c.policy?.overheadBase ?? "labor";
  const method = c.policy?.costingMethod ?? "actual";
  return { c, products, outputs, pools, base, method };
}

export function run(ctx: Awaited<ReturnType<typeof costingContext>>, rawProducts?: unknown, rawOutputs?: unknown) {
  const products = rawProducts === undefined ? ctx.products : normalizeProducts(rawProducts);
  const outputs = rawOutputs === undefined ? ctx.outputs : normalizeOutputs(rawOutputs, products);
  return { products, outputs, result: calculate(products, outputs, ctx.pools, ctx.base, ctx.method) };
}
