// ════════════════════════════════════════════════════════════════════════
// lib/i18n/docs-ky.ts — печатные формы на кыргызском: накладная, счёт на оплату,
// акт выполненных работ, приходный ордер М-4.
//
// Документы собираются по-русски (lib/primary/build.ts), затем блоки переводятся:
// точные строки — по словарю, заголовки с номером и дата — по шаблонам, сумма
// прописью пересчитывается по-кыргызски из итога таблицы. Непереведённая строка
// остаётся русской: документ всегда полный.
// ════════════════════════════════════════════════════════════════════════

import { ACCOUNTS_KY } from "./accounts-ky";
import { getAccount } from "@/lib/ledger/accounts";
import type { DocBlock, OfficialDoc } from "@/lib/docs/model";

export const DOC_KY: Record<string, string> = {
  "Поставщик": "Жеткирүүчү",
  "Покупатель": "Сатып алуучу",
  "Исполнитель": "Аткаруучу",
  "Заказчик": "Заказчик",
  "Основание": "Негиз",
  "договор №____ от «___» ____ 20__ г.": "№____ келишим, 20__-ж. «___» ____",
  "№": "№",
  "Наименование": "Аталышы",
  "Ед. изм. (код ОКЕИ)": "Өлч. бирд. (ОКЕИ коду)",
  "Количество": "Саны",
  "Цена": "Баасы",
  "Цена без НДС": "Баасы КНСсиз",
  "Сумма, сом": "Суммасы, сом",
  "Сумма без НДС, сом": "Суммасы КНСсиз, сом",
  "Итого": "Жыйынтык",
  "Итого без НДС": "КНСсиз жыйынтык",
  "НДС 12 %": "КНС 12 %",
  "Всего с НДС": "КНС менен бардыгы",
  "Руководитель": "Жетекчи",
  "Директор": "Директор",
  "Главный бухгалтер": "Башкы бухгалтер",
  "Отпуск разрешил": "Берүүгө уруксат берген",
  "Отпустил": "Берген",
  "Получил": "Алган",
  "Принял (заведующий складом)": "Кабыл алган (кампа башчысы)",
  "Сдал (экспедитор)": "Тапшырган (экспедитор)",
  "Оплата по счёту в течение 5 банковских дней. Реквизиты для оплаты: ____________________________.":
    "Эсеп боюнча төлөм 5 банктык күндүн ичинде. Төлөө үчүн реквизиттер: ____________________________.",
  "Работы (услуги) выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам не имеет.":
    "Жумуштар (кызматтар) толук жана мөөнөтүндө аткарылды. Заказчиктин көлөмү, сапаты жана мөөнөттөрү боюнча доосу жок.",
  "Унифицированная форма М-4": "М-4 бирдиктүү формасы",
  "Дата составления": "Түзүлгөн күнү",
  "Склад": "Кампа",
  "Корр. счёт": "Корр. эсеп",
  "Сопроводительный документ": "Коштоочу документ",
  "Счёт": "Эсеп",
  "Наименование ценностей": "Баалуулуктардын аталышы",
  "Кол-во по документу": "Документ боюнча саны",
  "Принято": "Кабыл алынды",
  "Розничные покупатели (наличная выручка)": "Чекене сатып алуучулар (накталай түшүм)",
};

const MONTHS_RU = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_KY = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/** «15 ноября 2026 г.» → «2026-ж. 15-ноябрь» */
export function dateLongKy(d: number, m: number, y: number): string {
  return `${y}-ж. ${d}-${MONTHS_KY[m - 1]}`;
}

const ONES = ["", "бир", "эки", "үч", "төрт", "беш", "алты", "жети", "сегиз", "тогуз"];
const TENS = ["", "он", "жыйырма", "отуз", "кырк", "элүү", "алтымыш", "жетимиш", "сексен", "токсон"];

function triple(n: number): string[] {
  const w: string[] = [];
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  if (h) w.push(ONES[h], "жүз");
  if (t) w.push(TENS[t]);
  if (o) w.push(ONES[o]);
  return w;
}

/** Сумма прописью по-кыргызски: «Сегиз миң үч жүз отуз сом 00 тыйын». */
export function sumInWordsKy(n: number): string {
  const total = Math.round(Math.abs(n) * 100);
  let som = Math.floor(total / 100);
  const tyiyn = String(total % 100).padStart(2, "0");
  if (som === 0) return `Нөл сом ${tyiyn} тыйын`;
  const words: string[] = [];
  for (const [base, name] of [[1_000_000_000, "миллиард"], [1_000_000, "миллион"], [1_000, "миң"]] as Array<[number, string]>) {
    const k = Math.floor(som / base);
    if (k) { words.push(...triple(k), name); som %= base; }
  }
  words.push(...triple(som));
  const s = words.filter(Boolean).join(" ");
  return `${s[0].toUpperCase()}${s.slice(1)} сом ${tyiyn} тыйын`;
}

const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

function tr(s: string): string {
  if (DOC_KY[s]) return DOC_KY[s];
  let m = s.match(/^Накладная на отпуск товаров \(продукции\) № (.+)$/);
  if (m) return `Товарларды (продукцияны) берүүгө жүк кагазы № ${m[1]}`;
  m = s.match(/^Счёт на оплату № (.+)$/);
  if (m) return `Төлөөгө эсеп № ${m[1]}`;
  m = s.match(/^Акт выполненных работ \(оказанных услуг\) № (.+)$/);
  if (m) return `Аткарылган жумуштардын (көрсөтүлгөн кызматтардын) акты № ${m[1]}`;
  m = s.match(/^Приходный ордер № (.+)$/);
  if (m) return `Кирүү ордери № ${m[1]}`;
  m = s.match(/^от (\d{1,2}) (\S+) (\d{4}) г\.$/);
  if (m && MONTHS_RU.includes(m[2])) return dateLongKy(Number(m[1]), MONTHS_RU.indexOf(m[2]) + 1, Number(m[3]));
  // «ОсОО «Ромашка», ИНН 123…» — организация и ИНН
  m = s.match(/^(.*), ИНН (\d+)$/);
  if (m) return `${m[1]}, ИНН ${m[2]}`;
  // название счёта в строке «Наименование», если товар не указан
  const acc = Object.entries(ACCOUNTS_KY).find(([code]) => getAccount(code)?.name === s);
  if (acc) return acc[1];
  return s;
}

/** Last number in the last row of the previous table (the document total). */
function lastTotal(blocks: DocBlock[], i: number): number | null {
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j];
    if (b.t === "table" && b.rows.length) {
      const row = b.rows[b.rows.length - 1];
      const v = num(row[row.length - 1] ?? "");
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

function trBlock(b: DocBlock, i: number, all: DocBlock[]): DocBlock {
  switch (b.t) {
    case "title": case "subtitle": case "h": case "note":
      return { ...b, text: tr(b.text) };
    case "p": {
      if (b.text.startsWith("Всего на сумму:")) {
        const total = lastTotal(all, i);
        if (total !== null) {
          const vat = b.text.match(/в том числе НДС ([\d\s]+,\d{2}) сом/);
          const w = sumInWordsKy(total);
          return { ...b, text: `Бардыгы ${w[0].toLowerCase()}${w.slice(1)}${vat ? `, анын ичинде КНС ${vat[1]} сом` : / Без НДС\.$/.test(b.text) ? ", КНСсиз" : ""}.` };
        }
      }
      return { ...b, text: tr(b.text) };
    }
    case "right": return { ...b, lines: b.lines.map(tr) };
    case "clause": return { ...b, text: tr(b.text) };
    case "list": return { ...b, items: b.items.map(tr) };
    case "table": return { ...b, ...(b.head ? { head: b.head.map(tr) } : {}), rows: b.rows.map((r) => r.map(tr)) };
    case "sign": return { ...b, items: b.items.map((x) => ({ ...x, role: tr(x.role) })) };
    case "fields": return { ...b, items: b.items.map(([k, v]) => [tr(k), tr(v)] as [string, string]) };
    case "cut": return b.text ? { ...b, text: tr(b.text) } : b;
    default: return b;
  }
}

/** The document in Kyrgyz (signature captions and page numbers follow `lang`). */
export function docToKyrgyz(doc: OfficialDoc): OfficialDoc {
  return { ...doc, lang: "ky", title: tr(doc.title), blocks: doc.blocks.map((b, i, all) => trBlock(b, i, all)) };
}
