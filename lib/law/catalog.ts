// Acts every accountant in the KR works with. Only titles are listed here:
// the date and number of an act are read from its own text when it is
// loaded, so the catalogue never shows requisites nobody checked.
export interface CatalogDoc { slug: string; title: string; category: string; kind: "code" | "law" | "decree" | "nbkr" | "standard" | "other" }

export const CATEGORIES = ["Налоги", "Бухгалтерский учёт и аудит", "Труд и зарплата", "Гражданское право", "Финансовый рынок", "Госзакупки и бюджет", "Постановления и разъяснения", "Прочее"] as const;

export const LAW_CATALOG: CatalogDoc[] = [
  { slug: "nalogovyj-kodeks", title: "Налоговый кодекс Кыргызской Республики", category: "Налоги", kind: "code" },
  { slug: "kodeks-o-nenalogovyh-dohodah", title: "Кодекс Кыргызской Республики о неналоговых доходах", category: "Налоги", kind: "code" },
  { slug: "zakon-o-buhgalterskom-uchete", title: "Закон Кыргызской Республики «О бухгалтерском учете»", category: "Бухгалтерский учёт и аудит", kind: "law" },
  { slug: "zakon-ob-auditorskoj-deyatelnosti", title: "Закон Кыргызской Республики «Об аудиторской деятельности»", category: "Бухгалтерский учёт и аудит", kind: "law" },
  { slug: "trudovoj-kodeks", title: "Трудовой кодекс Кыргызской Республики", category: "Труд и зарплата", kind: "code" },
  { slug: "grazhdanskij-kodeks-1", title: "Гражданский кодекс Кыргызской Республики (часть первая)", category: "Гражданское право", kind: "code" },
  { slug: "grazhdanskij-kodeks-2", title: "Гражданский кодекс Кыргызской Республики (часть вторая)", category: "Гражданское право", kind: "code" },
  { slug: "zakon-o-hozyajstvennyh-tovarishchestvah", title: "Закон Кыргызской Республики «О хозяйственных товариществах и обществах»", category: "Гражданское право", kind: "law" },
  { slug: "zakon-o-nbkr", title: "Закон Кыргызской Республики «О Национальном банке Кыргызской Республики»", category: "Финансовый рынок", kind: "law" },
  { slug: "zakon-o-bankah", title: "Закон Кыргызской Республики «О банках и банковской деятельности»", category: "Финансовый рынок", kind: "law" },
  { slug: "zakon-ob-organizacii-strahovaniya", title: "Закон Кыргызской Республики «Об организации страхования в Кыргызской Республике»", category: "Финансовый рынок", kind: "law" },
  { slug: "zakon-o-rynke-cennyh-bumag", title: "Закон Кыргызской Республики «О рынке ценных бумаг»", category: "Финансовый рынок", kind: "law" },
  { slug: "zakon-o-goszakupkah", title: "Закон Кыргызской Республики «О государственных закупках»", category: "Госзакупки и бюджет", kind: "law" },
];

/** Search for the act on the official database (cbd.minjust.gov.kg) through a search engine. */
export const findOnline = (title: string) => `https://www.google.com/search?q=${encodeURIComponent(`site:cbd.minjust.gov.kg ${title}`)}`;

export const slugify = (s: string) => {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ң: "n", ө: "o", ү: "u" };
  return s.toLowerCase().split("").map((c) => map[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "doc";
};
