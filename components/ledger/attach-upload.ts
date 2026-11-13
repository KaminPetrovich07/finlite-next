"use client";

// Upload of a scan to an entry. Photos are reduced in the browser (max 1600 px, JPEG) —
// a phone picture of 4–8 MB becomes ~300 KB and reads just as well.
const MAX_SIDE = 1600;

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && file.type === "image/jpeg" && file.size < 1_500_000) { URL.revokeObjectURL(url); return file; }
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

export async function uploadAttachment(entryId: string, file: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", await shrinkImage(file));
  const r = await fetch(`/api/ledger/${entryId}/attachments`, { method: "POST", body: fd });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Не удалось прикрепить файл");
}
