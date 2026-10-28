// ════════════════════════════════════════════════════════════════════════
// lib/esg/materiality.ts — существенные темы и климатические риски.
//
// Принцип двойной существенности: тема оценивается по двум осям —
// воздействие компании на людей и окружающую среду (impact) и влияние темы
// на финансовые результаты компании (financial). Оценки 1–5.
// По умолчанию подставляются типовые оценки для отрасли; компания может
// их изменить по итогам опроса заинтересованных сторон.
// ════════════════════════════════════════════════════════════════════════

import type { Industry } from "./input";

export interface Topic {
  key: string;
  pillar: "E" | "S" | "G";
  title: string;
  description: string;
  gri: string;
  sdg: string;
}

export const TOPICS: Topic[] = [
  { key: "energy", pillar: "E", title: "Энергопотребление и выбросы ПГ", description: "Сколько энергии и топлива расходует компания и какие выбросы это создаёт.", gri: "GRI 302, 305", sdg: "ЦУР 7, 13" },
  { key: "waste", pillar: "E", title: "Ресурсы и отходы", description: "Расход материалов, образование отходов, раздельный сбор и переработка.", gri: "GRI 301, 306", sdg: "ЦУР 12" },
  { key: "water", pillar: "E", title: "Водные ресурсы", description: "Водозабор, сточные воды, бережное отношение к воде в регионе с её дефицитом.", gri: "GRI 303", sdg: "ЦУР 6" },
  { key: "climate", pillar: "E", title: "Климатические риски", description: "Как изменение климата и энергетическая политика влияют на бизнес.", gri: "GRI 201-2", sdg: "ЦУР 13" },
  { key: "labour", pillar: "S", title: "Условия труда и оплата", description: "Честная и своевременная зарплата, официальное оформление, социальные гарантии.", gri: "GRI 202, 401", sdg: "ЦУР 8" },
  { key: "safety", pillar: "S", title: "Охрана труда и здоровья", description: "Безопасные рабочие места, отсутствие травм и профзаболеваний.", gri: "GRI 403", sdg: "ЦУР 3, 8" },
  { key: "training", pillar: "S", title: "Обучение и развитие", description: "Повышение квалификации, наставничество, карьерный рост.", gri: "GRI 404", sdg: "ЦУР 4" },
  { key: "diversity", pillar: "S", title: "Равные возможности", description: "Отсутствие дискриминации, доля женщин, в том числе среди руководителей.", gri: "GRI 405, 406", sdg: "ЦУР 5, 10" },
  { key: "customers", pillar: "S", title: "Ответственность перед клиентами", description: "Качество и безопасность продукции и услуг, работа с жалобами.", gri: "GRI 416, 417", sdg: "ЦУР 12" },
  { key: "community", pillar: "S", title: "Местное сообщество", description: "Рабочие места в регионе, закупки у местных поставщиков, социальные проекты.", gri: "GRI 203, 204, 413", sdg: "ЦУР 1, 8, 11" },
  { key: "ethics", pillar: "G", title: "Деловая этика и антикоррупция", description: "Политики, обучение, отсутствие коррупционных нарушений.", gri: "GRI 205, 2-23", sdg: "ЦУР 16" },
  { key: "tax", pillar: "G", title: "Налоговая прозрачность", description: "Своевременная уплата налогов и взносов, отсутствие штрафов.", gri: "GRI 207", sdg: "ЦУР 16, 17" },
  { key: "data", pillar: "G", title: "Защита данных", description: "Сохранность персональных данных клиентов и сотрудников.", gri: "GRI 418", sdg: "ЦУР 16" },
  { key: "governance", pillar: "G", title: "Управление и прозрачность отчётности", description: "Ответственность органов управления, достоверная отчётность.", gri: "GRI 2-9…2-27", sdg: "ЦУР 16" },
];

type Scores = Record<string, [number, number]>; // [impact, financial]

const BASE: Scores = {
  energy: [3, 3], waste: [3, 2], water: [2, 2], climate: [2, 3],
  labour: [4, 4], safety: [3, 3], training: [3, 3], diversity: [3, 2], customers: [3, 4], community: [3, 2],
  ethics: [4, 4], tax: [4, 4], data: [2, 3], governance: [3, 4],
};

const BY_INDUSTRY: Partial<Record<Industry, Partial<Scores>>> = {
  production: { energy: [4, 4], waste: [4, 3], water: [3, 3], safety: [5, 4], climate: [3, 3] },
  agriculture: { water: [5, 5], climate: [5, 5], energy: [3, 3], safety: [4, 3], community: [4, 3] },
  catering: { waste: [4, 3], water: [3, 3], customers: [5, 5], safety: [4, 4], energy: [3, 3] },
  construction: { safety: [5, 5], waste: [4, 3], energy: [4, 3], climate: [3, 4], community: [4, 3] },
  trade: { customers: [4, 5], waste: [3, 2], energy: [2, 3], community: [3, 3] },
  services: { energy: [2, 2], waste: [2, 2], water: [1, 1], data: [3, 4], training: [4, 4] },
  it: { energy: [2, 2], waste: [2, 1], water: [1, 1], data: [5, 5], training: [4, 5], diversity: [4, 3] },
  transport: { energy: [5, 5], climate: [4, 4], safety: [5, 4], waste: [3, 2] },
};

export interface ScoredTopic extends Topic {
  impact: number;
  financial: number;
  total: number;
  level: "high" | "medium" | "low";
  custom: boolean;
}

export function scoreTopics(industry: Industry, overrides: Record<string, { impact: number; financial: number }> = {}): ScoredTopic[] {
  const def = { ...BASE, ...(BY_INDUSTRY[industry] ?? {}) } as Scores;
  return TOPICS.map((t) => {
    const o = overrides[t.key];
    const custom = !!o && o.impact > 0 && o.financial > 0;
    const impact = custom ? o.impact : def[t.key][0];
    const financial = custom ? o.financial : def[t.key][1];
    const total = Math.round(((impact + financial) / 2) * 10) / 10;
    return { ...t, impact, financial, total, custom, level: total >= 4 ? "high" : total >= 3 ? "medium" : "low" } as ScoredTopic;
  }).sort((a, b) => b.total - a.total || b.financial - a.financial);
}

export const LEVEL_LABEL = { high: "высокая", medium: "средняя", low: "низкая" } as const;

// ── Климатические риски ────────────────────────────────────────────────────

export interface ClimateRisk {
  type: "Физический острый" | "Физический хронический" | "Переходный";
  risk: string;
  /** оценка 1–5 на горизонтах: до 3 лет, 3–10, 10–30 */
  scores: [number, number, number];
  impact: string;
  response: string;
}

const COMMON: ClimateRisk[] = [
  { type: "Физический острый", risk: "Сели, паводки, сильные снегопады", scores: [2, 3, 3],
    impact: "Перебои в логистике и поставках, повреждение имущества, простои.", response: "Страхование имущества, резервные маршруты поставок, план действий при ЧС." },
  { type: "Физический острый", risk: "Аномальная жара", scores: [2, 3, 4],
    impact: "Рост расходов на охлаждение, снижение производительности труда, порча продукции.", response: "Энергоэффективное кондиционирование, режим труда в жару, контроль условий хранения." },
  { type: "Физический хронический", risk: "Дефицит воды и сокращение ледников", scores: [1, 3, 4],
    impact: "Рост тарифов на воду, ограничения водопользования, снижение выработки ГЭС.", response: "Учёт и экономия воды, оборотное водоснабжение там, где оно применимо." },
  { type: "Переходный", risk: "Рост тарифов и дефицит электроэнергии", scores: [3, 4, 4],
    impact: "Энергосистема КР испытывает зимний дефицит; тарифы для юридических лиц пересматриваются — растут операционные расходы, возможны отключения.", response: "Энергоаудит, снижение потребления, резервное питание, собственная солнечная генерация." },
  { type: "Переходный", risk: "Требования банков, инвесторов и покупателей к ESG-раскрытию", scores: [2, 3, 4],
    impact: "Без отчётности о выбросах дороже или недоступно финансирование, сложнее работать с международными покупателями.", response: "Ежегодный ESG-отчёт, учёт выбросов Охватов 1–2, постановка целей." },
];

const BY_INDUSTRY_RISKS: Partial<Record<Industry, ClimateRisk[]>> = {
  agriculture: [
    { type: "Физический хронический", risk: "Засухи, смещение сезонов, деградация почв", scores: [3, 4, 5],
      impact: "Снижение урожайности и качества сырья, рост себестоимости, срыв контрактов.", response: "Капельное орошение, засухоустойчивые культуры, диверсификация поставщиков сырья, агрострахование." },
  ],
  production: [
    { type: "Переходный", risk: "Углеродное регулирование экспорта (CBAM ЕС, требования покупателей)", scores: [1, 3, 4],
      impact: "Для экспортёров в ЕС — затраты на подтверждение углеродного следа продукции.", response: "Учёт выбросов на единицу продукции, энергоэффективное оборудование." },
  ],
  transport: [
    { type: "Переходный", risk: "Ужесточение требований к топливу и выбросам транспорта", scores: [2, 3, 4],
      impact: "Обновление парка, рост стоимости топлива.", response: "Поэтапный переход на газ, гибриды и электромобили, оптимизация маршрутов." },
  ],
  construction: [
    { type: "Физический острый", risk: "Экстремальные погодные условия на объектах", scores: [3, 3, 4],
      impact: "Срыв сроков, травмы, повреждение материалов.", response: "Учёт погодных рисков в графиках, охрана труда при жаре и холоде." },
  ],
  catering: [
    { type: "Физический хронический", risk: "Рост цен на продукты из-за климатических шоков", scores: [2, 3, 4],
      impact: "Рост себестоимости блюд, перебои с ассортиментом.", response: "Сезонное меню, местные поставщики, сокращение пищевых отходов." },
  ],
};

export function climateRisks(industry: Industry): ClimateRisk[] {
  return [...(BY_INDUSTRY_RISKS[industry] ?? []), ...COMMON];
}

export const SCORE_SCALE = [
  "1 — воздействия нет или оно минимально",
  "2 — незначительное, краткосрочное и обратимое",
  "3 — умеренное, заметное в финансовых показателях",
  "4 — значительное, требует изменения процессов",
  "5 — критическое, угрожает бизнес-модели",
];
