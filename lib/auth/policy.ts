// Настройки защиты из переменных окружения (одинаково читаются сервером и тестами).
type Env = Record<string, string | undefined>;
const on = (v: string | undefined) => /^(1|on|true|yes)$/i.test(String(v ?? "").trim());

/** FL_REQUIRE_ADMIN_2FA=on — администраторские разделы закрыты, пока у администратора не включён двухфакторный вход. */
export const adminTwofaRequired = (env: Env = process.env) => on(env.FL_REQUIRE_ADMIN_2FA);

/** FL_IDLE_MINUTES — выход после стольких минут бездействия (5–1440); 0 или пусто — выключено. */
export function idleMinutes(env: Env = process.env): number {
  const n = Math.floor(Number(env.FL_IDLE_MINUTES));
  return Number.isFinite(n) && n > 0 ? Math.max(5, Math.min(1440, n)) : 0;
}

/** Как часто обновлять «последнюю активность» сессии: при тайм-ауте — чаще, иначе раз в час. */
export const touchEveryMs = (idle: number) => (idle ? Math.min(3600e3, (idle * 60e3) / 6) : 3600e3);

/** Сессия истекла по бездействию? */
export const idleExpired = (lastSeen: number, now: number, idle: number) => idle > 0 && now - lastSeen > idle * 60e3;
