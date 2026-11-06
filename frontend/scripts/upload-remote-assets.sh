#!/usr/bin/env sh
# remote-assets-dist/ 를 에셋 버킷에 올린다. 먼저 pnpm assets:remote 로 만든다.
#   sh scripts/upload-remote-assets.sh <버킷> [접두사=static-assets]
# 객체 키에 내용 해시가 들어 있어 덮어쓰지 않으며, 지우지도 않는다(--delete 없음: 구버전 앱이 옛 키를 계속 쓴다).
# 필요한 권한: <접두사>/* 에 s3:PutObject, 버킷에 s3:ListBucket(접두사 제한).
set -eu
BUCKET="${1:?버킷 이름이 필요합니다}"
PREFIX="${2:-static-assets}"
DIST="$(dirname "$0")/../remote-assets-dist"
[ -d "$DIST" ] || { echo "remote-assets-dist 가 없습니다. pnpm assets:remote 를 먼저 실행하세요." >&2; exit 1; }

IMMUTABLE="public, max-age=31536000, immutable"
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --exclude "*" --include "*.svg" --content-type "image/svg+xml" --cache-control "$IMMUTABLE"
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --exclude "*" --include "*.ttf" --content-type "font/ttf" --cache-control "$IMMUTABLE"
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --exclude "*" --include "*.otf" --content-type "font/otf" --cache-control "$IMMUTABLE"
# 라이선스 파일은 해시 없는 고정 경로라 짧게 캐시한다
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --exclude "*" --include "*.txt" --content-type "text/plain; charset=utf-8" --cache-control "public, max-age=300"
echo "업로드 완료: s3://$BUCKET/$PREFIX/"
