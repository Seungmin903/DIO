#!/usr/bin/env bash
set -euo pipefail

: "${CI_PROJECT_DIR:?CI_PROJECT_DIR is required}"
: "${CI_JOB_ID:?CI_JOB_ID is required}"
suite="${1:-all}"
case "$suite" in
  auth|sharing|diary|lifecycle|all) ;;
  *) echo "usage: $0 [auth|sharing|diary|lifecycle|all]" >&2; exit 2 ;;
esac
pg_name="dio-auth-test-${CI_JOB_ID}"
test_password="$(cat /proc/sys/kernel/random/uuid)"
cleanup() { docker rm -f -v "$pg_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# 포트를 호스트에 공개하지 않는 폐기용 DB. 실제 dev/prod DB와 접속 정보·볼륨을 공유하지 않는다.
# 잡이 끝나면 버리는 DB라 메모리(tmpfs)에 두고 디스크 동기화를 끈다. 마이그레이션·DDL이 많은 테스트가 빨라진다.
docker run -d --name "$pg_name" --label dio.purpose=auth-ci-test \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_DB=auth_ci -e POSTGRES_PASSWORD="$test_password" postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off >/dev/null
ready=false
for ((i=0; i<120; i++)); do
  if docker exec "$pg_name" pg_isready -h 127.0.0.1 -U postgres -d auth_ci >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.5
done
if [ "$ready" != true ]; then echo "Isolated PostgreSQL did not become ready" >&2; exit 1; fi

if [ "$suite" = auth ] || [ "$suite" = all ]; then
  docker exec "$pg_name" psql -U postgres -d auth_ci -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dio_reset_qa' >/dev/null
  # 인증·비밀번호 재설정은 전용 auth/reset DB만 사용한다.
  docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_name" \
    -e GRADLE_USER_HOME=/workspace/backend/.gradle -e DIO_AUTH_SCHEMA_TEST=true \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$test_password" \
    -e DIO_AUTH_SCHEMA_TEST_URL=jdbc:postgresql://127.0.0.1:5432/auth_ci \
    -e DIO_AUTH_SCHEMA_TEST_PASSWORD="$test_password" \
    -e DIO_RESET_POSTGRES_URL=jdbc:postgresql://127.0.0.1:5432/dio_reset_qa \
    -e DIO_RESET_POSTGRES_PASSWORD="$test_password" \
    -v "$CI_PROJECT_DIR/backend:/workspace/backend" \
    -v "$CI_PROJECT_DIR/infra:/workspace/infra:ro" \
    -v "$CI_PROJECT_DIR/.gitlab-ci.yml:/workspace/.gitlab-ci.yml:ro" \
    -w /workspace/backend eclipse-temurin:17-jdk sh ./gradlew authPostgresTest --no-daemon
fi

if [ "$suite" = sharing ] || [ "$suite" = all ]; then
  docker exec "$pg_name" psql -U postgres -d auth_ci -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dio_sharing_qa' >/dev/null
  docker exec "$pg_name" psql -U postgres -d auth_ci -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dio_collaboration_qa' >/dev/null
  # 공유 권한·프로필·영구 삭제는 전용 sharing DB에서 검증한다.
  docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_name" \
    -e GRADLE_USER_HOME=/workspace/backend/.gradle \
    -e DIO_SHARING_POSTGRES_URL=jdbc:postgresql://127.0.0.1:5432/dio_sharing_qa \
    -e DIO_SHARING_POSTGRES_PASSWORD="$test_password" \
    -e DIO_COLLABORATION_POSTGRES_URL=jdbc:postgresql://127.0.0.1:5432/dio_collaboration_qa \
    -e DIO_COLLABORATION_POSTGRES_PASSWORD="$test_password" \
    -v "$CI_PROJECT_DIR/backend:/workspace/backend" \
    -w /workspace/backend eclipse-temurin:17-jdk sh ./gradlew sharingPostgresTest collaborationPostgresTest --no-daemon
fi

if [ "$suite" = diary ] || [ "$suite" = all ]; then
  bash "$CI_PROJECT_DIR/infra/scripts/check-member-list-icu.sh" "$pg_name"
  docker exec "$pg_name" psql -U postgres -d auth_ci -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dio_member_ci' >/dev/null
  # 생성·상세 메타데이터는 전용 member DB에서 실제 Flyway 스키마를 사용한다.
  docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_name" \
    -e GRADLE_USER_HOME=/workspace/backend/.gradle \
    -e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_member_ci \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$test_password" \
    -v "$CI_PROJECT_DIR/backend:/workspace/backend" \
    -v "$CI_PROJECT_DIR/docs:/workspace/docs:ro" \
    -w /workspace/backend eclipse-temurin:17-jdk sh ./gradlew postgresMemberDiaryCreationTest postgresDiaryDetailTest --no-daemon

  docker exec "$pg_name" psql -U postgres -d auth_ci -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dio_member_contract_qa' >/dev/null
  # HTTP 계약은 Spring 컨텍스트를 별도의 폐기용 DB에서 기동한다.
  docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_name" \
    -e GRADLE_USER_HOME=/workspace/backend/.gradle \
    -e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_member_contract_qa \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$test_password" \
    -v "$CI_PROJECT_DIR/backend:/workspace/backend" \
    -w /workspace/backend eclipse-temurin:17-jdk sh ./gradlew postgresMemberDiaryHttpTest --no-daemon
fi

if [ "$suite" = lifecycle ] || [ "$suite" = all ]; then
  docker exec "$pg_name" psql -U postgres -d auth_ci -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dio_trash_qa' >/dev/null
  # 휴지통·영구 삭제는 생성/상세 테스트 DB와 분리한다.
  docker run --rm --user "$(id -u):$(id -g)" --network "container:$pg_name" \
    -e GRADLE_USER_HOME=/workspace/backend/.gradle -e DIO_LIST_QUERY_PG=true \
    -e DB_URL=jdbc:postgresql://127.0.0.1:5432/dio_trash_qa \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$test_password" \
    -v "$CI_PROJECT_DIR/backend:/workspace/backend" \
    -w /workspace/backend eclipse-temurin:17-jdk sh ./gradlew postgresDiaryTrashTest postgresDiaryPurgeTest --no-daemon
fi
