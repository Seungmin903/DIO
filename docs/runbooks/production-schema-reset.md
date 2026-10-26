# 최초 스키마 전환 및 운영 DB 초기화

이 문서는 `V1__initial_schema.sql`을 **처음** 적용하기 위한 일회성 절차다. 기존 다이어리 스키마와 Flyway 이력을 모두 버리는 작업이므로, 데이터 보존이 필요한 환경에는 사용하면 안 된다.

## 적용 전제

- 개발 DB는 이미 초기화되어 있으며, 새 애플리케이션이 V1을 적용할 준비가 되어 있다.
- 운영 DB도 기존 데이터를 폐기해도 된다는 팀 합의가 있다.
- 새 백엔드와 이 문서가 포함된 `master` 병합 요청이 승인되어 있다. 운영 백엔드·프록시 배포 job은 수동 실행이다.
- 운영 DB 컨테이너 이름은 `app-db-1`이다. 실행 전 `sudo docker ps --format "table {{.Names}}\t{{.Status}}"`로 다시 확인한다.

V1이 한 번 적용된 뒤에는 파일을 수정·삭제·이름 변경하지 않는다. 이후 변경은 항상 `V2__...`, `V3__...`처럼 새 마이그레이션으로 추가한다.

## DB 대상 확인과 백업

아래 명령은 **EC2의 `ubuntu` 사용자**로 실행한다. 출력된 database 이름이 운영 DB라는 것을 팀원이 함께 확인한 뒤에만 다음 단계로 진행한다.

```bash
sudo docker exec app-db-1 sh -lc \
  'printf "POSTGRES_DB=%s\n" "$POSTGRES_DB"; \
   psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
   -c "SELECT current_database() AS database, current_user AS database_user, inet_server_addr() AS server_address, inet_server_port() AS server_port;"'
```

초기화 전에는 복원 가능한 custom-format 백업을 만든다. `pg_dump -Fc`로 만든 archive는 `pg_restore`로 검사·복원할 수 있다.

```bash
umask 077
backup_dir="$HOME/dio-backups"
backup_name="dio-prod-before-v1-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p "$backup_dir"

sudo docker exec app-db-1 sh -lc \
  'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$backup_dir/$backup_name"

sudo docker run --rm \
  --mount type=bind,source="$backup_dir",target=/backup,readonly \
  postgres:17 pg_restore --list "/backup/$backup_name" > /dev/null
ls -lh "$backup_dir/$backup_name"
```

`pg_restore --list`가 성공하고 파일 크기가 0보다 큰지 확인해야 한다. 백업 파일은 EC2 외부의 접근 제어된 저장소에도 보관한다. PostgreSQL의 [`pg_dump` 공식 문서](https://www.postgresql.org/docs/current/app-pgdump.html)를 따른다.

## 운영 전환 순서

1. GitLab `master` 파이프라인에서 `deploy-production` job을 실행하지 않은 상태인지 확인한다. 이 시점부터 새 백엔드의 health check가 성공할 때까지가 운영 다운타임이다. 이미지가 이미 준비되었는지에 따라 달라지므로 최소 10분의 작업 창을 잡고, 10분을 넘기면 중단·복구 여부를 결정한다.
2. 운영 백엔드 컨테이너를 중지한다. 전환 중에는 이전 애플리케이션이 빈 스키마에 연결되지 않도록 한다.
3. 위의 **DB 대상 확인과 백업**을 완료한다.
4. EC2에서 아래 명령으로 `public` 스키마와 Flyway 이력을 삭제하고 빈 `public` 스키마를 만든다.

   ```bash
   sudo docker exec app-db-1 sh -lc \
     'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
   ```

5. GitLab `master` 파이프라인에서 `deploy-production`의 재생 버튼을 누른다. 해당 job은 실행 전에 DB가 비어 있거나 `initial schema` V1이 적용된 상태인지 검사하고, 기존 V1 또는 예상 밖의 테이블이 남아 있으면 컨테이너 교체 전에 실패한다. 새 백엔드가 시작되면서 Flyway가 V1을 적용한다.
6. 다음 명령으로 적용 이력을 확인한다.

   ```bash
   sudo docker exec app-db-1 sh -lc \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"'
   ```

   결과에 `1 | initial schema | t`가 있어야 한다. 이어서 운영 헬스 체크와 다이어리 생성·조회 스모크 테스트를 수행한다.

## 초기화 또는 V1 적용 실패 시

1. `DROP SCHEMA` 뒤 Flyway 또는 health check가 실패하면 새 백엔드를 계속 재시작하지 말고 중지한다.
2. 장애를 해결할 수 없다면, V1 전의 백엔드 이미지/커밋을 준비한 뒤 백업 archive를 복원한다. 새 V1 애플리케이션은 이전 Flyway 이력과 함께 기동할 수 없으므로, **반드시 이전 백엔드 버전**으로 함께 되돌린다.
3. 복원 전에는 대상 DB와 백업 파일명을 다른 팀원과 다시 확인한다. archive를 DB 컨테이너에 복사한 뒤 복원하는 예시는 다음과 같다.

   ```bash
   sudo docker cp "$backup_dir/$backup_name" app-db-1:/tmp/rollback.dump
   sudo docker exec app-db-1 sh -lc \
     'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/rollback.dump'
   sudo docker exec app-db-1 rm -f /tmp/rollback.dump
   ```

4. 이전 백엔드를 기동한 뒤 health check와 기존 다이어리 조회를 확인한다. 복구가 완료될 때까지 새 V1 배포를 다시 실행하지 않는다.

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
