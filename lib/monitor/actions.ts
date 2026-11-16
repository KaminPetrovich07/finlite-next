// ════════════════════════════════════════════════════════════════════════
// lib/monitor/actions.ts — журнал действий пользователей для администратора:
// понятные названия действий, группы для фильтра и выгрузка CSV.
// Записи создаёт logActivity() (lib/auth/server.ts) и вход/регистрация.
// Чистые функции.
// ════════════════════════════════════════════════════════════════════════

export const ACTION_LABELS: Record<string, string> = {
  register: "Регистрация", login: "Вход", login_failed: "Неудачная попытка входа", login_backup_code: "Вход по резервному коду",
  active_day: "Был на сайте", consent: "Согласие на обработку данных", password_change: "Смена пароля", sessions_revoke: "Выход на всех устройствах",
  profile_update: "Изменение профиля", account_export: "Выгрузка своих данных",
  company_create: "Создание компании", company_update: "Изменение компании", company_delete: "Удаление компании", company_import: "Загрузка компании из копии",
  company_backup: "Резервная копия компании", access_grant: "Открыт доступ к компании", access_revoke: "Закрыт доступ к компании",
  entry_update: "Изменение проводки", entry_delete: "Удаление проводки", entries_delete: "Удаление проводок", entries_restore: "Восстановление проводок",
  ledger_party: "Контрагент в проводках", recurring_create: "Повторяющаяся операция: создана", recurring_delete: "Повторяющаяся операция: удалена", recurring_run: "Повторяющиеся операции проведены",
  bank_import: "Загрузка банковской выписки", bank_delete: "Удаление строк выписки", esf_import: "Загрузка ЭСФ",
  trade_doc_create: "Документ продажи/закупки", trade_doc_update: "Изменение документа", trade_doc_pay: "Оплата документа", trade_doc_import: "Документы из 1С", trade_print: "Печать документа",
  catalog_save: "Справочник товаров", catalog_merge: "Объединение товаров", catalog_delete: "Удаление товара", cogs: "Списание себестоимости",
  import_goods_create: "Ввоз товара (импорт)", fx_revalue: "Переоценка валюты", fx_nbkr: "Курсы НБКР",
  asset_create: "Основное средство", asset_dispose: "Выбытие ОС", asset_doc: "Документ по ОС", depreciation: "Амортизация",
  hr_employee: "Сотрудник", hr_post: "Начисление зарплаты",
  attachment_add: "Скан к проводке", attachment_delete: "Удаление скана",
  export: "Выгрузка отчёта", taxreports_export: "Выгрузка налоговых отчётов", form_export: "Выгрузка формы", primary_export: "Первичный документ",
  insolvency_export: "Заключение финансовой диагностики", portfolio_export: "Обзор портфеля", counterparties_export: "Выгрузка контрагентов",
  counterparties_save: "Контрагенты", policy_save: "Учётная политика", policy_export: "Выгрузка учётной политики", costing_save: "Калькуляция", costing_export: "Выгрузка калькуляции",
  esg_save: "ESG-показатели", group_save: "Группа компаний",
  demo_copy: "Копия демо-компании", demo_showcase: "Демо для показа", demo_soe: "Демо-госпредприятие",
  admin_user_update: "Админ: изменение пользователя", admin_reset_link: "Админ: ссылка сброса пароля", admin_pilot: "Админ: пилот", admin_grant_pilot: "Админ: выдан пилот",
  admin_company_owner: "Админ: владелец компании", admin_claim_orphans: "Админ: компании без владельца", admin_assign_owner: "Админ: назначен владелец",
  news_collect: "Сбор новостей", law_load: "Загрузка закона", science_refresh: "Обновление науки", post_create: "Публикация",
  audit_export: "Админ: выгрузка журнала действий",
  study_start: "Обучение: начато", study_group: "Обучение: группа", specialist_create: "Анкета специалиста",
};

/** Группы для фильтра: какие действия показывать вместе. */
export const ACTION_GROUPS: Record<string, string[]> = {
  "Вход и учётные записи": ["register", "login", "login_failed", "login_backup_code", "password_change", "sessions_revoke", "profile_update", "consent", "account_export"],
  "Доступ к компаниям": ["company_create", "company_update", "company_delete", "company_import", "company_backup", "access_grant", "access_revoke"],
  "Изменения учёта": ["entry_update", "entry_delete", "entries_delete", "entries_restore", "bank_import", "bank_delete", "esf_import", "trade_doc_create", "trade_doc_update", "trade_doc_pay", "trade_doc_import", "import_goods_create", "hr_post", "depreciation", "cogs", "fx_revalue", "recurring_run", "attachment_add", "attachment_delete"],
  "Выгрузки": ["export", "taxreports_export", "form_export", "primary_export", "insolvency_export", "portfolio_export", "counterparties_export", "policy_export", "costing_export", "company_backup", "account_export", "trade_print"],
  "Действия администратора": ["audit_export", "admin_user_update", "admin_reset_link", "admin_pilot", "admin_grant_pilot", "admin_company_owner", "admin_claim_orphans", "admin_assign_owner"],
};

export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

export interface ActivityRow { id: string; createdAt: string; action: string; userEmail: string | null; companyId: string | null; companyName: string | null; details: unknown }

/** Значение ячейки CSV: кавычки, и защита от формул Excel (=, +, -, @ в начале). */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV для Excel: разделитель «;», BOM для кириллицы, время по Бишкеку (UTC+6). */
export function activityCsv(rows: ActivityRow[]): string {
  const head = ["Время (Бишкек)", "Пользователь", "Действие", "Код действия", "Компания", "ID компании", "Подробности"];
  const local = (iso: string) => new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
  const lines = rows.map((r) => [local(r.createdAt), r.userEmail ?? "—", actionLabel(r.action), r.action, r.companyName ?? "", r.companyId ?? "", r.details ?? ""].map(csvCell).join(";"));
  return "﻿" + [head.join(";"), ...lines].join("\r\n") + "\r\n";
}
