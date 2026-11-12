import { HttpError } from "@/lib/auth/server";
import { clean, cleanList, safeUrl } from "@/lib/community/owner";
import { isPostKind } from "./types";

/** Validate a publication from the client. */
export function readPost(raw: any) {
  const kind = raw?.kind;
  if (!isPostKind(kind)) throw new HttpError(400, "Выберите вид публикации");
  const title = clean(raw?.title, 300);
  const body = clean(raw?.body, 50000);
  const authorName = clean(raw?.authorName, 120);
  if (title.length < 5) throw new HttpError(400, "Заголовок — от 5 знаков");
  if (body.length < 20 && !raw?.sourceUrl) throw new HttpError(400, "Напишите текст или дайте ссылку на источник");
  if (!authorName) throw new HttpError(400, "Укажите автора — анонимных публикаций нет");
  const d = clean(raw?.docDate, 10);
  return {
    kind, title, body, authorName,
    summary: clean(raw?.summary, 600) || null,
    authorOrg: clean(raw?.authorOrg, 200) || null,
    sourceUrl: safeUrl(raw?.sourceUrl), sourceName: clean(raw?.sourceName, 200) || null,
    imageUrl: safeUrl(raw?.imageUrl),
    docDate: /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00Z`) : null,
    tags: cleanList(raw?.tags, 10, 40),
  };
}

