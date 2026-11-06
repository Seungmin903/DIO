#!/usr/bin/env sh
# 지금 에셋 버킷에 올라가 있는 catalog.json 을 받는다(업로드 전 비교용).
#   sh scripts/fetch-remote-catalog.sh <저장할 파일> [버킷] [접두사=static-assets]
#   버킷 · 접두사는 인자 또는 ASSET_S3_BUCKET · ASSET_S3_PREFIX.
#
# 목록이 정말 없을 때(처음 올림)만 빈 파일을 만든다. 있는데 못 받으면(권한 · 네트워크) 실패한다.
# 있는지는 키를 정확히 나열해서 판단한다. head-object 는 ListBucket 접두사 조건 때문에 없는 키도 403 으로 답할 수 있어
# '없음'과 '권한 없음'을 구분하지 못한다(업로드 IAM 은 static-assets/* 접두사에만 ListBucket 을 준다).
set -eu
OUT="${1:?저장할 파일 경로가 필요합니다}"
BUCKET="${2:-${ASSET_S3_BUCKET:-}}"
PREFIX="${3:-${ASSET_S3_PREFIX:-static-assets}}"
[ -n "$BUCKET" ] || { echo "버킷 이름이 필요합니다(인자 또는 ASSET_S3_BUCKET)." >&2; exit 1; }
KEY="$PREFIX/catalog.json"

# 1) 있는지 확인. 나열 자체가 실패하면(권한 · 네트워크) 여기서 멈춘다
FOUND="$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$KEY" --query 'Contents[].Key' --output text)"
if ! printf '%s\n' "$FOUND" | tr '\t' '\n' | grep -Fqx "$KEY"; then
  : > "$OUT"
  echo "지금 올라간 catalog.json 이 없습니다(처음 올림)."
  exit 0
fi

# 2) 있으면 반드시 받아야 한다. 오류를 숨기지 않는다
if ! aws s3 cp "s3://$BUCKET/$KEY" "$OUT" --only-show-errors; then
  echo "지금 올라간 catalog.json 이 있는데 받지 못했습니다(권한 · 네트워크 확인). 비교 없이 올리지 않습니다." >&2
  exit 1
fi
if [ ! -s "$OUT" ]; then
  echo "지금 올라간 catalog.json 이 비어 있습니다. 비교 없이 올리지 않습니다." >&2
  exit 1
fi
