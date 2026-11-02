#!/bin/sh
# 운영 PostgreSQL을 매일 정해진 시각에 pg_dump로 백업하고, 보관 기간이 지난 덤프를 지운다.
# 사용법: pg-backup.sh          매일 BACKUP_HOUR_UTC 시각에 반복 실행
#         pg-backup.sh once     즉시 한 번 백업하고 종료 (수동 점검·배포 직후 확인용)
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

backup_dir="${BACKUP_DIR:-/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-7}"
# 컨테이너에 시간대 데이터가 없으므로 UTC 기준 시각을 쓴다. 18시 UTC = 03시 KST.
backup_hour_utc="${BACKUP_HOUR_UTC:-18}"

# 덤프에는 개인정보가 들어 있으므로 소유자만 읽을 수 있게 만든다.
umask 077

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

backup() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  partial="$backup_dir/.dio-$stamp.dump.partial"
  target="$backup_dir/dio-$stamp.dump"
  if pg_dump --format=custom --no-owner --no-privileges --file="$partial"; then
    mv "$partial" "$target"
    log "backup ok file=$(basename "$target") bytes=$(wc -c < "$target")"
  else
    rm -f "$partial"
    log "backup failed"
    return 1
  fi
}

# 백업 성공 여부와 관계없이 보관 기간이 지난 덤프는 지운다. 삭제 요청된 자료가 백업에 남는 최대 기간을 지키기 위해서다.
prune() {
  find "$backup_dir" -maxdepth 1 -name 'dio-*.dump' -mmin +"$((retention_days * 1440))" -print -delete \
    | while read -r removed; do log "backup pruned file=$(basename "$removed")"; done
  find "$backup_dir" -maxdepth 1 -name '.dio-*.dump.partial' -mmin +1440 -delete
}

seconds_until_next_run() {
  now="$(date -u +%s)"
  wait=$(( (backup_hour_utc * 3600 - now % 86400 + 86400) % 86400 ))
  [ "$wait" -eq 0 ] && wait=86400
  echo "$wait"
}

mkdir -p "$backup_dir"

if [ "${1:-}" = "once" ]; then
  backup
  prune
  exit 0
fi

log "backup scheduler started hour_utc=$backup_hour_utc retention_days=$retention_days"
while true; do
  sleep "$(seconds_until_next_run)"
  backup || true
  prune
done
