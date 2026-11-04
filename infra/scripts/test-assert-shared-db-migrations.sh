#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
guard="$script_dir/assert-shared-db-migrations.sh"
workspace="$(mktemp -d)"
trap 'rm -rf "$workspace"' EXIT

expect_status() {
  expected="$1"
  shift
  status=0
  "$@" || status=$?
  if [ "$status" -ne "$expected" ]; then
    echo "expected exit $expected, got $status" >&2
    exit 1
  fi
}

init_repo() {
  rm -rf "$workspace/repo"
  git init -q "$workspace/repo"
  cd "$workspace/repo"
  git config user.email "ci@example.invalid"
  git config user.name "CI"
  mkdir -p backend/src/main/resources/db/migration
  printf '%s\n' base > backend/src/main/resources/db/migration/V1__base.sql
  git add . && git commit -qm base
  git branch develop
  base_ref="$(git branch --show-current)"
}

init_repo
"$guard" develop HEAD

printf '%s\n' release > backend/src/main/resources/db/migration/V2__release.sql
git add . && git commit -qm release
expect_status 1 "$guard" develop HEAD

init_repo
git switch -q develop
printf '%s\n' develop > backend/src/main/resources/db/migration/V2__develop.sql
git add . && git commit -qm develop
git switch -q "$base_ref"
expect_status 1 "$guard" develop HEAD

init_repo
expect_status 2 "$guard" missing-ref HEAD
