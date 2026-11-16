#!/bin/sh
# Восстановление базы из резервной копии.
#   cd deploy && sh restore.sh backups/finlite-20261116-0230.dump
# Останавливает приложение, заменяет содержимое базы копией, запускает снова.
set -eu
f="${1:?укажите файл копии: sh restore.sh backups/finlite-....dump}"
[ -f "$f" ] || { echo "нет файла $f" >&2; exit 1; }
printf "База будет заменена содержимым %s. Продолжить? (yes/no) " "$f"; read a; [ "$a" = "yes" ] || exit 1
docker compose stop app cron
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$f"
docker compose start app cron
echo "Готово. Проверка: docker compose ps; curl -k https://localhost/api/health"
