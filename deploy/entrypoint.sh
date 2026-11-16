#!/bin/sh
# Запуск приложения в контейнере: привести схему базы к версии программы, затем сервер.
# prisma db push не удаляет данные: если изменение схемы требует удаления столбца
# или таблицы с данными, команда остановится с ошибкой и сервер не запустится —
# это сделано намеренно (см. deploy/README.md, «Обновление»).
set -e
if [ -z "$DATABASE_URL" ]; then echo "FinLite: не задана DATABASE_URL" >&2; exit 1; fi
echo "FinLite: проверка схемы базы данных…"
node node_modules/prisma/build/index.js db push --skip-generate --schema prisma/schema.prisma
echo "FinLite: запуск сервера на порту ${PORT:-3000}"
exec node server.js
