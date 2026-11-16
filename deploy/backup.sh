#!/bin/sh
# Ежедневная резервная копия всей базы (проводки, документы, сканы, журнал действий).
# Работает в контейнере postgres: в BACKUP_AT (по умолчанию 02:30 по Бишкеку, UTC+6)
# делает pg_dump в /backups и удаляет копии старше BACKUP_KEEP_DAYS (по умолчанию 30).
# BACKUP_NOW=1 — сделать копию сразу при запуске контейнера.
set -eu
AT="${BACKUP_AT:-02:30}"; KEEP="${BACKUP_KEEP_DAYS:-30}"
export PGPASSWORD="$POSTGRES_PASSWORD"
# время Бишкека (UTC+6, без перехода на летнее) — не зависит от часового пояса образа
kg() { date -u -d "@$(( $(date +%s) + 21600 ))" "+$1"; }
dump() {
  f="/backups/finlite-$(kg %Y%m%d-%H%M).dump"
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 -f "$f.part"; then
    mv "$f.part" "$f"; echo "$(date -Iseconds) копия: $f ($(du -h "$f" | cut -f1))"
    find /backups -name 'finlite-*.dump' -mtime +"$KEEP" -delete
  else
    rm -f "$f.part"; echo "$(date -Iseconds) ОШИБКА резервного копирования" >&2
  fi
}
[ "${BACKUP_NOW:-0}" = "1" ] && dump
echo "резервные копии: каждый день в $AT по Бишкеку, хранить $KEEP дней"
last=""
while true; do
  now=$(kg %H:%M); day=$(kg %F)
  if [ "$now" = "$AT" ] && [ "$last" != "$day" ]; then last="$day"; dump; fi
  sleep 20
done
