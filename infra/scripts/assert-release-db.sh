#!/usr/bin/env bash
# release DB가 개발 DB와 같은 PostgreSQL 컨테이너 안에 사전 생성돼 있는지 확인한다.
set -euo pipefail

env_file="${1:?usage: $0 <env-file>}"

docker run --rm --network dio-dev_default --env-file "$env_file" postgres:17 \
  sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -qAt -v ON_ERROR_STOP=1 -h db -U "$POSTGRES_USER" -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '\''dio_release'\''" | grep -qx 1'
