import { NextResponse } from "next/server";
import { route } from "@/lib/auth/server";
import { loadSnapshot } from "@/lib/science/server";

/** GET /api/science — недельная сводка мировой науки по учёту, аудиту и финансам (OpenAlex) */
export const GET = route(async () => {
  const s = await loadSnapshot();
  return NextResponse.json(s ? { ...s, translations: undefined } : null, { headers: { "Cache-Control": "public, max-age=600" } });
});
