#!/usr/bin/env bash
# PostgreSQL 통합 테스트 묶음을 CI 잡 컨테이너 안에서 실행한다.
# DB는 잡의 services(postgres:17, 별칭 postgres)로 뜨는 폐기용 인스턴스다. 호스트 docker를 쓰지 않으므로
# MR이 이 스크립트를 바꿔도 배포 호스트의 컨테이너·환경 파일에 닿지 않는다(mr-sandbox 러너, infra/ci-runners.md).
set -euo pipefail

: "${CI_PROJECT_DIR:?CI_PROJECT_DIR is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required (job services variable)}"
suite="${1:-all}"
case "$suite" in
  auth|sharing|diary|lifecycle|all) ;;
  *) echo "usage: $0 [auth|sharing|diary|lifecycle|all]" >&2; exit 2 ;;
esac

pg_host="${DIO_TEST_PG_HOST:-postgres}"
test_password="$POSTGRES_PASSWORD"
export PGHOST="$pg_host" PGPORT=5432 PGUSER=postgres PGPASSWORD="$test_password" PGDATABASE="${POSTGRES_DB:-auth_ci}"
export GRADLE_USER_HOME="$CI_PROJECT_DIR/backend/.gradle"

if ! command -v psql >/dev/null 2>&1; then
  apt-get update -qq >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends postgresql-client >/dev/null
fi

ready=false
for ((i=0; i<120; i++)); do
  if pg_isready -q; then ready=true; break; fi
  sleep 0.5
done
if [ "$ready" != true ]; then echo "Isolated PostgreSQL did not become ready" >&2; exit 1; fi

create_db() { psql -X -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $1" >/dev/null; }

# 묶음마다 필요한 변수만 넘긴다. 잡 수준의 DB 접속 변수는 Gradle에 새지 않게 지운다.
clean_env=(env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE -u POSTGRES_DB -u POSTGRES_PASSWORD -u POSTGRES_USER)
cd "$CI_PROJECT_DIR/backend"

if [ "$suite" = auth ] || [ "$suite" = all ]; then
  create_db dio_reset_qa
  # 인증·비밀번호 재설정은 전용 auth/reset DB만 사용한다.
  "${clean_env[@]}" DIO_AUTH_SCHEMA_TEST=true \
    POSTGRES_USER=postgres POSTGRES_PASSWORD="$test_password" \
    DIO_AUTH_SCHEMA_TEST_URL="jdbc:postgresql://$pg_host:5432/auth_ci" \
    DIO_AUTH_SCHEMA_TEST_PASSWORD="$test_password" \
    DIO_RESET_POSTGRES_URL="jdbc:postgresql://$pg_host:5432/dio_reset_qa" \
    DIO_RESET_POSTGRES_PASSWORD="$test_password" \
    sh ./gradlew authPostgresTest --no-daemon
fi

if [ "$suite" = sharing ] || [ "$suite" = all ]; then
  create_db dio_sharing_qa
  create_db dio_collaboration_qa
  # 공유 권한·프로필·영구 삭제는 전용 sharing DB에서 검증한다.
  "${clean_env[@]}" \
    DIO_SHARING_POSTGRES_URL="jdbc:postgresql://$pg_host:5432/dio_sharing_qa" \
    DIO_SHARING_POSTGRES_PASSWORD="$test_password" \
    DIO_COLLABORATION_POSTGRES_URL="jdbc:postgresql://$pg_host:5432/dio_collaboration_qa" \
    DIO_COLLABORATION_POSTGRES_PASSWORD="$test_password" \
    sh ./gradlew sharingPostgresTest collaborationPostgresTest --no-daemon
fi

if [ "$suite" = diary ] || [ "$suite" = all ]; then
  bash "$CI_PROJECT_DIR/infra/scripts/check-member-list-icu.sh" --psql
  create_db dio_member_ci
  # 생성·상세 메타데이터는 전용 member DB에서 실제 Flyway 스키마를 사용한다.
  "${clean_env[@]}" \
    DB_URL="jdbc:postgresql://$pg_host:5432/dio_member_ci" \
    POSTGRES_USER=postgres POSTGRES_PASSWORD="$test_password" \
    sh ./gradlew postgresMemberDiaryCreationTest postgresDiaryDetailTest --no-daemon

  create_db dio_member_contract_qa
  # HTTP 계약은 Spring 컨텍스트를 별도의 폐기용 DB에서 기동한다.
  "${clean_env[@]}" \
    DB_URL="jdbc:postgresql://$pg_host:5432/dio_member_contract_qa" \
    POSTGRES_USER=postgres POSTGRES_PASSWORD="$test_password" \
    sh ./gradlew postgresMemberDiaryHttpTest --no-daemon
fi

if [ "$suite" = lifecycle ] || [ "$suite" = all ]; then
  create_db dio_trash_qa
  # 휴지통·영구 삭제는 생성/상세 테스트 DB와 분리한다.
  "${clean_env[@]}" DIO_LIST_QUERY_PG=true \
    DB_URL="jdbc:postgresql://$pg_host:5432/dio_trash_qa" \
    POSTGRES_USER=postgres POSTGRES_PASSWORD="$test_password" \
    sh ./gradlew postgresDiaryTrashTest postgresDiaryPurgeTest --no-daemon
fi
