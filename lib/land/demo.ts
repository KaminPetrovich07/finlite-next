// Пример участков для показа: вымышленные коды ЕНИ и документы, параметры налога не заданы —
// бухгалтер вводит их из НК КР и приказа ГНС (программа не подставляет ставки сама).
import type { Parcel } from "./land";

export function demoParcels(today: string): Parcel[] {
  const y = Number(today.slice(0, 4));
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 45 * 864e5).toISOString().slice(0, 10);
  return [
    { id: "demo-land-1", eni: "1-00-00-0000-0001 (демо)", name: "Производственная база", category: "settlement", region: "г. Бишкек", district: "Октябрьский район", address: "ул. Примерная, 1 (демо)", areaM2: 12_500, purpose: "для размещения производственной базы", right: "own", docKind: "Государственный акт", docNumber: "ДЕМО-0001", docDate: `${y - 6}-04-12`, bns: null, ki: null, ratePct: null, taxNote: "" },
    { id: "demo-land-2", eni: "1-00-00-0000-0002 (демо)", name: "Поле у реки", category: "agri", agriType: "irrigated", region: "Чуйская область", district: "Сокулукский район", address: "айыл аймак (демо)", areaM2: 420_000, purpose: "для ведения сельского хозяйства", right: "lease", docKind: "Договор аренды", docNumber: "ДЕМО-А-17", docDate: `${y - 2}-03-01`, leaseTo: soon, leaseRentYear: 168_000, bns: null, ki: null, ratePct: null },
    { id: "demo-land-3", eni: "1-00-00-0000-0003 (демо)", name: "Пастбище", category: "agri", agriType: "pasture", region: "Нарынская область", district: "Кочкорский район", address: "(демо)", areaM2: 1_350_000, purpose: "пастбище", right: "use", docKind: "Решение о предоставлении", docNumber: "", docDate: "", bns: null, ki: null, ratePct: null },
    { id: "demo-land-4", eni: "1-00-00-0000-0004 (демо)", name: "Склад у трассы", category: "nonagri", region: "Чуйская область", district: "Аламудунский район", address: "трасса Бишкек — Кант (демо)", areaM2: 3_800, purpose: "для складских помещений", right: "own", docKind: "Государственный акт", docNumber: "ДЕМО-0004", docDate: `${y - 3}-09-20`, bns: null, ki: null, ratePct: null },
  ];
}
