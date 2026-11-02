# 운영 DB 백업과 복구

운영 PostgreSQL(`app_default` 네트워크의 `db`)을 매일 `pg_dump`로 백업한다. 설정 파일은 다음과 같다.

- `infra/backup/pg-backup.sh`: 백업·보관 정리 스크립트
- `infra/backup/Dockerfile`: `postgres:17-alpine` 기반 백업 이미지
- `infra/compose/compose.backup.prod.yml`: 백업 컨테이너(`dio-prod-db-backup` 프로젝트)

## 동작

| 항목 | 값 |
|---|---|
| 대상 | 운영 DB 전체 (`POSTGRES_DB`) |
| 형식 | `pg_dump --format=custom` (`dio-YYYYMMDD-HHMMSS.dump`, 파일명 시각은 UTC) |
| 주기 | 매일 03시 KST (`DB_BACKUP_HOUR_UTC=18`) |
| 저장 위치 | 같은 서버의 Docker 볼륨 `dio-prod-db-backups` (서울 리전 EC2 디스크) |
| 보관 기간 | 7일 (`DB_BACKUP_RETENTION_DAYS`). 기간이 지난 덤프는 백업 성공 여부와 관계없이 매일 삭제 |
| 권한 | 덤프 파일은 `600` (컨테이너 root만 읽기) |

따라서 DB에서 삭제한 자료는 최대 7일 뒤 모든 백업에서 사라진다.

S3의 사진·프로필 사진 파일은 백업 대상이 아니다. 백업이 같은 서버 디스크에 있으므로 서버 디스크 자체가 손상되면 백업도 함께 잃는다.

## 배포

`master`에서 `infra/backup/**` 또는 `compose.backup.prod.yml`이 바뀌면 `deploy-prod-db-backup` 작업을 수동으로 실행한다. 이 작업은 이미지를 빌드하고, 한 번 즉시 백업해 접속 정보와 볼륨을 확인한 뒤, 스케줄러 컨테이너를 재생성한다. 접속 정보는 `prod.env`의 `POSTGRES_*`를 그대로 쓴다.

## 점검

```bash
sudo docker logs --tail 20 dio-prod-db-backup-db-backup-1
sudo docker run --rm -v dio-prod-db-backups:/backups:ro alpine ls -l /backups
```

로그에 매일 `backup ok`가 있어야 한다. `backup failed`가 있으면 DB 컨테이너 상태와 `prod.env`의 접속 정보를 확인한다.

수동으로 즉시 백업하려면:

```bash
sudo docker exec dio-prod-db-backup-db-backup-1 pg-backup.sh once
```

## 복구

복구는 운영 데이터를 덮어쓰므로 팀 합의와 다운타임 공지 후에만 진행한다. 먼저 별도 DB에 복원해 내용을 확인한다.

```bash
# 1. 복원할 덤프 확인
sudo docker run --rm -v dio-prod-db-backups:/backups:ro alpine ls -l /backups

# 2. 운영 DB 컨테이너 안에 확인용 DB를 만들고 복원
sudo docker cp "$(sudo docker volume inspect -f '{{.Mountpoint}}' dio-prod-db-backups)/dio-<시각>.dump" app-db-1:/tmp/restore.dump
sudo docker exec app-db-1 sh -c 'createdb -U "$POSTGRES_USER" dio_restore_check && pg_restore -U "$POSTGRES_USER" -d dio_restore_check --no-owner /tmp/restore.dump'

# 3. 확인이 끝나면 확인용 DB와 임시 파일 삭제
sudo docker exec app-db-1 sh -c 'dropdb -U "$POSTGRES_USER" dio_restore_check; rm -f /tmp/restore.dump'
```

실제 운영 DB로 되돌릴 때는 백엔드를 멈춘 뒤 `pg_restore --clean --if-exists`로 복원하고, Flyway 이력(`flyway_schema_history`)이 덤프 시점과 맞는지 확인한 다음 백엔드를 다시 배포한다. 컨테이너명은 `docker ps`로 먼저 확인한다.
