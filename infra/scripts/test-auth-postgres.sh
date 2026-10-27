#!/usr/bin/env bash
set -euo pipefail

: "${CI_PROJECT_DIR:?CI_PROJECT_DIR is required}"
: "${CI_JOB_ID:?CI_JOB_ID is required}"
pg_name="dio-auth-test-${CI_JOB_ID}"
test_password="$(cat /proc/sys/kernel/random/uuid)"
cleanup() { docker rm -f -v "$pg_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# 포트를 호스트에 공개하지 않는 폐기용 DB. 실제 dev/prod DB와 접속 정보·볼륨을 공유하지 않는다.
docker run -d --name "$pg_name" --label dio.purpose=auth-ci-test \
  -e POSTGRES_DB=auth_ci -e POSTGRES_PASSWORD="$test_password" postgres:17 >/dev/null
ready=false
for ((i=0; i<30; i++)); do
  if docker exec "$pg_name" pg_isready -h 127.0.0.1 -U postgres -d auth_ci >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
if [ "$ready" != true ]; then echo "Isolated PostgreSQL did not become ready" >&2; exit 1; fi
docker exec "$pg_name" psql -U postgres -d auth_ci -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dio_reset_qa' >/dev/null

# 테스트 JVM만 이 DB의 네트워크 네임스페이스를 공유하므로 URL은 루프백으로 유지한다.
docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_name" \
  -e GRADLE_USER_HOME=/tmp/gradle -e DIO_AUTH_SCHEMA_TEST=true \
  -e DIO_AUTH_SCHEMA_TEST_URL=jdbc:postgresql://127.0.0.1:5432/auth_ci \
  -e DIO_AUTH_SCHEMA_TEST_PASSWORD="$test_password" \
  -e DIO_RESET_POSTGRES_URL=jdbc:postgresql://127.0.0.1:5432/dio_reset_qa \
  -e DIO_RESET_POSTGRES_PASSWORD="$test_password" \
  -v "$CI_PROJECT_DIR/backend:/workspace/backend" \
  -v "$CI_PROJECT_DIR/infra:/workspace/infra:ro" \
  -v "$CI_PROJECT_DIR/.gitlab-ci.yml:/workspace/.gitlab-ci.yml:ro" \
  -w /workspace/backend eclipse-temurin:17-jdk sh ./gradlew authPostgresTest --no-daemon
