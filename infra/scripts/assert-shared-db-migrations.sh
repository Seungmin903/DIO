#!/usr/bin/env bash
set -euo pipefail

develop_ref="${1:-origin/develop}"
release_ref="${2:-HEAD}"
migration_path="backend/src/main/resources/db/migration"

if ! git rev-parse --verify --quiet "${develop_ref}^{commit}" >/dev/null; then
  echo "Cannot resolve $develop_ref for the shared-DB migration check." >&2
  exit 2
fi

status=0
git diff --quiet "$develop_ref" "$release_ref" -- "$migration_path" || status=$?
if [ "$status" -eq 1 ]; then
  echo "Release and develop have different migrations; shared-DB verification is blocked." >&2
  exit 1
fi
if [ "$status" -ne 0 ]; then
  echo "Could not compare release and develop migrations (git exit $status)." >&2
  exit "$status"
fi
