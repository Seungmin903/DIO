#!/usr/bin/env bash
# backend를 $BACKEND_IMAGE로 교체하고 health를 확인한다.
# - 성공하면 이번 backend·AI 이미지를 마지막 정상 배포(<저장소>:prod-last-good)로 기록한다.
# - 실패하면 backend와 AI를 마지막 정상 배포 이미지로 함께 되돌리고(이전 backend가 새 AI를 부르지 않게),
#   되돌린 backend의 health도 확인한 뒤 실패로 끝난다.
# - 되돌릴 backend가 없으면(처음 배포) AI도 그대로 두고 실패만 알린다.
# 주의: 새 backend가 Flyway 마이그레이션을 이미 적용했다면 스키마는 되돌아가지 않는다.
#       이 롤백은 이전 backend와 호환되는(추가형, expand/contract) 마이그레이션에서만 안전하다.
# 사용: BACKEND_IMAGE=<새 이미지> AI_IMAGE=<이번 AI 이미지> up-backend-with-rollback.sh <compose 프로젝트> <env 파일> <compose 파일> <health URL>
set -u
: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${AI_IMAGE:?AI_IMAGE is required}"
project="${1:?compose project is required}"
env_file="${2:?env file is required}"
compose_file="${3:?compose file is required}"
health_url="${4:?health URL is required}"
ai_wait="${AI_WAIT_SECONDS:-180}"
health_retries="${HEALTH_RETRIES:-12}"
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy-images.sh
. "$here/deploy-images.sh"

compose() { docker compose --project-name "$project" --env-file "$env_file" -f "$compose_file" "$@"; }
healthy() { curl --fail --silent --show-error --retry "$health_retries" --retry-all-errors --retry-delay 2 "$health_url" >/dev/null; }

backend_target="$(rollback_target "$BACKEND_IMAGE")"
ai_target="$(rollback_target "$AI_IMAGE")"

if compose up -d --force-recreate --no-deps backend && healthy; then
  { mark_last_good "$BACKEND_IMAGE" && mark_last_good "$AI_IMAGE"; } ||
    echo "정상 배포 기록(prod-last-good 태그)을 남기지 못했습니다. 다음 배포의 롤백 기준이 이전 값으로 남습니다." >&2
  exit 0
fi

compose logs --tail=200 backend || true

if [ -z "$backend_target" ]; then
  echo "새 backend($BACKEND_IMAGE)가 정상 응답하지 않았습니다. 되돌릴 정상 배포 기록이 없어 backend·AI 모두 그대로 둡니다." >&2
  exit 1
fi

echo "새 backend($BACKEND_IMAGE)가 정상 응답하지 않아 마지막 정상 배포 backend($backend_target)로 되돌립니다." >&2
if BACKEND_IMAGE="$backend_target" compose up -d --force-recreate --no-deps backend && healthy; then
  echo "backend를 되돌렸고 정상 응답을 확인했습니다." >&2
else
  echo "되돌린 backend도 정상 응답하지 않습니다. DB 마이그레이션이 이전 backend와 호환되는지 수동으로 확인해 주세요." >&2
fi

if [ -n "$ai_target" ]; then
  echo "이전 backend와 맞추기 위해 AI도 마지막 정상 배포 AI($ai_target)로 되돌립니다." >&2
  if ! { AI_IMAGE="$ai_target" compose up -d --no-deps ai &&
         bash "$here/wait-container-healthy.sh" "$(compose ps -q ai)" "$ai_wait"; }; then
    echo "AI 되돌리기에 실패했습니다. 오리기 기능을 수동으로 확인해 주세요." >&2
  fi
fi
exit 1
