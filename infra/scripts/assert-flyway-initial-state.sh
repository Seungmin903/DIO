#!/usr/bin/env bash
set -euo pipefail

container_name="${1:?usage: $0 <postgres-container-name>}"

if ! docker inspect --type container "$container_name" >/dev/null 2>&1; then
  echo "PostgreSQL 컨테이너를 찾을 수 없습니다: $container_name" >&2
  exit 1
fi

database_state="$(
  docker exec "$container_name" sh -lc '
    set -eu
    table_count="$(psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_type = '\''BASE TABLE'\'';")"
    if [ "$table_count" = "0" ]; then
      printf "blank"
      exit 0
    fi

    description="$(psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT description FROM flyway_schema_history WHERE version = '\''1'\'' AND success = true ORDER BY installed_rank DESC LIMIT 1;" 2>/dev/null || true)"
    if [ "$description" = "initial schema" ]; then
      printf "v1-ready"
    else
      printf "legacy-or-unexpected"
    fi
  '
)"

case "$database_state" in
  blank)
    echo "Flyway 사전 점검 통과: public 스키마가 비어 있습니다. V1을 최초 적용합니다."
    ;;
  v1-ready)
    echo "Flyway 사전 점검 통과: initial schema V1이 이미 적용되어 있습니다."
    ;;
  *)
    echo "배포 중단: 기존 또는 예상 밖의 DB 상태입니다. 백업 후 runbook에 따라 초기화하거나 V2 마이그레이션을 작성하세요." >&2
    exit 1
    ;;
esac
