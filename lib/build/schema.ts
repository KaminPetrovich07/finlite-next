// Проверка объектов и документов раздела «Стройка», пришедших из браузера.
import { z } from "zod";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const id = z.string().trim().min(1).max(40);
const date = z.string().regex(ISO, "Дата в формате ГГГГ-ММ-ДД");
const optDate = z.union([date, z.literal("")]).optional().transform((v) => v || undefined);
const money = z.number().min(0).max(1e12);
const qty = z.number().min(0).max(1e9);
const costType = z.enum(["material", "labor", "machine", "subcontract", "other"]);

export const ObjectSchema = z.object({
  id,
  name: z.string().trim().min(1, "Укажите наименование объекта").max(300),
  address: z.string().max(300).optional(),
  customer: z.string().max(300),
  customerInn: z.string().trim().regex(/^\d{0,14}$/, "ИНН заказчика — до 14 цифр").optional(),
  investor: z.string().max(300).optional(),
  contractNo: z.string().max(60).optional(),
  contractDate: optDate,
  start: optDate,
  end: optDate,
  vat: z.boolean(),
  retentionPct: z.number().min(0).max(50),
  advancePct: z.number().min(0).max(100).optional(),
  warrantyMonths: z.number().int().min(0).max(120).optional(),
  status: z.enum(["active", "done"]),
  stages: z.array(z.object({ id, name: z.string().max(300) })).min(1, "Добавьте хотя бы один этап").max(100),
  works: z.array(z.object({ id, stageId: id, code: z.string().max(60).optional(), name: z.string().max(500), unit: z.string().max(20), qty, price: money })).max(3000),
  resources: z.array(z.object({ id, stageId: id, type: costType, name: z.string().max(500), unit: z.string().max(20), qty, price: money })).max(5000),
});

const Row = z.object({
  stageId: z.string().max(40).optional(),
  workId: z.string().max(40).optional(),
  code: z.string().max(60).optional(),
  name: z.string().trim().min(1, "Укажите наименование").max(500),
  unit: z.string().trim().max(20),
  qty: z.number().positive("Количество должно быть больше нуля").max(1e9),
  price: money,
  costType: costType.optional(),
  vat: money.optional(),
});

export const BuildDocSchema = z.object({
  type: z.enum(["writeoff", "cost", "ks2"]),
  objectId: id,
  number: z.string().trim().min(1, "Укажите номер").max(40),
  date,
  from: optDate,
  to: optDate,
  pay: z.enum(["credit", "cash", "bank", "reclass"]).optional(),
  party: z.string().max(300).optional(),
  partyInn: z.string().trim().regex(/^\d{0,14}$/, "ИНН — до 14 цифр").optional(),
  reclass: z.string().max(10).optional(),
  final: z.boolean().optional(),
  comment: z.string().max(1000).optional(),
  rows: z.array(Row).min(1, "Добавьте хотя бы одну строку").max(1000),
});
