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
# 스티커 팩 JSON(이름에 해시 포함)
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --exclude "*" --include "*.json" --exclude "catalog.json" --content-type "application/json; charset=utf-8" --cache-control "$IMMUTABLE"
# 라이선스 파일은 해시 없는 고정 경로라 짧게 캐시한다
aws s3 sync "$DIST" "s3://$BUCKET/$PREFIX/" --exclude "*" --include "*.txt" --include "catalog/fonts/*/LICENSE" --content-type "text/plain; charset=utf-8" --cache-control "public, max-age=300"
# 목록은 맨 마지막에 올린다: 앱이 새 목록을 받았을 때 그 안의 파일이 모두 올라가 있어야 한다.
# 앱은 켜질 때마다 확인하므로 짧게 캐시한다(CloudFront 도 1분 안에 새 목록을 준다)
if [ -f "$DIST/catalog.json" ]; then
  aws s3 cp "$DIST/catalog.json" "s3://$BUCKET/$PREFIX/catalog.json" --content-type "application/json; charset=utf-8" --cache-control "public, max-age=60"
fi
echo "업로드 완료: s3://$BUCKET/$PREFIX/"
