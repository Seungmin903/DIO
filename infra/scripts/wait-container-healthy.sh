#!/usr/bin/env bash
# 컨테이너가 healthy가 될 때까지 기다린다. 사용: wait-container-healthy.sh <컨테이너 ID> [제한 초, 기본 180]
# - ID가 비었거나, 이미지·compose에 healthcheck가 없거나, 컨테이너가 종료되면 기다리지 않고 바로 실패한다.
# - 실패하면 마지막 로그 200줄을 남긴다.
set -u
container="${1:-}"
limit="${2:-180}"

if [ -z "$container" ]; then
  echo "대상 컨테이너가 없습니다(compose ps 결과가 비어 있음)." >&2
  exit 1
fi

fail() {
  echo "$1" >&2
  docker logs --tail=200 "$container" || true
  exit 1
}

deadline=$((SECONDS + limit))
while :; do
  state="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null)" \
    || fail "컨테이너 상태를 읽지 못했습니다: $container"
  status="${state%% *}"
  health="${state##* }"
  case "$status" in
    exited|dead) fail "컨테이너가 종료되었습니다($status): $container" ;;
  esac
  case "$health" in
    healthy) exit 0 ;;
    none) fail "healthcheck가 정의되지 않은 컨테이너입니다: $container" ;;
    unhealthy) fail "컨테이너가 unhealthy입니다: $container" ;;
  esac
  [ "$SECONDS" -ge "$deadline" ] && fail "${limit}초 안에 healthy가 되지 않았습니다(현재 $status/$health): $container"
  sleep 3
done
