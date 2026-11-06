#!/usr/bin/env sh
# remote-assets-dist/ 를 에셋 버킷에 올린다. 먼저 pnpm assets:remote 로 만든다.
#   sh scripts/upload-remote-assets.sh <버킷> [접두사=static-assets]
#   또는 환경변수 ASSET_S3_BUCKET · ASSET_S3_PREFIX · REMOTE_ASSETS_DIST(업로드 폴더) 로 지정한다(CI).
# 객체 키에 내용 해시가 들어 있어 덮어쓰지 않으며, 지우지도 않는다(--delete 없음: 구버전 앱이 옛 키를 계속 쓴다).
# 필요한 권한: <접두사>/* 에 s3:PutObject · s3:GetObject, 버킷에 s3:ListBucket(접두사 제한).
#
# 안전장치: 지금 올라가 있는 catalog.json 과 비교해 이미 공개한 항목이 빠지면 멈춘다(scripts/compare-remote-catalog.mjs).
#   node 가 없는 곳(CI 의 aws-cli 컨테이너)에서는 미리 비교한 뒤 REMOTE_CATALOG_COMPARED=1 로 실행한다.
set -eu
BUCKET="${1:-${ASSET_S3_BUCKET:-}}"
PREFIX="${2:-${ASSET_S3_PREFIX:-static-assets}}"
[ -n "$BUCKET" ] || { echo "버킷 이름이 필요합니다(인자 또는 ASSET_S3_BUCKET)." >&2; exit 1; }
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
DIST="${REMOTE_ASSETS_DIST:-$SCRIPTS/../remote-assets-dist}"
[ -f "$DIST/catalog.json" ] || { echo "$DIST/catalog.json 이 없습니다. pnpm assets:remote 를 먼저 실행하세요." >&2; exit 1; }

if [ "${REMOTE_CATALOG_COMPARED:-}" != "1" ]; then
  command -v node >/dev/null 2>&1 || { echo "목록 비교에 node 가 필요합니다(또는 미리 비교하고 REMOTE_CATALOG_COMPARED=1)." >&2; exit 1; }
  PREVIOUS="$(mktemp)"
  trap 'rm -f "$PREVIOUS"' EXIT
  sh "$SCRIPTS/fetch-remote-catalog.sh" "$PREVIOUS" "$BUCKET" "$PREFIX"
  node "$SCRIPTS/compare-remote-catalog.mjs" "$PREVIOUS" "$DIST/catalog.json"
fi

IMMUTABLE="public, max-age=31536000, immutable"
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --only-show-errors --exclude "*" --include "*.svg" --content-type "image/svg+xml" --cache-control "$IMMUTABLE"
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --only-show-errors --exclude "*" --include "*.ttf" --content-type "font/ttf" --cache-control "$IMMUTABLE"
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --only-show-errors --exclude "*" --include "*.otf" --content-type "font/otf" --cache-control "$IMMUTABLE"
# 스티커 팩 JSON(이름에 해시 포함)
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --only-show-errors --exclude "*" --include "*.json" --exclude "catalog.json" --content-type "application/json; charset=utf-8" --cache-control "$IMMUTABLE"
# 라이선스 파일은 해시 없는 고정 경로라 짧게 캐시한다
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --only-show-errors --exclude "*" --include "*.txt" --include "catalog/fonts/*/LICENSE" --content-type "text/plain; charset=utf-8" --cache-control "public, max-age=300"
# 목록은 맨 마지막에 올린다: 앱이 새 목록을 받았을 때 그 안의 파일이 모두 올라가 있어야 한다.
# 앱은 켜질 때마다 확인하므로 짧게 캐시한다(CloudFront 도 1분 안에 새 목록을 준다)
aws s3 cp "$DIST/catalog.json" "s3://$BUCKET/$PREFIX/catalog.json" --only-show-errors --content-type "application/json; charset=utf-8" --cache-control "public, max-age=60"
echo "업로드 완료: s3://$BUCKET/$PREFIX/"
