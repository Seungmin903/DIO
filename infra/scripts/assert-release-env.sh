#!/usr/bin/env bash
# Release는 develop PostgreSQL 컨테이너를 공유하되, 반드시 별도 DB를 사용한다.
set -euo pipefail

env_file="${1:?usage: $0 <env-file>}"
release_db="$(sed -n 's/^POSTGRES_DB=//p' "$env_file" | head -n 1 | tr -d '\r')"

if [ "$release_db" != "dio_release" ]; then
  echo "Release deployment requires POSTGRES_DB=dio_release; found a different or missing value." >&2
  exit 1
fi
