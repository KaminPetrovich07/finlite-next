// Справочник демо-компании ОсОО «Белес». Контрагенты в самих проводках
// (поле «контрагент»), здесь — условия договоров и реквизиты.
import { emptyCounterparty, type Counterparty, type CpStore } from "./types";

const cp = (x: Partial<Counterparty> & { id: string; name: string }): Counterparty => ({ ...emptyCounterparty(x.name), ...x });

export const DEMO_COUNTERPARTIES: Counterparty[] = [
  cp({ id: "ala-too", name: "ОсОО «Ала-Тоо Отель»", inn: "01504200510187", role: "buyer", address: "г. Бишкек, ул. Токтогула, 120", contact: "Иманалиева А. (закупки)", phone: "+996 312 900 100",
    contract: "№ 14/26 от 12.01.2026", paymentDays: 30, creditLimit: 2_000_000, openingDate: "2026-06-20", recon: { date: "2026-06-30", balance: 1_400_000 } }),
  cp({ id: "dordoi-plaza", name: "ОсОО «Дордой Плаза»", inn: "02108201310044", role: "buyer", address: "г. Бишкек, ул. Ибраимова, 115", contract: "№ 3/25 от 05.11.2025", paymentDays: 30,
    openingDate: "2026-05-15" }),
  cp({ id: "bos", name: "ОсОО «Бишкек Офис Сервис»", inn: "", role: "buyer", address: "г. Бишкек, пр. Чуй, 62", contract: "№ 9 от 01.06.2026", paymentDays: 14,
    openingDate: "2026-06-25" }),
  cp({ id: "stroydom", name: "ОсОО «СтройДом»", inn: "00911201610239", role: "buyer", address: "г. Бишкек, ул. Жибек Жолу, 400", contract: "№ 21/26 от 08.09.2026", paymentDays: 0 }),
  cp({ id: "technomebel", name: "ОсОО «ТехноМебель»", inn: "01811201210351", role: "supplier", address: "г. Бишкек, ул. Льва Толстого, 36", contract: "№ П-7 от 15.02.2025", paymentDays: 45,
    openingDate: "2026-06-10" }),
  cp({ id: "kedr", name: "ОсОО «Кедр Импорт»", inn: "02203201910078", role: "supplier", address: "Чуйская обл., с. Лебединовка", contract: "№ 2/26 от 20.03.2026", paymentDays: 60,
    openingDate: "2026-06-28" }),
  cp({ id: "bakai", name: "Бакай Банк", inn: "", role: "lender", address: "г. Бишкек, ул. Морозова, 90", contract: "кредитный договор № 556 от 01.12.2025", paymentDays: 0 }),
];

export function demoStore(): CpStore {
  return { list: DEMO_COUNTERPARTIES, links: {} };
}
