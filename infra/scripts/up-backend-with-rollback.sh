#!/usr/bin/env bash
# backend를 $BACKEND_IMAGE로 교체하고 health를 확인한다. 실패하면 backend와 AI를 배포 전 이미지로 함께 되돌리고 실패로 끝난다.
# 사용: BACKEND_IMAGE=<새 이미지> AI_IMAGE=<이번 AI 이미지> [PREV_AI_IMAGE=<배포 전 AI 이미지>] \
#       up-backend-with-rollback.sh <compose 프로젝트> <env 파일> <compose 파일> <health URL>
# - AI는 이 단계 전에 up-ai-with-rollback.sh로 이미 바뀌었을 수 있다. 이전 backend가 새 AI를 부르지 않도록 AI도 되돌린다.
# - 처음 배포라 되돌릴 이미지가 없으면 되돌리지 않고 실패만 알린다.
set -u
: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${AI_IMAGE:?AI_IMAGE is required}"
project="${1:?compose project is required}"
env_file="${2:?env file is required}"
compose_file="${3:?compose file is required}"
health_url="${4:?health URL is required}"
previous_ai="${PREV_AI_IMAGE:-}"
here="$(cd "$(dirname "$0")" && pwd)"

compose() { docker compose --project-name "$project" --env-file "$env_file" -f "$compose_file" "$@"; }
image_of() { local id; id="$(compose ps -q "$1")"; [ -n "$id" ] && docker inspect -f '{{.Config.Image}}' "$id" 2>/dev/null || true; }

previous_backend="$(image_of backend)"

if compose up -d --force-recreate --no-deps backend &&
   curl --fail --silent --show-error --retry 12 --retry-all-errors --retry-delay 2 "$health_url" >/dev/null; then
  exit 0
fi

compose logs --tail=200 backend || true

if [ -n "$previous_backend" ] && [ "$previous_backend" != "$BACKEND_IMAGE" ]; then
  echo "새 backend($BACKEND_IMAGE)가 정상 응답하지 않아 이전 이미지($previous_backend)로 되돌립니다." >&2
  BACKEND_IMAGE="$previous_backend" compose up -d --force-recreate --no-deps backend ||
    echo "이전 backend로 되돌리기에 실패했습니다. 수동으로 확인해 주세요." >&2
else
  echo "되돌릴 이전 backend 이미지가 없습니다." >&2
fi

if [ -n "$previous_ai" ] && [ "$previous_ai" != "$AI_IMAGE" ]; then
  echo "이전 backend와 맞추기 위해 AI도 이전 이미지($previous_ai)로 되돌립니다." >&2
  if ! { AI_IMAGE="$previous_ai" compose up -d --no-deps ai &&
         bash "$here/wait-container-healthy.sh" "$(compose ps -q ai)" 180; }; then
    echo "이전 AI로 되돌리기에 실패했습니다. 오리기 기능을 수동으로 확인해 주세요." >&2
  fi
fi
exit 1
