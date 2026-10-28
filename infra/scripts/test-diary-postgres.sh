#!/usr/bin/env bash
set -euo pipefail

: "${CI_PROJECT_DIR:?CI_PROJECT_DIR is required}"
: "${CI_JOB_ID:?CI_JOB_ID is required}"
[[ "$CI_JOB_ID" =~ ^[0-9]+$ ]] || { echo "CI_JOB_ID must be numeric" >&2; exit 1; }
pg_name="dio-diary-test-${CI_JOB_ID}"
pg_id=''
test_password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() { if [ -n "$pg_id" ]; then docker rm -f -v "$pg_id" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# No host port, shared volume, env file or existing database is used.
# Track the created container ID so a name collision can never remove someone else's container.
pg_id="$(docker run -d --name "$pg_name" --label dio.purpose=diary-ci-test \
  -e POSTGRES_DB=dio_diary_create_qa -e POSTGRES_PASSWORD="$test_password" postgres:17)"
ready=false
for ((i=0; i<30; i++)); do
  if docker exec "$pg_id" pg_isready -h 127.0.0.1 -U postgres -d dio_diary_create_qa >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then echo "Isolated diary PostgreSQL did not become ready" >&2; exit 1; fi

docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_id" \
  -e GRADLE_USER_HOME=/tmp/gradle -e DIO_DIARY_CREATE_PG_QA=true \
  -e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_diary_create_qa \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$test_password" \
  -v "$CI_PROJECT_DIR/backend:/workspace/backend" \
  -w /workspace/backend eclipse-temurin:17-jdk sh ./gradlew diaryPostgresTest --no-daemon
