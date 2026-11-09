#!/usr/bin/env bash
# AI 컨테이너를 $AI_IMAGE로 올리고 healthy를 기다린다. 실패하면 마지막 정상 배포 AI(<저장소>:prod-last-good)로 되돌리고 실패로 끝난다.
# 사용: AI_IMAGE=<새 이미지> up-ai-with-rollback.sh <compose 프로젝트> <env 파일> <compose 파일> [제한 초, 기본 180]
# - 이미지·설정이 같으면 compose가 기존 컨테이너를 그대로 둔다(--force-recreate를 쓰지 않는다).
# - 처음 배포라 정상 배포 기록이 없거나 같은 이미지였다면 되돌리지 않고 실패만 알린다.
set -u
: "${AI_IMAGE:?AI_IMAGE is required}"
project="${1:?compose project is required}"
env_file="${2:?env file is required}"
compose_file="${3:?compose file is required}"
limit="${4:-180}"
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy-images.sh
. "$here/deploy-images.sh"

compose() { docker compose --project-name "$project" --env-file "$env_file" -f "$compose_file" "$@"; }

target="$(rollback_target "$AI_IMAGE")"

if compose up -d --no-deps ai && bash "$here/wait-container-healthy.sh" "$(compose ps -q ai)" "$limit"; then
  exit 0
fi

if [ -z "$target" ]; then
  echo "새 AI($AI_IMAGE)가 healthy가 되지 않았습니다. 되돌릴 정상 배포 기록이 없어 오리기 기능은 다음 성공 배포 전까지 동작하지 않습니다." >&2
  exit 1
fi

echo "새 AI($AI_IMAGE)가 healthy가 되지 않아 마지막 정상 배포 AI($target)로 되돌립니다. backend는 교체하지 않습니다." >&2
if AI_IMAGE="$target" compose up -d --no-deps ai &&
   bash "$here/wait-container-healthy.sh" "$(compose ps -q ai)" "$limit"; then
  echo "AI를 되돌렸습니다." >&2
else
  echo "AI 되돌리기도 실패했습니다. 오리기 기능을 수동으로 확인해 주세요." >&2
fi
exit 1
