// Attachments: limits and the checks shared by the upload, download and delete routes.
// Vercel принимает запрос не больше 4,5 МБ — оставляем запас
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_PER_ENTRY = 10;
export const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** File name safe for Content-Disposition (RFC 5987 for non-ASCII). */
export function disposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** First bytes of the file must match its declared type — a renamed .exe is not a PDF. */
export function sniff(buf: Uint8Array, mime: string): boolean {
  const b = (i: number) => buf[i];
  if (mime === "application/pdf") return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46; // %PDF
  if (mime === "image/png") return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if (mime === "image/jpeg") return b(0) === 0xff && b(1) === 0xd8;
  if (mime === "image/webp") return b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45;
  return false;
}
