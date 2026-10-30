// Server-side: everything the primary-documents module needs for a company.
import { getRecord } from "@/lib/records";
import { loadCompanyContext } from "@/lib/server/company-context";
import { defaultPolicy, normalizePolicy, type PolicyInput } from "@/lib/policy/types";
import { peopleFromPolicy, type PrimaryCtx } from "./build";

export async function loadPrimaryCtx(companyId: string): Promise<PrimaryCtx & { services: boolean; policySaved: boolean; demo: boolean }> {
  const ctx = await loadCompanyContext(companyId);
  let stored: PolicyInput | null = null;
  if (!ctx.demo) {
    try { stored = await getRecord<PolicyInput>(ctx.id, "policy"); } catch { stored = null; }
  }
  const policy = stored ? normalizePolicy(stored, defaultPolicy(ctx)) : defaultPolicy(ctx);
  return {
    companyName: ctx.name,
    inn: policy.inn || ctx.inn || "",
    people: peopleFromPolicy(policy),
    policy,
    entries: ctx.entries,
    services: policy.activities.length === 1 && policy.activities[0] === "services",
    policySaved: !!stored,
    demo: ctx.demo,
  };
}
