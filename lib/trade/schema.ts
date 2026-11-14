// Проверка документа «Реализация» / «Поступление», пришедшего из браузера.
import { z } from "zod";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const Row = z.object({
  itemId: z.string().max(40).optional(),
  name: z.string().trim().min(1, "Укажите номенклатуру").max(300),
  unit: z.string().trim().max(20),
  kind: z.enum(["goods", "material", "product", "service"]),
  qty: z.number().positive("Количество должно быть больше нуля").max(1e9),
  price: z.number().min(0).max(1e12),
  vat: z.enum(["12", "0", "none"]),
});
export const Doc = z.object({
  type: z.enum(["sale", "purchase"]),
  number: z.string().trim().min(1, "Укажите номер").max(40),
  date: z.string().regex(ISO, "Дата в формате ГГГГ-ММ-ДД"),
  party: z.string().trim().max(200),
  partyInn: z.string().trim().regex(/^\d{0,14}$/, "ИНН — до 14 цифр").optional(),
  payment: z.enum(["credit", "cash", "bank"]),
  vatIncluded: z.boolean(),
  basis: z.string().max(300).optional(),
  comment: z.string().max(1000).optional(),
  rows: z.array(Row).min(1, "Добавьте хотя бы одну строку").max(500),
});
