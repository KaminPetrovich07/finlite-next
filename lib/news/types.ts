export type PostKind = "news" | "law" | "regulation" | "collection" | "article" | "research" | "event" | "opinion";

export const POST_KIND: Record<PostKind, { label: string; plural: string; hint: string }> = {
  news: { label: "Новость", plural: "Новости", hint: "Событие на рынке, в отрасли, в ведомствах" },
  law: { label: "Изменение законодательства", plural: "Законодательство", hint: "Новые законы и поправки: НК КР, закон о бухучёте, трудовое право" },
  regulation: { label: "Постановление, приказ, разъяснение", plural: "Постановления и разъяснения", hint: "Кабинет министров, ГНС, Минфин, НБКР, Госфиннадзор" },
  collection: { label: "Сборник", plural: "Сборники", hint: "Сборники конференций, трудов, методические пособия" },
  article: { label: "Статья", plural: "Статьи", hint: "Научная или практическая статья: ссылка на журнал или полный текст" },
  research: { label: "Исследование, данные", plural: "Исследования", hint: "Обзоры рынка, статистика, наборы данных" },
  event: { label: "Конференция, событие", plural: "События", hint: "Конференции, семинары, конкурсы, сроки подачи" },
  opinion: { label: "Мнение", plural: "Мнения", hint: "Позиция, вопрос к сообществу, разбор практики" },
};

export const POST_KINDS = Object.keys(POST_KIND) as PostKind[];
export const isPostKind = (k: unknown): k is PostKind => typeof k === "string" && k in POST_KIND;
