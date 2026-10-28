// ════════════════════════════════════════════════════════════════════════
// lib/esg/factors.ts — коэффициенты выбросов и пересчёта энергии.
//
// Каждый коэффициент хранит не только значение, но и вывод и источник:
// они печатаются в приложении «Методика и коэффициенты», чтобы любой
// читатель мог повторить расчёт. Пользователь может заменить любое
// значение своим (например, из паспорта топлива или данных поставщика),
// и в отчёте будет указано, что коэффициент задан компанией.
//
// Топливо: IPCC 2006 Guidelines for National GHG Inventories, Vol. 2,
// Ch. 1, Table 1.2 (теплотворная способность, NCV) и Table 1.4 (выбросы
// CO₂ при стационарном сжигании). Плотности — типичные значения; это
// допущение, оно указано в отчёте.
// ════════════════════════════════════════════════════════════════════════

export interface Fuel {
  key: string;
  label: string;
  unit: string;
  /** kg CO2 per TJ, IPCC 2006 default */
  co2PerTj: number;
  /** net calorific value, TJ per Gg (= GJ per t) */
  ncv: number;
  /** kg per unit of the input (1 for t → 1000 kg handled by unitKg) */
  unitKg: number;
  densityNote?: string;
}

export const FUELS = {
  diesel: { key: "diesel", label: "Дизельное топливо", unit: "л", co2PerTj: 74_100, ncv: 43.0, unitKg: 0.84, densityNote: "плотность 0,84 кг/л" },
  petrol: { key: "petrol", label: "Бензин", unit: "л", co2PerTj: 69_300, ncv: 44.3, unitKg: 0.74, densityNote: "плотность 0,74 кг/л" },
  gas: { key: "gas", label: "Природный газ", unit: "м³", co2PerTj: 56_100, ncv: 48.0, unitKg: 0.717, densityNote: "плотность 0,717 кг/м³" },
  coalBituminous: { key: "coalBituminous", label: "Уголь каменный", unit: "т", co2PerTj: 94_600, ncv: 25.8, unitKg: 1000 },
  coalSubBituminous: { key: "coalSubBituminous", label: "Уголь суббитуминозный", unit: "т", co2PerTj: 96_100, ncv: 18.9, unitKg: 1000 },
  coalLignite: { key: "coalLignite", label: "Уголь бурый (лигнит)", unit: "т", co2PerTj: 101_000, ncv: 11.9, unitKg: 1000 },
} satisfies Record<string, Fuel>;

export type CoalType = "coalBituminous" | "coalSubBituminous" | "coalLignite";

/** GJ per unit of fuel: NCV (GJ/t) × mass of one unit (t). */
export function gjPerUnit(f: Fuel): number {
  return (f.ncv * f.unitKg) / 1000;
}

/** kg CO2 per unit of fuel: kg/TJ × TJ per unit. */
export function kgCo2PerUnit(f: Fuel): number {
  return (f.co2PerTj * gjPerUnit(f)) / 1000;
}

export const GRID = {
  value: 0.153, // kg CO2 / kWh
  source: "Ember / Our World in Data, интенсивность выбросов электроэнергетики КР за 2025 г. (через Power Atlas)",
  method: "по географическому (location-based) методу: средний коэффициент энергосистемы",
};

// District heat: Bishkek CHP and most boiler houses burn coal. IPCC coal CO2
// (94.6 t/TJ) per Gcal of fuel energy (4.1868 GJ) divided by an assumed 80%
// conversion efficiency. Cross-check: Eldik Bank 2024 sustainability report
// shows 425 t CO2-e for 878 Gcal = 0.484 t/Gcal.
export const HEAT = {
  value: Math.round(94.6 * 4.1868 / 0.8 * 10) / 10, // kg CO2 / Gcal ≈ 495
  source: "IPCC 2006 (уголь каменный, 94,6 т CO₂/ТДж) при КПД теплоисточника 80%; сверено с отчётом ОАО «Элдик Банк» за 2024 г. (425 т CO₂-экв. на 878 Гкал = 0,484)",
};

/** Scope 3 transport — order-of-magnitude factors, editable. */
export const TRANSPORT = {
  car: { value: 0.17, unit: "кг CO₂-экв./км", source: "ориентир по DEFRA (средний легковой автомобиль); уточните по своему парку" },
  bus: { value: 0.10, unit: "кг CO₂-экв./пасс.-км", source: "DEFRA 2026, средний городской автобус (0,10151)" },
  air: { value: 0.25, unit: "кг CO₂-экв./пасс.-км", source: "ориентир по DEFRA для коротких рейсов с учётом неуглеродного воздействия (RF)" },
  rail: { value: 0.03, unit: "кг CO₂-экв./пасс.-км", source: "DEFRA 2026, железная дорога (0,03092)" },
};

export const KWH_PER_GJ = 1 / 0.0036;
export const GJ_PER_GCAL = 4.1868;

/** Defaults the user can override in the form. */
export const DEFAULT_FACTORS = {
  gridFactor: GRID.value,
  heatFactor: HEAT.value,
  dieselFactor: round3(kgCo2PerUnit(FUELS.diesel)),
  petrolFactor: round3(kgCo2PerUnit(FUELS.petrol)),
  gasFactor: round3(kgCo2PerUnit(FUELS.gas)),
  coalFactor: round3(kgCo2PerUnit(FUELS.coalBituminous)),
  carFactor: TRANSPORT.car.value,
  busFactor: TRANSPORT.bus.value,
  airFactor: TRANSPORT.air.value,
  railFactor: TRANSPORT.rail.value,
};

export type FactorKey = keyof typeof DEFAULT_FACTORS;

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
