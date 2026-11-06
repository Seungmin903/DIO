#!/usr/bin/env sh
# 지금 에셋 버킷에 올라가 있는 catalog.json 을 받는다(업로드 전 비교용).
#   sh scripts/fetch-remote-catalog.sh <저장할 파일> [버킷] [접두사=static-assets]
#   버킷 · 접두사는 인자 또는 ASSET_S3_BUCKET · ASSET_S3_PREFIX.
# 처음 올리는 버킷이라 목록이 없으면 빈 파일을 만든다(비교 건너뜀). 권한 · 네트워크 오류는 실패한다.
set -eu
OUT="${1:?저장할 파일 경로가 필요합니다}"
BUCKET="${2:-${ASSET_S3_BUCKET:-}}"
PREFIX="${3:-${ASSET_S3_PREFIX:-static-assets}}"
[ -n "$BUCKET" ] || { echo "버킷 이름이 필요합니다(인자 또는 ASSET_S3_BUCKET)." >&2; exit 1; }
if aws s3 cp "s3://$BUCKET/$PREFIX/catalog.json" "$OUT" --only-show-errors 2>/dev/null; then exit 0; fi
if aws s3api head-object --bucket "$BUCKET" --key "$PREFIX/catalog.json" >/dev/null 2>&1; then
  echo "지금 올라간 catalog.json 을 읽지 못했습니다(권한 확인)." >&2
  exit 1
fi
# 없는 것과 권한 없음을 구분한다: 접두사 목록도 못 읽으면 권한 · 네트워크 문제로 본다
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/" --max-items 1 >/dev/null
: > "$OUT"
echo "지금 올라간 catalog.json 이 없습니다(처음 올림)."
