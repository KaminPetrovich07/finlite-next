// ════════════════════════════════════════════════════════════════════════
// lib/talent/rating.ts — рейтинг специалиста по открытой формуле (из 100).
// Каждая часть видна в анкете, поэтому рейтинг можно объяснить и оспорить.
//   опыт работы ............ до 30   (15 лет и больше — максимум)
//   квалификация ........... до 20   (сертификат с номером или ссылкой — 5, без — 2,5)
//   отзывы работодателей ... до 35   (средняя оценка × доверие: 5 отзывов и больше — полное)
//   полнота анкеты ......... до 10   (места работы, образование, рассказ о себе)
//   актуальность ........... до 5    (анкета обновлялась за последние полгода)
// Отзыв засчитывается, только если указаны имя и организация автора.
// ════════════════════════════════════════════════════════════════════════

export interface Cert { name: string; issuer?: string; year?: number | null; number?: string; url?: string }
export interface Workplace { org: string; position: string; from?: string; to?: string; current?: boolean; duties?: string }
export interface Education { institution: string; degree?: string; year?: number | null }

export interface RatingInput {
  experienceYears: number;
  certificates: Cert[];
  workplaces: Workplace[];
  education: Education[];
  about: string | null;
  updatedAt: string | Date;
  reviews: Array<{ rating: number; authorName: string; authorOrg: string; status?: string }>;
}

export interface RatingPart { key: string; label: string; points: number; max: number; note: string }

const r1 = (n: number) => Math.round(n * 10) / 10;

export function rating(i: RatingInput, now = new Date()): { total: number; parts: RatingPart[]; reviewAvg: number | null; reviewCount: number } {
  const exp = Math.max(0, Math.min(i.experienceYears, 15));
  const certPts = Math.min(20, i.certificates.reduce((s, c) => s + (c.number || c.url ? 5 : 2.5), 0));
  const valid = i.reviews.filter((r) => r.status !== "hidden" && r.authorName.trim() && r.authorOrg.trim() && r.rating >= 1 && r.rating <= 5);
  const avg = valid.length ? valid.reduce((s, r) => s + r.rating, 0) / valid.length : null;
  const trust = Math.min(valid.length, 5) / 5;
  const reviewPts = avg === null ? 0 : (avg / 5) * 35 * trust;
  const complete = (i.workplaces.some((w) => w.org && w.position) ? 5 : 0) + (i.education.some((e) => e.institution) ? 3 : 0) + ((i.about ?? "").trim().length >= 100 ? 2 : 0);
  const fresh = now.getTime() - new Date(i.updatedAt).getTime() <= 183 * 864e5 ? 5 : 0;
  const parts: RatingPart[] = [
    { key: "exp", label: "Опыт работы", points: r1((exp / 15) * 30), max: 30, note: `${i.experienceYears} ${i.experienceYears % 10 === 1 && i.experienceYears % 100 !== 11 ? "год" : [2, 3, 4].includes(i.experienceYears % 10) && ![12, 13, 14].includes(i.experienceYears % 100) ? "года" : "лет"}; максимум с 15 лет` },
    { key: "cert", label: "Квалификация", points: r1(certPts), max: 20, note: `${i.certificates.length} сертификат(ов); с номером или ссылкой — 5 баллов, без — 2,5` },
    { key: "reviews", label: "Отзывы работодателей", points: r1(reviewPts), max: 35, note: avg === null ? "отзывов пока нет" : `средняя ${r1(avg)} из 5 по ${valid.length} отзыв(ам); полный вес — с 5 отзывов` },
    { key: "profile", label: "Полнота анкеты", points: complete, max: 10, note: "места работы — 5, образование — 3, рассказ о себе от 100 знаков — 2" },
    { key: "fresh", label: "Актуальность", points: fresh, max: 5, note: fresh ? "анкета обновлялась за последние полгода" : "анкету давно не обновляли" },
  ];
  return { total: r1(parts.reduce((s, p) => s + p.points, 0)), parts, reviewAvg: avg === null ? null : r1(avg), reviewCount: valid.length };
}

const LEGAL = new Set(["осоо", "оао", "зао", "ип", "ооо", "ао", "чп"]);
/** «ОсОО «Белес»» → «белес»: legal form and quotes do not matter. */
const norm = (s: string) => s.toLowerCase().replace(/[«»"'.,]/g, " ").split(/\s+/).filter((w) => w && !LEGAL.has(w)).join(" ");

/** A workplace counts as confirmed when an employer review comes from the same organisation. */
export function confirmedWorkplaces(workplaces: Workplace[], reviews: Array<{ authorOrg: string; relation: string; status?: string }>): boolean[] {
  const orgs = new Set(reviews.filter((r) => r.status !== "hidden" && r.relation === "employer").map((r) => norm(r.authorOrg)));
  return workplaces.map((w) => !!w.org && orgs.has(norm(w.org)));
}

export const SPECIALIZATIONS = [
  "Бухгалтерский учёт", "Налоги и налоговое планирование", "МСФО", "Аудит", "Внутренний контроль", "Финансовый анализ",
  "Управленческий учёт", "Зарплата и кадры", "1С", "Банковский учёт", "Страхование", "Бюджетный учёт (госсектор)",
  "Казначейство", "Оценка", "ESG и устойчивое развитие", "Преподавание и наука",
];

export const AVAILABILITY: Record<string, string> = { open: "Ищет работу", part: "Рассмотрит предложения", busy: "Не ищет" };
export const WORK_FORMAT: Record<string, string> = { office: "в офисе", remote: "удалённо", outsource: "на аутсорсе (несколько компаний)" };
export const RELATION: Record<string, string> = { employer: "Работодатель", client: "Клиент", colleague: "Коллега" };

export const CONSENT_TEXT =
  "Я сам(а) размещаю эту анкету и согласен(на) с тем, что указанные в ней данные (ФИО, места работы, образование, сертификаты, контакты) будут показаны пользователям FinLite KG для поиска специалистов, а отзывы работодателей и рейтинг — рядом с анкетой. Согласие можно отозвать, удалив анкету: она удаляется полностью вместе с отзывами (Закон КР «Об информации персонального характера»).";
