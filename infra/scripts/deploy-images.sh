#!/usr/bin/env bash
# 운영 배포 롤백 스크립트가 함께 쓰는 이미지 도우미. source로 불러 쓴다.
# 롤백 기준은 "지금 돌고 있는 이미지"가 아니라 마지막으로 배포 전체가 성공한 이미지(<저장소>:prod-last-good)다.
# 같은 커밋으로 재시도해도(이미지 태그가 같아도) 직전 정상 버전으로 되돌릴 수 있다.

# dio-backend:prod-abc123 → dio-backend:prod-last-good
last_good_of() { printf '%s:prod-last-good' "${1%:*}"; }

image_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }

# 되돌릴 대상: last-good 이미지가 있고 새 이미지와 내용이 다를 때만 그 태그를 출력한다.
rollback_target() {
  local target new_id old_id
  target="$(last_good_of "$1")"
  old_id="$(image_id "$target")"
  new_id="$(image_id "$1")"
  [ -n "$old_id" ] && [ "$old_id" != "$new_id" ] && printf '%s' "$target"
  return 0
}

# 배포 전체가 성공한 뒤 호출한다.
mark_last_good() { docker tag "$1" "$(last_good_of "$1")"; }
