# 최초 스키마 전환 및 운영 DB 초기화

이 문서는 `V1__initial_schema.sql`을 **처음** 적용하기 위한 일회성 절차다. 기존 다이어리 스키마와 Flyway 이력을 모두 버리는 작업이므로, 데이터 보존이 필요한 환경에는 사용하면 안 된다.

## 적용 전제

- 개발 DB는 이미 초기화되어 있으며, 새 애플리케이션이 V1을 적용할 준비가 되어 있다.
- 운영 DB도 기존 데이터를 폐기해도 된다는 팀 합의가 있다.
- 새 백엔드와 이 문서가 포함된 `master` 병합 요청이 승인되어 바로 배포할 수 있다.
- 운영 DB 컨테이너 이름은 `app-db-1`이다. 실행 전 `sudo docker ps --format "table {{.Names}}\t{{.Status}}"`로 다시 확인한다.

V1이 한 번 적용된 뒤에는 파일을 수정·삭제·이름 변경하지 않는다. 이후 변경은 항상 `V2__...`, `V3__...`처럼 새 마이그레이션으로 추가한다.

## 운영 전환 순서

1. 운영 백엔드 컨테이너를 중지한다. 전환 중에는 이전 애플리케이션이 빈 스키마에 연결되지 않도록 한다.
2. DB 컨테이너·DB 이름을 확인한 뒤, EC2에서 아래 명령으로 `public` 스키마와 Flyway 이력을 삭제하고 빈 `public` 스키마를 만든다.

   ```bash
   sudo docker exec app-db-1 sh -lc \
     'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
   ```

3. 지체 없이 승인된 `master` 병합 요청을 병합하거나 운영 배포 파이프라인을 실행한다. 새 백엔드가 시작되면서 Flyway가 V1을 적용한다.
4. 다음 명령으로 적용 이력을 확인한다.

   ```bash
   sudo docker exec app-db-1 sh -lc \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"'
   ```

   결과에 `1 | initial schema | t`가 있어야 한다. 이어서 운영 헬스 체크와 다이어리 생성·조회 스모크 테스트를 수행한다.

## 개발·로컬 환경

기존 V1이 적용된 개발/로컬 DB도 같은 이유로 초기화가 필요하다. 개발 EC2의 컨테이너는 `dio-dev-db-1`이며, 명령의 컨테이너 이름만 바꿔 실행한다.

```bash
sudo docker exec dio-dev-db-1 sh -lc \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
```

로컬 Docker Compose DB를 초기화할 때도 대상 DB가 맞는지 먼저 확인한다. `flyway clean`은 스키마 삭제 범위가 넓어질 수 있으므로 이 전환에는 사용하지 않는다.

## 전환 후

이 절차는 완료 후 다시 실행하지 않는다. 데이터 구조를 바꿀 때는 기존 데이터를 보존하는 Flyway 후속 마이그레이션을 작성하고, 운영에서 자동 적용되는지 검토한다.
