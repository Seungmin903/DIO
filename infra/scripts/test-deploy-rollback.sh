#!/usr/bin/env bash
# 운영 배포 롤백 스크립트(up-ai-with-rollback.sh · up-backend-with-rollback.sh · wait-container-healthy.sh)의 분기를
# 테스트용 작은 이미지로 실제 docker compose에서 확인한다. 사용: bash infra/scripts/test-deploy-rollback.sh (Docker 필요)
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
project="dio-rollback-test"
port="${TEST_BACKEND_PORT:-18082}"
health="http://127.0.0.1:$port/actuator/health"
failures=0

cat > "$work/compose.yml" <<EOF
services:
  backend:
    image: \${BACKEND_IMAGE:?BACKEND_IMAGE is required}
    ports: ["127.0.0.1:$port:8080"]
  ai:
    image: \${AI_IMAGE:?AI_IMAGE is required}
EOF
: > "$work/test.env"

compose() { BACKEND_IMAGE="${BACKEND_IMAGE:-x}" AI_IMAGE="${AI_IMAGE:-x}" docker compose --project-name "$project" --env-file "$work/test.env" -f "$work/compose.yml" "$@"; }
running() { local id; id="$(compose ps -q "$1")"; [ -n "$id" ] && docker inspect -f '{{.Config.Image}}' "$id" 2>/dev/null; }
build() { printf '%b' "$2" | docker build -q -t "$1" - >/dev/null; }

reset() { # 이전 실행이 남긴 컨테이너·이미지(특히 prod-last-good 태그)를 지운다
  compose down -t 0 >/dev/null 2>&1
  docker rmi -f dio-test-ai:v1 dio-test-ai:v2 dio-test-ai:bad dio-test-ai:slow dio-test-ai:prod-last-good \
    dio-test-be:good dio-test-be:bad dio-test-be:prod-last-good >/dev/null 2>&1
}
trap 'reset; rm -rf "$work"' EXIT
reset

hc='HEALTHCHECK --interval=1s --start-period=1s --retries=1'
build dio-test-ai:v1   "FROM alpine:3.20\nLABEL v=1\n$hc CMD true\nCMD [\"sleep\",\"600\"]\n"
build dio-test-ai:v2   "FROM alpine:3.20\nLABEL v=2\n$hc CMD true\nCMD [\"sleep\",\"600\"]\n"
build dio-test-ai:bad  "FROM alpine:3.20\nLABEL v=bad\n$hc CMD false\nCMD [\"sleep\",\"600\"]\n"
# 처음 몇 초는 unhealthy였다가 healthy로 돌아오는 느린 모델 로딩
build dio-test-ai:slow "FROM alpine:3.20\nLABEL v=slow\n$hc CMD test -f /tmp/ok\nCMD [\"sh\",\"-c\",\"sleep 6; touch /tmp/ok; sleep 600\"]\n"
build dio-test-be:good 'FROM busybox\nRUN mkdir -p /www/actuator && echo ok > /www/actuator/health\nCMD ["httpd","-f","-p","8080","-h","/www"]\n'
build dio-test-be:bad  'FROM busybox\nCMD ["sleep","600"]\n'

deploy() {
  BACKEND_IMAGE="$1" AI_IMAGE="$2" bash "$here/up-ai-with-rollback.sh" "$project" "$work/test.env" "$work/compose.yml" 20 >"$work/out" 2>&1 &&
  BACKEND_IMAGE="$1" AI_IMAGE="$2" AI_WAIT_SECONDS=20 HEALTH_RETRIES=4 \
    bash "$here/up-backend-with-rollback.sh" "$project" "$work/test.env" "$work/compose.yml" "$health" >>"$work/out" 2>&1
}
check() { # 이름 기대exit 기대backend 기대ai [출력에 있어야 할 문구]
  local rc="$1" name="$2" want_rc="$3" want_be="$4" want_ai="$5" want_text="${6:-}" be ai
  be="$(running backend)"; ai="$(running ai)"
  if [ "$rc" = "$want_rc" ] && [ "$be" = "$want_be" ] && [ "$ai" = "$want_ai" ] &&
     { [ -z "$want_text" ] || grep -q "$want_text" "$work/out"; }; then
    echo "ok   $name"
  else
    echo "FAIL $name: exit=$rc(기대 $want_rc) backend=$be(기대 $want_be) ai=$ai(기대 $want_ai)"; sed 's/^/     /' "$work/out" | grep -v '^\s*$' | tail -5
    failures=$((failures + 1))
  fi
}

deploy dio-test-be:bad dio-test-ai:v1; rc=$?
check "$rc" "첫 배포 backend 실패: 정상 기록이 없어 아무것도 되돌리지 않음" 1 dio-test-be:bad dio-test-ai:v1 "되돌릴 정상 배포 기록이 없어"
compose down -t 0 >/dev/null 2>&1

deploy dio-test-be:good dio-test-ai:v1; rc=$?
check "$rc" "첫 정상 배포" 0 dio-test-be:good dio-test-ai:v1

before="$(compose ps -q ai)"; deploy dio-test-be:good dio-test-ai:v1; rc=$?
check "$rc" "같은 이미지 재배포" 0 dio-test-be:good dio-test-ai:v1
[ "$before" = "$(compose ps -q ai)" ] && echo "ok   같은 이미지면 AI 컨테이너를 재생성하지 않음" || { echo "FAIL AI 컨테이너가 재생성됨"; failures=$((failures + 1)); }

deploy dio-test-be:good dio-test-ai:bad; rc=$?
check "$rc" "새 AI unhealthy: AI만 마지막 정상으로 되돌림" 1 dio-test-be:good dio-test-ai:prod-last-good "AI를 되돌렸습니다"

deploy dio-test-be:bad dio-test-ai:v2; rc=$?
check "$rc" "AI는 정상, backend 실패: backend·AI 함께 되돌림" 1 dio-test-be:prod-last-good dio-test-ai:prod-last-good "backend를 되돌렸고 정상 응답을 확인했습니다"

deploy dio-test-be:bad dio-test-ai:v2; rc=$?
check "$rc" "같은 커밋 재시도: 다시 마지막 정상으로 되돌림" 1 dio-test-be:prod-last-good dio-test-ai:prod-last-good "backend를 되돌렸고 정상 응답을 확인했습니다"

deploy dio-test-be:good dio-test-ai:slow; rc=$?
check "$rc" "느린 AI(잠시 unhealthy 후 healthy): 제한 시간 안이면 성공" 0 dio-test-be:good dio-test-ai:slow

if [ "$failures" -gt 0 ]; then echo "실패 $failures건"; exit 1; fi
echo "모두 통과"
