// ════════════════════════════════════════════════════════════════════════
// lib/counterparties/types.ts — справочник контрагентов.
//
// The journal has no analytics (субконто) column, so a counterparty is
// attached to an operation in three ways, strongest first:
//   1. an explicit link «операция → контрагент» made on the page;
//   2. the name, an alias or the ИНН found in the description / memo;
//   3. a name recognised by pattern («ОсОО «…»», «ИП …», a bank) —
//      such counterparties show up as «из журнала» until saved.
// Opening balances (one line per account in the journal) are split between
// counterparties in the directory; what is not split stays «без контрагента».
// ════════════════════════════════════════════════════════════════════════

export type CpRole = "buyer" | "supplier" | "both" | "lender" | "other";

export const CP_ROLE: Record<CpRole, string> = {
  buyer: "Покупатель",
  supplier: "Поставщик",
  both: "Покупатель и поставщик",
  lender: "Банк / заимодавец",
  other: "Прочий",
};

export interface Counterparty {
  id: string;
  name: string;
  inn: string;
  role: CpRole;
  address: string;
  contact: string;
  phone: string;
  email: string;
  bank: string;
  /** расчётный счёт контрагента — для акта сверки и платёжки */
  account: string;
  /** договор: «№ 12 от 10.01.2026» */
  contract: string;
  /** отсрочка платежа по договору, дней (0 — оплата сразу) */
  paymentDays: number;
  /** кредитный лимит покупателю, сом; 0 — без лимита */
  creditLimit: number;
  /** другие написания имени в описаниях операций */
  aliases: string[];
  /** начальные остатки по счетам расчётов (сумма на «своей» стороне счёта) */
  opening: Record<string, number>;
  /** дата возникновения начального долга — для сроков просрочки */
  openingDate: string;
  /** последний акт сверки, подписанный контрагентом: дата и сальдо (+ в нашу пользу) */
  recon: { date: string; balance: number } | null;
  note: string;
}

export interface CpStore {
  list: Counterparty[];
  /** entryId → counterparty id */
  links: Record<string, string>;
}

/** Расчётные счета, по которым ведётся учёт в разрезе контрагентов. */
export const SETTLE: Record<string, { label: string; short: string; group: "recv" | "pay" }> = {
  "1410": { label: "Счета к получению за товары, услуги", short: "Покупатели", group: "recv" },
  "1590": { label: "Прочая дебиторская задолженность", short: "Прочие дебиторы", group: "recv" },
  "1810": { label: "Запасы, оплаченные авансом", short: "Авансы выданные", group: "recv" },
  "1820": { label: "Услуги, оплаченные авансом", short: "Авансы выданные", group: "recv" },
  "1830": { label: "Аренда, оплаченная авансом", short: "Авансы выданные", group: "recv" },
  "1890": { label: "Прочие авансированные платежи", short: "Авансы выданные", group: "recv" },
  "3110": { label: "Счета к оплате за товары и услуги", short: "Поставщики", group: "pay" },
  "3190": { label: "Прочие счета к оплате", short: "Прочие кредиторы", group: "pay" },
  "3210": { label: "Авансы покупателей и заказчиков", short: "Авансы полученные", group: "pay" },
  "3310": { label: "Банковские кредиты, займы", short: "Кредиты", group: "pay" },
  "3320": { label: "Прочие кредиты, займы", short: "Займы", group: "pay" },
};

export const DEFAULT_TERMS = 30;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function emptyCounterparty(name = ""): Counterparty {
  return {
    id: "", name, inn: "", role: "buyer", address: "", contact: "", phone: "", email: "", bank: "", account: "",
    contract: "", paymentDays: DEFAULT_TERMS, creditLimit: 0, aliases: [], opening: {}, openingDate: "", recon: null, note: "",
  };
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function slug(s: string): string {
  const base = s.toLowerCase().replace(/[«»"'`]/g, "").replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
  const tr: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  return base.replace(/[а-яё]/g, (c) => tr[c] ?? "") || "cp";
}

/** Cleans whatever came from the page or the database. */
export function normalizeStore(raw: unknown): CpStore {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = new Set<string>();
  const list: Counterparty[] = [];
  for (const it of Array.isArray(o.list) ? o.list.slice(0, 2000) : []) {
    if (!it || typeof it !== "object") continue;
    const x = it as Record<string, unknown>;
    const name = str(x.name, 200);
    if (!name) continue;
    let id = /^[A-Za-z0-9_-]{1,60}$/.test(String(x.id ?? "")) ? String(x.id) : slug(name);
    while (ids.has(id)) id = `${id}-${ids.size}`;
    ids.add(id);
    const opening: Record<string, number> = {};
    if (x.opening && typeof x.opening === "object") {
      for (const [k, v] of Object.entries(x.opening as Record<string, unknown>)) if (SETTLE[k] && num(v)) opening[k] = r2(num(v));
    }
    const rc = x.recon as Record<string, unknown> | null | undefined;
    list.push({
      id, name,
      inn: str(x.inn, 20).replace(/\D/g, ""),
      role: (Object.keys(CP_ROLE) as CpRole[]).includes(x.role as CpRole) ? (x.role as CpRole) : "other",
      address: str(x.address), contact: str(x.contact, 120), phone: str(x.phone, 60), email: str(x.email, 120),
      bank: str(x.bank, 120), account: str(x.account, 40), contract: str(x.contract, 120),
      paymentDays: Math.max(0, Math.min(3650, Math.round(num(x.paymentDays)))),
      creditLimit: Math.max(0, r2(num(x.creditLimit))),
      aliases: (Array.isArray(x.aliases) ? x.aliases : String(x.aliases ?? "").split(/[;\n]/)).map((a) => str(a, 120)).filter((a) => a.length >= 3).slice(0, 10),
      opening,
      openingDate: ISO.test(String(x.openingDate ?? "")) ? String(x.openingDate) : "",
      recon: rc && ISO.test(String(rc.date ?? "")) ? { date: String(rc.date), balance: r2(num(rc.balance)) } : null,
      note: str(x.note, 1000),
    });
  }
  const links: Record<string, string> = {};
  if (o.links && typeof o.links === "object") {
    for (const [k, v] of Object.entries(o.links as Record<string, unknown>).slice(0, 20000)) {
      if (typeof v === "string" && /^[A-Za-z0-9_:.-]{1,80}$/.test(k) && /^[A-Za-z0-9_:-]{1,80}$/.test(v)) links[k] = v;
    }
  }
  return { list, links };
}
