#!/usr/bin/env bash
# MR 변경분을 Claude Code로 리뷰하고 결과를 MR 노트로 남긴다.
# Claude는 도구 없이 격리된 컨테이너에서 diff 텍스트만 받는다. GitLab 토큰은 컨테이너에 넘기지 않는다.
set -euo pipefail

: "${CI_MERGE_REQUEST_IID:?MR 파이프라인에서만 실행합니다}"

if [ -z "${ANTHROPIC_API_KEY:-}" ] || [ -z "${GITLAB_REVIEW_TOKEN:-}" ]; then
  echo "ANTHROPIC_API_KEY 또는 GITLAB_REVIEW_TOKEN 변수가 없어 리뷰를 건너뜁니다."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX_DIFF_BYTES="${MAX_DIFF_BYTES:-200000}"
CLAUDE_CODE_VERSION="$(sed -n 's/^ARG CLAUDE_CODE_VERSION=//p' "$SCRIPT_DIR/Dockerfile")"
IMAGE="dio-claude-review:${CLAUDE_CODE_VERSION}"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# 비밀값이 담길 수 있는 파일과 리뷰 가치가 낮은 생성물·대용량 파일은 Claude에 보내지 않는다.
git diff --no-color --no-ext-diff "$CI_MERGE_REQUEST_DIFF_BASE_SHA" HEAD -- . \
  ':(exclude,glob)**/.env*' \
  ':(exclude,glob)**/*.env' \
  ':(exclude,glob)**/*.pem' \
  ':(exclude,glob)**/*.key' \
  ':(exclude,glob)**/*.p12' \
  ':(exclude,glob)**/*.jks' \
  ':(exclude,glob)**/*.keystore' \
  ':(exclude,glob)**/google-services.json' \
  ':(exclude,glob)**/GoogleService-Info.plist' \
  ':(exclude,glob)**/pnpm-lock.yaml' \
  ':(exclude,glob)**/package-lock.json' \
  ':(exclude,glob)**/*.svg' \
  ':(exclude,glob)frontend/dist/**' \
  > "$WORK_DIR/full.diff"

if [ ! -s "$WORK_DIR/full.diff" ]; then
  echo "리뷰할 변경이 없습니다."
  exit 0
fi

head -c "$MAX_DIFF_BYTES" "$WORK_DIR/full.diff" > "$WORK_DIR/diff.patch"
cp "$SCRIPT_DIR/prompt.md" "$WORK_DIR/prompt.md"

docker build --quiet --tag "$IMAGE" "$SCRIPT_DIR" > /dev/null

if docker run --rm \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --memory 1g \
  --pids-limit 256 \
  -e HOME=/tmp \
  -e ANTHROPIC_API_KEY \
  -v "$WORK_DIR:/review:ro" \
  "$IMAGE" \
  sh -c 'claude -p "$(cat /review/prompt.md)" --tools "" --strict-mcp-config --no-session-persistence < /review/diff.patch' \
  > "$WORK_DIR/review.md"
then
  :
else
  CLAUDE_EXIT_CODE=$?
  echo "Claude Code 호출 실패: exit ${CLAUDE_EXIT_CODE}" >&2
  sed -n '1,20p' "$WORK_DIR/review.md" >&2
  exit "$CLAUDE_EXIT_CODE"
fi

if [ ! -s "$WORK_DIR/review.md" ]; then
  echo "Claude 응답이 비어 있습니다." >&2
  exit 1
fi

{
  echo "<!-- dio-ai-review -->"
  echo "### 🤖 AI 코드 리뷰"
  echo
  echo "> \`${CI_COMMIT_SHORT_SHA}\` 기준 Claude Code 자동 리뷰입니다. 참고용이며 승인 조건이 아닙니다."
  if [ "$(wc -c < "$WORK_DIR/full.diff")" -gt "$MAX_DIFF_BYTES" ]; then
    echo ">"
    echo "> ⚠️ 변경분이 커서 앞 ${MAX_DIFF_BYTES}바이트만 리뷰했습니다."
  fi
  echo
  cat "$WORK_DIR/review.md"
} > "$WORK_DIR/note.md"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --network none \
  -v "$WORK_DIR:/review:ro" \
  "$IMAGE" \
  node -e 'process.stdout.write(JSON.stringify({ body: require("fs").readFileSync("/review/note.md", "utf8") }))' \
  > "$WORK_DIR/note.json"

# 토큰이 프로세스 인자에 드러나지 않도록 헤더를 파일로 넘긴다.
printf 'PRIVATE-TOKEN: %s\n' "$GITLAB_REVIEW_TOKEN" > "$WORK_DIR/auth.header"

curl --fail-with-body --silent --show-error \
  --request POST \
  --header @"$WORK_DIR/auth.header" \
  --header "Content-Type: application/json" \
  --data @"$WORK_DIR/note.json" \
  "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes" \
  > /dev/null

echo "MR !${CI_MERGE_REQUEST_IID}에 리뷰를 남겼습니다."
