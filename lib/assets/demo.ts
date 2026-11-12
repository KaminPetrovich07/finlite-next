// Карточки основных средств демо-компании — те же объекты, что в начальных
// остатках демо-журнала (цех, оборудование, программа) и покупке станка в августе.
import type { FixedAsset } from "./types";

const base = { residual: 0, location: "Цех, г. Бишкек", responsible: "Мастер цеха", supplier: "", disposedAt: null, disposalProceeds: 0, disposalReason: "", note: "" };

export const DEMO_ASSETS: FixedAsset[] = [
  { ...base, id: "demo-a1", name: "Производственный цех", inventoryNo: "000001", account: "2130", expenseAccount: "7150", taxGroup: 5, acquiredAt: "2022-06-15", inServiceAt: "2022-07-01", cost: 9_000_000, lifeMonths: 600, method: "straight", openingAccumulated: 1_350_000, openingDate: "2026-06-30" },
  { ...base, id: "demo-a2", name: "Форматно-раскроечный станок", inventoryNo: "000002", account: "2140", expenseAccount: "7150", taxGroup: 2, acquiredAt: "2024-03-10", inServiceAt: "2024-03-15", cost: 8_200_000, lifeMonths: 120, method: "straight", openingAccumulated: 1_020_000, openingDate: "2026-06-30" },
  { ...base, id: "demo-a3", name: "Сверлильно-присадочный станок", inventoryNo: "000003", account: "2140", expenseAccount: "7150", taxGroup: 2, acquiredAt: "2025-02-01", inServiceAt: "2025-02-10", cost: 5_800_000, lifeMonths: 120, method: "straight", openingAccumulated: 580_000, openingDate: "2026-06-30" },
  { ...base, id: "demo-a4", name: "Кромкооблицовочный станок", inventoryNo: "000004", account: "2140", expenseAccount: "7150", taxGroup: 2, acquiredAt: "2026-08-12", inServiceAt: "2026-08-14", cost: 640_000, lifeMonths: 96, method: "straight", openingAccumulated: 0, openingDate: null, supplier: "ОсОО «ТехноМебель»" },
  { ...base, id: "demo-a5", name: "Программа проектирования мебели (лицензия)", inventoryNo: "НМА-01", account: "2960", expenseAccount: "8480", taxGroup: 2, acquiredAt: "2024-07-01", inServiceAt: "2024-07-01", cost: 1_200_000, lifeMonths: 120, method: "straight", openingAccumulated: 240_000, openingDate: "2026-06-30", location: "Офис", responsible: "Конструктор" },
];
