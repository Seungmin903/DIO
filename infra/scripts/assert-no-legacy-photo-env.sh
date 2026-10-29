#!/usr/bin/env bash
# 프로필 사진 저장소는 MEDIA_STORAGE·MEDIA_S3_BUCKET·MEDIA_S3_REGION만 읽는다.
# 옛 SIGNUP_PHOTO_* 저장소 변수가 env 파일에 남아 있으면 조용히 무시되므로, 배포 전에 실패시켜 정리하게 한다.
set -euo pipefail

env_file="${1:?usage: $0 <env-file>}"
legacy="$(grep -oE '^(SIGNUP_PHOTO_STORAGE|SIGNUP_PHOTO_S3_BUCKET|SIGNUP_PHOTO_S3_REGION)=' "$env_file" | tr -d '=' || true)"
if [ -n "$legacy" ]; then
  echo "Legacy profile photo storage variables are no longer read: $(echo $legacy)" >&2
  echo "Move the values to MEDIA_STORAGE/MEDIA_S3_BUCKET/MEDIA_S3_REGION and remove them from $env_file." >&2
  exit 1
fi
