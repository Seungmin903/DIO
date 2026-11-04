#!/usr/bin/env bash
# release DB가 개발 DB와 같은 PostgreSQL 컨테이너 안에 사전 생성돼 있는지 확인한다.
# docker compose를 사용해 release.env와 동일한 따옴표·이스케이프 규칙으로 값을 해석한다.
set -euo pipefail

env_file="${1:?usage: $0 <env-file>}"

docker compose --project-name dio-release-preflight --env-file "$env_file" \
  -f infra/compose/compose.release-db-check.yml run --rm --no-deps release-db-check
