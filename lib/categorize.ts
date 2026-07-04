// ════════════════════════════════════════════════════════════════════════
// lib/categorize.ts
// Pass 1: keyword rules (lib/categories.ts) — free, instant, deterministic.
// Pass 2: whatever's left goes to Claude in ONE batched call (not one call
// per transaction — keeps cost and latency sane for a statement with
// hundreds of rows). Uses Haiku: this is a bounded classification task
// against a fixed category list, not something that needs a larger model.
// ════════════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import { ALL_CATEGORIES, applyKeywordRules, type Category } from "@/lib/categories";
import type { ParsedTransaction } from "@/lib/bank-parser";

export interface CategorizedTransaction extends ParsedTransaction {
  category: Category;
  categorySource: "rule" | "llm" | "manual";
}

const MAX_LLM_BATCH = 100; // keep prompts a reasonable size; chunk larger files

export async function categorizeTransactions(
  transactions: ParsedTransaction[]
): Promise<CategorizedTransaction[]> {
  const result: CategorizedTransaction[] = [];
  const needsLlm: { index: number; tx: ParsedTransaction }[] = [];

  // Pass 1: rules
  transactions.forEach((tx, index) => {
    const ruleMatch = applyKeywordRules(tx.description);
    if (ruleMatch) {
      result[index] = { ...tx, category: ruleMatch, categorySource: "rule" };
    } else {
      needsLlm.push({ index, tx });
    }
  });

  // Pass 2: LLM, only if there's something left to classify and a key is configured
  if (needsLlm.length > 0 && process.env.ANTHROPIC_API_KEY) {
    for (let i = 0; i < needsLlm.length; i += MAX_LLM_BATCH) {
      const batch = needsLlm.slice(i, i + MAX_LLM_BATCH);
      const categories = await classifyBatchWithLlm(batch.map((b) => b.tx));
      batch.forEach((b, j) => {
        result[b.index] = { ...b.tx, category: categories[j] ?? "Не определено", categorySource: "llm" };
      });
    }
  } else {
    // no API key configured, or nothing left — fall back to "не определено"
    needsLlm.forEach((b) => {
      result[b.index] = { ...b.tx, category: "Не определено", categorySource: "rule" };
    });
  }

  return result;
}

async function classifyBatchWithLlm(transactions: ParsedTransaction[]): Promise<Category[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const list = transactions
    .map((t, i) => `${i + 1}. [${t.amount >= 0 ? "приход" : "расход"} ${Math.abs(t.amount)}] ${t.description || "(без описания)"}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system:
      "Ты классифицируешь банковские транзакции малого бизнеса в Кыргызстане по списку категорий. " +
      "Отвечай ТОЛЬКО JSON-массивом строк длиной ровно как во входном списке, без пояснений, без markdown. " +
      `Допустимые категории: ${JSON.stringify(ALL_CATEGORIES)}. ` +
      'Если транзакция точно про зарплату — "приход" не используй для нее логику расходов и наоборот: ' +
      "ориентируйся на знак (приход/расход) и текст назначения платежа. Если описание непонятно — используй \"Не определено\".",
    messages: [{ role: "user", content: `Классифицируй каждую транзакцию по номеру:\n\n${list}` }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return transactions.map(() => "Не определено");

  try {
    const cleaned = textBlock.text.trim().replace(/^```json?\n?/, "").replace(/```$/, "");
    const parsed = JSON.parse(cleaned) as string[];
    return transactions.map((_, i) =>
      ALL_CATEGORIES.includes(parsed[i] as Category) ? (parsed[i] as Category) : "Не определено"
    );
  } catch {
    return transactions.map(() => "Не определено");
  }
}
