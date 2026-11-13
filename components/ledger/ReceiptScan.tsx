"use client";

// Чек по фото: QR-код и текст распознаются прямо в браузере (фото никуда не отправляется),
// найденные дата, сумма, продавец и ИНН подставляются в проводку — пользователь проверяет и проводит.
import { useRef, useState } from "react";
import { AccountPicker } from "./AccountPicker";
import { parseReceipt, type ReceiptData } from "@/lib/receipt/parse";

type Line = { account: string; debit: number; credit: number; party?: string; partyInn?: string; memo?: string };
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Фото → ч/б с усиленным контрастом, не больше 1800 px: так термочеки читаются заметно лучше. */
function prepare(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function binarize(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d")!; ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  let sum = 0;
  for (let i = 0; i < d.data.length; i += 4) { const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]; d.data[i] = g; sum += g; }
  const mean = sum / (d.data.length / 4), thr = mean * 0.85;
  for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i] < thr ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
  ctx.putImageData(d, 0, 0);
  return c;
}

export function ReceiptScan({ defaultDate, onSubmit, onCancel }: { defaultDate: string; onSubmit: (e: { date: string; description: string; lines: Line[] }) => Promise<boolean>; onCancel: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [f, setF] = useState({ date: defaultDate, total: "", seller: "", inn: "", account: "8490", pay: "1110", vat: false, vatSum: "", description: "" });
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    setData(null); setText("");
    const url = URL.createObjectURL(file); setPreview(url);
    const img = new Image(); img.src = url; await img.decode();
    const canvas = prepare(img);
    setStage("Ищу QR-код…");
    let qr: string | null = null;
    try {
      const { default: jsQR } = await import("jsqr");
      const ctx = canvas.getContext("2d")!;
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      qr = jsQR(id.data, id.width, id.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
    } catch { /* без QR */ }
    setStage("Читаю текст чека… (первый раз загружается словарь, около 7 МБ)");
    let ocr = "";
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("rus", 1, {
        workerPath: "/ocr/worker.min.js", corePath: "/ocr/", langPath: "/ocr", gzip: true, workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") setStage(`Читаю текст чека… ${Math.round(m.progress * 100)} %`); },
      });
      ocr = (await worker.recognize(binarize(canvas))).data.text;
      await worker.terminate();
    } catch (e) { setStage(`Текст не распознан: ${(e as Error).message}. Заполните поля вручную.`); }
    const r = parseReceipt(ocr, qr);
    setText(ocr); setData(r);
    setF((x) => ({
      ...x, date: r.date ?? x.date, total: r.total != null ? String(r.total).replace(".", ",") : "", seller: r.seller ?? "", inn: r.inn ?? "",
      account: r.account, vatSum: r.vat != null ? String(r.vat).replace(".", ",") : "", vat: false,
      description: `Покупка по чеку${r.seller ? `: ${r.seller}` : ""}`,
    }));
    setStage(null);
  }

  const total = Number(f.total.replace(/\s/g, "").replace(",", ".")) || 0;
  const vatSum = f.vat ? Number(f.vatSum.replace(/\s/g, "").replace(",", ".")) || 0 : 0;
  const lines: Line[] = total > 0 ? [
    { account: f.account, debit: r2(total - vatSum), credit: 0, party: f.seller || undefined, partyInn: f.inn || undefined },
    ...(vatSum > 0 ? [{ account: "1540", debit: r2(vatSum), credit: 0, memo: "НДС по чеку" }] : []),
    { account: f.pay, debit: 0, credit: r2(total) },
  ] : [];

  return (
    <div className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-fl-cream">Чек по фото</h3>
          <p className="text-xs text-fl-cream/55">Фото обрабатывается в вашем браузере и на сервер не отправляется. Проверьте найденные данные перед проводкой.</p>
        </div>
        <button onClick={onCancel} className="text-sm text-fl-cream/50 hover:text-fl-cream">Закрыть</button>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <button type="button" onClick={() => input.current?.click()} className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-fl-line bg-fl-surface-2 text-sm text-fl-cream/60 hover:border-fl-gold/60">
            {preview ? <img src={preview} alt="Фото чека" className="h-full w-full object-contain" /> : <span className="px-4 text-center">Сфотографировать или выбрать фото чека</span>}
          </button>
          <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) read(file); }} />
          {stage && <p className="mt-2 text-xs text-fl-cream/60" role="status">{stage}</p>}
        </div>
        {(data || preview) && !stage ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-fl-cream/75">Дата<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={field} /></label>
              <label className="text-sm text-fl-cream/75">Сумма по чеку, сом<input value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} inputMode="decimal" className={`${field} ${!f.total ? "border-fl-amber" : ""}`} /></label>
              <label className="text-sm text-fl-cream/75">Продавец<input value={f.seller} onChange={(e) => setF({ ...f, seller: e.target.value })} className={field} /></label>
              <label className="text-sm text-fl-cream/75">ИНН продавца<input value={f.inn} onChange={(e) => setF({ ...f, inn: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={field} /></label>
              <label className="text-sm text-fl-cream/75 sm:col-span-2">Содержание<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={field} /></label>
              <div className="text-sm text-fl-cream/75">На какой счёт<AccountPicker label="Счёт расходов" value={f.account} onChange={(a) => setF({ ...f, account: a })} ifrs={false} className="mt-1" />{data && <span className="mt-1 block text-xs text-fl-cream/50">Предложено: {data.hint}</span>}</div>
              <label className="text-sm text-fl-cream/75">Чем оплачено<select value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} className={field}><option value="1110">Наличными из кассы — 1110</option><option value="1210">Картой или со счёта — 1210</option></select></label>
            </div>
            {f.vatSum && <label className="flex items-center gap-2 text-sm text-fl-cream/75"><input type="checkbox" checked={f.vat} onChange={(e) => setF({ ...f, vat: e.target.checked })} /> Компания — плательщик НДС: выделить НДС {f.vatSum} на счёт 1540</label>}
            {data?.checkUrl && <a href={data.checkUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-fl-gold underline">Проверить чек на сайте налоговой службы</a>}
            {lines.length > 0 && <p className="text-xs text-fl-cream/55">Проводка: {lines.map((l) => `${l.debit ? "Дт" : "Кт"} ${l.account} ${(l.debit || l.credit).toLocaleString("ru-RU")}`).join(" · ")}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={!lines.length || !f.date} onClick={async () => { if (await onSubmit({ date: f.date, description: f.description || "Покупка по чеку", lines })) { setPreview(null); setData(null); } }} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">Провести</button>
              <button onClick={() => input.current?.click()} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/80 hover:text-fl-cream">Другое фото</button>
            </div>
            {text && <details className="text-xs text-fl-cream/50"><summary className="cursor-pointer">Распознанный текст</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-fl-surface-2 p-2">{text}</pre></details>}
          </div>
        ) : !preview && <p className="self-center text-sm text-fl-cream/60">Сфотографируйте чек целиком при хорошем освещении. Программа найдёт дату, итог, продавца и ИНН, прочитает QR-код налоговой и предложит счёт расходов по товарам в чеке.</p>}
      </div>
    </div>
  );
}
