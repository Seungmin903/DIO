#!/usr/bin/env bash
set -euo pipefail
: "${CI_PROJECT_DIR:?CI_PROJECT_DIR is required}"
: "${CI_JOB_ID:?CI_JOB_ID is required}"
[[ "$CI_JOB_ID" =~ ^[0-9]+$ ]] || { echo 'invalid CI_JOB_ID' >&2; exit 2; }
pg_name="dio-push-test-${CI_JOB_ID}"
nonce="$(tr -d '-' </proc/sys/kernel/random/uuid)"
test_password="$(cat /proc/sys/kernel/random/uuid)"
db="pushqa_${nonce:0:12}"
created=false
cleanup() { if [ "$created" = true ]; then docker rm -f -v "$pg_name" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Fresh container and isolated network namespace; no host port, volume or deployment env.
docker run -d --name "$pg_name" --label dio.purpose=push-ci-test \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_DB="$db" -e POSTGRES_PASSWORD="$test_password" postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off >/dev/null
created=true
ready=false
for ((i=0; i<120; i++)); do
  if docker exec "$pg_name" pg_isready -h 127.0.0.1 -U postgres -d "$db" >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.5
done
if [ "$ready" != true ]; then echo 'Disposable PostgreSQL did not become ready' >&2; exit 1; fi
# Marker is outside public so Flyway still initializes an empty application schema.
docker exec "$pg_name" psql -U postgres -d "$db" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA push_test_guard; CREATE TABLE push_test_guard.marker(nonce text PRIMARY KEY); INSERT INTO push_test_guard.marker VALUES ('$nonce');" >/dev/null
docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_name" \
  -e GRADLE_USER_HOME=/workspace/backend/.gradle \
  -e DIO_PUSH_TEST_DISPOSABLE=true -e DIO_PUSH_GUARD="$nonce" \
  -e DIO_PUSH_URL="jdbc:postgresql://127.0.0.1:5432/$db" -e DIO_PUSH_PASSWORD="$test_password" \
  -v "$CI_PROJECT_DIR/backend:/workspace/backend" -w /workspace/backend \
  eclipse-temurin:17-jdk sh ./gradlew pushPostgresTest --no-daemon
