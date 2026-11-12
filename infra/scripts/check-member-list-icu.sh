#!/usr/bin/env bash
set -euo pipefail

# 운영·개발 서버: DB 컨테이너 이름을 넘긴다. CI 잡: --psql 을 넘기면 PGHOST·PGUSER·PGPASSWORD 등으로 직접 접속한다.
if [ "$#" -ne 1 ]; then echo "usage: $0 <postgres-container-name>|--psql" >&2; exit 3; fi
container_name="$1"
if [ "$container_name" != --psql ] && ! docker inspect --type container "$container_name" >/dev/null 2>&1; then
  echo "Member list ICU check failed: database container unavailable" >&2; exit 3
fi
run_query() {
  if [ "$container_name" = --psql ]; then
    psql -X -qAt -v ON_ERROR_STOP=1 -c "$1" 2>/dev/null
    return
  fi
  # Credentials stay inside the existing container; never render its environment.
  docker exec "$container_name" sh -c '
    set -eu
    export PGPASSWORD="${POSTGRES_PASSWORD:-}"
    exec psql -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -c "$1"
  ' sh "$1" 2>/dev/null
}
catalog_query=$(cat <<'SQL'
BEGIN READ ONLY;
SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE collname='und-x-icu' AND collnamespace='pg_catalog'::regnamespace AND collprovider='i' AND collisdeterministic);
ROLLBACK;
SQL
)
if ! supported="$(run_query "$catalog_query")"; then
  echo "Member list ICU check failed: database probe unavailable" >&2; exit 3
fi
case "$supported" in
  f) echo "Member list ICU unavailable: Unicode search/title sorting will return 503" >&2; exit 2 ;;
  t) ;;
  *) echo "Member list ICU check failed: unexpected database response" >&2; exit 3 ;;
esac
fold_query=$(cat <<'SQL'
BEGIN READ ONLY;
SELECT lower((chr(201)||chr(196)) COLLATE pg_catalog."und-x-icu") = (chr(233)||chr(228));
ROLLBACK;
SQL
)
if ! folded="$(run_query "$fold_query")" || [ "$folded" != t ]; then
  echo "Member list ICU check failed: Unicode lower operation unavailable" >&2; exit 3
fi
echo "Member list ICU supported: deterministic catalog collation and Unicode lower verified"
