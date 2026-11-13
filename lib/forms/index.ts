// Каталог бланков альбома — в порядке его содержания.
import { CASH } from "./defs/cash";
import { FA } from "./defs/fa";
import { INV } from "./defs/inv";
import { HR_FORMS } from "./defs/hr";
import { STOCK } from "./defs/stock";
import { STORAGE } from "./defs/storage";
import { BUILD, CONTRACTS, IP_FORMS, OTHER } from "./defs/other";
import type { FormDef } from "./types";

export { ABSENT_FORMS } from "./defs/storage";

export const FORMS: FormDef[] = [...CASH, ...FA, ...INV, ...HR_FORMS, ...STOCK, ...STORAGE, ...BUILD, ...OTHER, ...CONTRACTS, ...IP_FORMS];
export const FORM_BY_ID: Record<string, FormDef> = Object.fromEntries(FORMS.map((f) => [f.id, f]));
