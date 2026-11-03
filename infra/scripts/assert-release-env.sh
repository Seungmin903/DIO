#!/usr/bin/env bash
# Release는 develop PostgreSQL 컨테이너를 공유하되, 반드시 별도 DB를 사용한다.
set -euo pipefail

env_file="${1:?usage: $0 <env-file>}"
database_definition_count="$(grep -Ec '^[[:space:]]*POSTGRES_DB[[:space:]]*=' "$env_file" || true)"

if [ "$database_definition_count" -ne 1 ]; then
  echo "Release deployment requires exactly one POSTGRES_DB definition." >&2
  exit 1
fi

if ! grep -Eq "^[[:space:]]*POSTGRES_DB[[:space:]]*=[[:space:]]*(dio_release|'dio_release'|\"dio_release\")[[:space:]]*$" "$env_file"; then
  echo "Release deployment requires POSTGRES_DB=dio_release." >&2
  exit 1
fi
