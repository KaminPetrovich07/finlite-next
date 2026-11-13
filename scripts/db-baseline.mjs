// Один раз: перевести базу с «prisma db push» на версионные миграции.
//
// 1. Убедитесь, что база уже совпадает со схемой: npx prisma db push
// 2. npm run db:baseline — создаёт prisma/migrations/0_init/migration.sql из текущей схемы
//    и отмечает её в базе как уже применённую (данные не трогаются).
// 3. Закоммитьте папку prisma/migrations. Дальше любое изменение схемы:
//    npm run db:migrate -- --name <что_изменили>   (локально, создаёт новую миграцию)
//    npm run db:deploy                              (на сервере / перед деплоем)
//
// Почему: db push сравнивает схему с базой «на лету» и при несовместимом изменении может удалить
// столбец с данными; миграция — это SQL-файл, который проверяется в CI и применяется одинаково везде.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const dir = "prisma/migrations/0_init";
if (existsSync(`${dir}/migration.sql`)) {
  console.log(`${dir}/migration.sql уже есть — базовая миграция создана раньше.`);
  process.exit(0);
}
const run = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] }).toString();
const sql = run("npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script");
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/migration.sql`, sql);
writeFileSync("prisma/migrations/migration_lock.toml", 'provider = "postgresql"\n');
console.log(`Создано ${dir}/migration.sql (${sql.split("\n").length} строк).`);
execSync("npx prisma migrate resolve --applied 0_init", { stdio: "inherit" });
console.log("Готово: база отмечена как находящаяся на миграции 0_init. Закоммитьте prisma/migrations.");
