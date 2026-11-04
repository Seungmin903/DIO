#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
guard="$script_dir/assert-shared-db-migrations.sh"
workspace="$(mktemp -d)"
trap 'rm -rf "$workspace"' EXIT

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
}

init_repo
"$guard" develop HEAD

printf '%s\n' release > backend/src/main/resources/db/migration/V2__release.sql
git add . && git commit -qm release
if "$guard" develop HEAD; then
  echo "release-only migration was not blocked" >&2
  exit 1
fi

init_repo
if "$guard" missing-ref HEAD; then
  echo "missing develop ref was not reported" >&2
  exit 1
fi
