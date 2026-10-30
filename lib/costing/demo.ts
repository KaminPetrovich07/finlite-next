// Demo products of ОсОО «Белес» (furniture). Norms are sized so that monthly
// output roughly matches the demo journal: ~0.9 mln materials, ~0.31 mln wages.
import type { Product } from "./calc";

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "kitchen", name: "Кухонный гарнитур (2,4 м)", unit: "компл.", price: 75_000, laborPerUnit: 9_000, machineHours: 6,
    materials: [
      { name: "ЛДСП 16 мм", unit: "лист", qty: 6, price: 3_200 },
      { name: "Фасады МДФ", unit: "м²", qty: 4, price: 1_800 },
      { name: "Фурнитура кухонная", unit: "компл.", qty: 1, price: 3_600 },
    ],
  },
  {
    id: "wardrobe", name: "Шкаф-купе", unit: "шт.", price: 32_000, laborPerUnit: 5_000, machineHours: 3,
    materials: [
      { name: "ЛДСП 16 мм", unit: "лист", qty: 3, price: 3_200 },
      { name: "Зеркало", unit: "шт.", qty: 1, price: 1_600 },
      { name: "Система купе", unit: "компл.", qty: 1, price: 800 },
    ],
  },
  {
    id: "desk", name: "Офисный стол", unit: "шт.", price: 7_000, laborPerUnit: 1_000, machineHours: 0.8,
    materials: [
      { name: "ЛДСП 16 мм", unit: "лист", qty: 0.6, price: 3_200 },
      { name: "Кромка ПВХ", unit: "м", qty: 12, price: 30 },
      { name: "Фурнитура", unit: "компл.", qty: 1, price: 220 },
    ],
  },
];

/** Monthly output of the demo company; a quarter is three months of it. */
export const DEMO_MONTHLY_OUTPUT: Record<string, number> = { kitchen: 18, wardrobe: 22, desk: 40 };

export function demoOutputs(from: string, to: string): Record<string, number> {
  const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
  const m = Math.max(1, Math.min(12, months));
  return Object.fromEntries(Object.entries(DEMO_MONTHLY_OUTPUT).map(([k, v]) => [k, v * m]));
}
