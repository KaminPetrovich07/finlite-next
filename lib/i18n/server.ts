// Язык интерфейса на сервере: из cookie fl_lang, которую ставит переключатель РУ | КЫ.
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, type Lang } from "./index";

export async function requestLang(): Promise<Lang> {
  try { const v = (await cookies()).get(LANG_COOKIE)?.value; return isLang(v) ? v : "ru"; } catch { return "ru"; }
}
