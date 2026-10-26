# 로컬 PostgreSQL 실행과 연결 확인

## 구성

- Docker Compose 프로젝트 이름은 폴더명과 관계없이 `dio`다. 컨테이너는 `dio-postgres-1`, 데이터 볼륨은 `dio_postgres-data`다.

- PostgreSQL 17, 기본 주소 `localhost:5432`, DB `dio`, 사용자 `dio`; 비밀번호는 루트 `.env`에 설정한다.
- 데이터는 Docker named volume `postgres-data`에 보관한다. 기존 MySQL 볼륨은 삭제하거나 변환하지 않는다.
- 기존 `s15p31f106` 프로젝트에서 이름을 변경할 때 DB를 중지한 뒤 볼륨을 복사하고 다이어리 데이터 건수·해시 일치를 확인했다. 이전 컨테이너는 제거했지만 원본 `s15p31f106_postgres-data` 볼륨은 보관했다. 현재 DB는 `dio_postgres-data`를 사용한다.
- Spring의 기본 `local` 프로필은 PostgreSQL을 사용한다. Flyway로 테이블을 생성하고 `ddl-auto: validate`로 매핑을 검사한다.
- 다이어리 다섯 API 모두 실제 DB 처리를 지원한다. [생성](./다이어리%20생성%20저장.md), [목록](./다이어리%20목록%20저장.md), [상세](./다이어리%20상세%20저장.md), [수정](./다이어리%20수정%20저장.md), [삭제](./다이어리%20삭제%20저장.md) 안내를 참고한다.

## 실행

Docker Desktop을 켜고 저장소 루트에서:

```powershell
Copy-Item .env.example .env  # 최초 1회만 실행 후 POSTGRES_PASSWORD 설정
docker compose up -d --wait postgres
docker compose ps postgres
```

backend에서:

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

- Swagger: http://localhost:8080/swagger-ui.html
- 실제 DB 상태 확인: http://localhost:8080/actuator/health/db
- `/api/health`는 고정된 애플리케이션 응답이므로 DB 연결 확인 용도로 쓰지 않는다.
- local 프로필에 한해 Actuator 상세 상태를 표시한다. DB 상태가 UP이고 database가 PostgreSQL인지 확인한다.

## 환경변수 변경

루트 `.env`를 Docker Compose와 Spring의 local 프로필이 함께 읽는다. Spring 실행 작업 디렉터리는 저장소 루트 또는 `backend/`로 설정한다. `.env`는 커밋하지 않으며 `.env.example`에는 실제 비밀번호를 적지 않는다. IntelliJ 실행 환경이나 OS 환경변수를 직접 지정하면 `.env`보다 우선한다. 원격 DB 주소는 `DB_URL`로 지정할 수 있다.

`.env`는 `KEY=value` 형식으로 작성하며 `export`와 따옴표는 사용하지 않는다. Spring이 properties 형식으로 읽으므로 값에 역슬래시가 필요하면 이스케이프해야 한다. 기존 로컬 DB 사용자는 현재 계정의 비밀번호를 설정한다.

이미 만들어진 PostgreSQL 볼륨의 계정·DB·비밀번호는 환경변수만 바꿔서 자동 변경되지 않는다. 데이터가 있는 볼륨을 지우는 대신 기존 계정을 확인하여 변경한다.

## 테스트 구분

`gradlew.bat test`는 H2 테스트 DB에서 자동 테스트를 실행한다. H2의 PostgreSQL 호환 모드가 실제 PostgreSQL 검증을 대체하지는 않는다. 위 local 프로필과 Actuator 또는 psql을 통해 실제 연결을 확인한다.

## 연결 검증 결과 (2026-10-20)

- `docker compose config --quiet`: 통과.
- `docker compose up -d --wait postgres`: 컨테이너 healthy.
- psql: DB dio, 사용자 dio, PostgreSQL 17.11 확인. 임시 테이블 INSERT·SELECT 후 ROLLBACK 성공, 테스트 데이터는 보관하지 않음.
- Spring Boot: local 프로필, 임시 18080 포트에서 PostgreSQL JDBC 연결·PostgreSQLDialect 확인.
- `GET http://localhost:8080/actuator/health/db`: `status: UP`, `database: PostgreSQL`.
- `GET http://localhost:8080/swagger-ui/index.html`: 200.
- `gradlew.bat test`: 성공. 기본 자동 테스트와 실제 PostgreSQL 수동 연결 확인은 별도로 수행했다.
- 위 항목은 연결 설정 단계의 검증 기록이다. 이후 생성 저장 구현과 실제 201 검증을 완료했으며 최신 결과는 [생성 저장 안내](./다이어리%20생성%20저장.md)에 기록한다. 목록·상세·수정·삭제 저장 처리는 후속 작업이다.

## 실행 중인 DB 중지

```powershell
docker compose stop postgres
```

데이터가 필요한 동안 `down -v`나 volume 삭제를 실행하지 않는다.
