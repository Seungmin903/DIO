#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd -P)"
fixture_parent="$(cd "$script_dir/../../backend/build" && pwd -P)"
fixture="$(mktemp -d "$fixture_parent/member-icu-test.XXXXXX")"
cleanup() {
  case "$fixture" in "$fixture_parent"/member-icu-test.*) rm -rf -- "$fixture" ;; *) exit 99 ;; esac
}
trap cleanup EXIT
cat > "$fixture/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  inspect) [ "$ICU_TEST_CASE" != missing ]; exit ;;
  exec) ;;
  *) exit 99 ;;
esac
if [ "$ICU_TEST_CASE" = defaults ]; then
  shift 2
  exec env -u POSTGRES_USER -u POSTGRES_DB -u POSTGRES_PASSWORD "$@"
fi
for arg; do query="$arg"; done
[[ "$query" == "BEGIN READ ONLY;"* && "$query" == *"ROLLBACK;" ]] || exit 99
if [ "$ICU_TEST_CASE" = query_error ]; then exit 1; fi
if [[ "$query" == *pg_collation* ]]; then
  case "$ICU_TEST_CASE" in absent) echo f ;; unexpected) echo invalid ;; *) echo t ;; esac
else
  case "$ICU_TEST_CASE" in fold_error) exit 1 ;; fold_false) echo f ;; *) echo t ;; esac
fi
MOCK
cat > "$fixture/psql" <<'MOCKSQL'
#!/usr/bin/env bash
set -euo pipefail
user=; database=
while [ "$#" -gt 0 ]; do
  case "$1" in -U) shift; user="$1" ;; -d) shift; database="$1" ;; esac
  shift
done
[ "$user" = postgres ] && [ "$database" = postgres ] && [ "$PGPASSWORD" = "" ] || exit 99
echo t
MOCKSQL
chmod +x "$fixture/docker" "$fixture/psql"
export PATH="$fixture:$PATH"
for scenario in supported defaults absent missing query_error unexpected fold_error fold_false; do
  export ICU_TEST_CASE="$scenario"
  expected=3
  case "$scenario" in supported|defaults) expected=0 ;; absent) expected=2 ;; esac
  result=0
  bash "$script_dir/check-member-list-icu.sh" qa-fixture >"$fixture/output" 2>&1 || result=$?
  if [ "$result" -ne "$expected" ]; then echo "FAIL: $scenario"; exit 1; fi
  echo "PASS: $scenario"
done
