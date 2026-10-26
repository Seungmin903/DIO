# 비회원 다이어리 생성: PostgreSQL 저장

## 구현 범위

`POST /api/v1/diaries`가 local 프로필에서 PostgreSQL `diaries`에 저장하고 실제 `201 Created`를 반환한다. Authorization은 사용하지 않는다. 목록·상세·수정·삭제도 실제 DB 처리를 지원하며 생성 응답의 Location 주소로 상세 GET이 가능하다.

```text
DiaryController → DiaryService → DiaryCreationService (트랜잭션)
  → DiaryRepository → diaries INSERT → 생성 응답
```


## 실행

루트에서 `docker compose up -d --wait postgres`를 실행하고 backend에서:

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

Swagger: http://localhost:8080/swagger-ui.html

```json
{
  "diaryTitle": "여행 다이어리",
  "coverColor": "#D6BFA7",
  "coverPattern": "LINEN",
  "bindingType": "RING",
  "formatId": "1",
  "defaultPageTemplate": "BLANK"
}
```

- 제목은 앞뒤 공백 제거 후 검증한다.
- 승인된 현재 규격은 `1 = 가로 1280×800`이다. `application-local.yml`의 `dio.diary.formats`에서 관리한다.
- 존재하지 않는 formatId는 400, `INVALID_DIARY_FORMAT`으로 거절한다.
- 규격 크기를 요청에서 받지 않고 서버 설정에서 결정한다. 생성 시 너비·높이를 복사해 저장하므로 규격 설정을 변경해도 기존 다이어리는 바뀌지 않는다.
- 제본 허용 목록은 아직 확정되지 않아 필수·최대 30자 검증을 유지한다.
- 성공 응답은 기존 명세의 diary 객체이고, ID는 String, 크기는 Number, 시간은 UTC 시각이다. createdAt과 updatedAt은 생성 시 동일하다.
- 첫 페이지는 생성하지 않는다.

## 스키마와 ERD 차이

Flyway `V1__create_diaries.sql`로 테이블을 생성하고 Hibernate `ddl-auto: validate`로 Entity와 대조한다. 적용한 V1을 나중에 수정하지 않고 변경은 V2 이후 마이그레이션으로 추가한다.

현재 파일은 전체 서비스 ERD를 한 번에 구축하지 않고 비회원 생성 계약에 필요한 다이어리 컬럼만 구성한다.

| API | DB |
|---|---|
| diaryTitle | title |
| coverPattern | cover_style |
| bindingType | cover_binding |
| formatId | format_id |
| canvasWidth / canvasHeight | canvas_width / canvas_height |
| defaultPageTemplate | default_page_template |

첨부된 전체 ERD의 diaries에는 규격·기본 서식 저장 위치가 없으므로 위 네 규격·서식 컬럼은 API 계약을 충족하는 추가 컬럼이다. 비회원 로컬 개발에서는 `owner_user_id`를 NULL로 저장하며 users 테이블이나 가짜 사용자 ID를 만들지 않는다. 회원 도입 시 소유권·기존 비회원 데이터 귀속·FK·필수 여부를 별도 마이그레이션으로 결정해야 한다. 이 구현은 기기별 비회원 데이터 구분 기능을 제공하지 않는다.

기존에 다른 구조의 diaries 테이블이 있는 DB에 자동 덮어쓰기나 baseline을 수행하지 않는다. 현재 로컬 DB가 비어 있음을 확인한 후 적용했다. 테이블이 있는 공유 DB에는 구조를 먼저 비교해야 한다.

## 검증

backend에서:

```powershell
.\gradlew.bat test
.\gradlew.bat postgresTest
```

- 기본 테스트: 기존 계약·검증·H2 실제 저장, 잘못된 입력의 무저장, 규격 변경 후 기존 크기 보존.
- postgresTest: local PostgreSQL과 Flyway를 사용해 HTTP 요청→JPA 저장→SQL 조회를 검증한다. 테스트 행은 롤백한다. 마이그레이션으로 생성한 테이블·이력은 남고 ID 시퀀스 번호는 소모될 수 있다.
- 기본 test에서 PostgreSQL 전용 테스트는 건너뛴다. PostgreSQL 성공 여부는 별도 postgresTest 결과로 확인한다.

DB에서 확인하기:

```powershell
docker compose exec -T postgres psql -U dio -d dio -c "SELECT diary_id, title, cover_style, format_id, canvas_width, canvas_height FROM diaries ORDER BY diary_id;"
```

### 2026-10-20 검증 결과

- `gradlew.bat test postgresTest`: 성공. 기본 테스트 65건 통과, PostgreSQL 전용 테스트 2건은 기본 task에서 건너뛰고 postgresTest에서 2건 모두 통과했다.
- Flyway V1 적용 및 PostgreSQL의 CHAR(7)·NUMERIC·TIMESTAMPTZ와 JPA 매핑 검증 통과.
- local 서버 18080 포트에 실제 POST 요청을 보내 201 및 ID를 받았다. 별도 psql 연결로 해당 행의 저장·커밋을 확인한 뒤 검증에서 만든 행만 삭제했다.
- 검증용 행 외 사용자 데이터는 수정하지 않았다. PostgreSQL 및 local 서버(18080)는 실행 중이다.
