#!/usr/bin/env bash
# Release는 develop PostgreSQL 컨테이너를 공유하되, 반드시 별도 DB를 사용한다.
# env 파일을 직접 파싱하지 않고 Compose가 실제로 해석한 DB_URL을 검증한다.
set -euo pipefail

env_file="${1:?usage: $0 <env-file>}"
rendered_config="$(BACKEND_IMAGE=release-env-preflight docker compose \
  --project-name dio-release-env-preflight \
  --env-file "$env_file" \
  -f infra/compose/compose.release.yml config)"
expected_db_url='jdbc:postgresql://db:5432/dio_release'

if ! printf '%s\n' "$rendered_config" | grep -Eq "^[[:space:]]*DB_URL:[[:space:]]*\"?${expected_db_url}\"?[[:space:]]*$"; then
  echo "Release deployment requires the rendered DB_URL to be $expected_db_url." >&2
  exit 1
fi
