import { NextResponse } from "next/server";
import type { OfficialDoc } from "@/lib/docs/model";
import { renderOfficialDocx } from "@/lib/docs/render-docx";
import { renderOfficialPdf } from "@/lib/docs/render-pdf";

export type DocFormat = "pdf" | "docx";

const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Renders an official document and returns it as a download. */
export async function sendDoc(doc: OfficialDoc, format: DocFormat): Promise<NextResponse> {
  const buf = format === "pdf" ? await renderOfficialPdf(doc) : await renderOfficialDocx(doc);
  const name = `${doc.fileName}.${format}`.replace(/[\\/:*?"<>|«»]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="document.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

export function docFormat(v: string | null): DocFormat | null {
  return v === "pdf" || v === "docx" ? v : null;
}
