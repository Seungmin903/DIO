# 비회원 다이어리 목록: PostgreSQL 조회

## 동작

`GET /api/v1/diaries`는 local 프로필에서 저장된 `diaries`를 조회하고 200을 반환한다. Authorization·Query·Path·Body는 요구하지 않는다.

```text
DiaryController → DiaryService → DiaryQueryService (읽기 전용 트랜잭션)
  → DiaryRepository → SELECT → DiaryMapper → {"items":[...]}
```

- 응답 항목은 생성 응답의 diary와 동일한 필드를 사용한다. 생성과 목록은 같은 매퍼를 공유한다.
- DB에 저장한 규격과 크기를 반환한다. 현재 규격 설정에서 크기를 다시 계산하지 않는다.
- 정렬은 created_at 내림차순, 동일하면 diary_id 내림차순이다.
- 데이터가 없으면 200과 `{"items":[]}`를 반환한다.
- 페이지네이션·검색·필터는 이번 범위에 없다.
- 현재 비회원 로컬 개발은 DB의 전체 다이어리를 조회한다. 기기별·사용자별 데이터 구분은 아직 없으며 회원·공유 기능을 도입할 때 접근 범위를 변경해야 한다.

## 실행과 확인

루트에서 `docker compose up -d --wait postgres`를 실행하고 backend에서:

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

Swagger에서 POST로 생성한 뒤 GET 목록을 호출해 items 안에 생성한 diaryId가 포함되는지 확인한다. 기본 서버 포트는 8080이며, 확인용으로 18080에서 실행했다면 http://localhost:8080/swagger-ui.html 을 사용한다.

## 테스트

```powershell
.\gradlew.bat test postgresTest
```

- H2 실제 저장·조회: 빈 목록, 응답 필드, 생성 시각 우선 정렬, 같은 생성 시각의 ID 정렬.
- 실제 PostgreSQL: 기존 데이터를 유지하면서 테스트 행을 추가하고 HTTP 목록에서 조회한 뒤 트랜잭션 롤백.
- 생성 API 및 Swagger 테스트도 함께 수행한다.

상세 조회·수정·삭제도 실제 DB 처리를 지원한다.

## 2026-10-20 검증 결과

- `gradlew.bat test postgresTest`: 성공. 기본 테스트 68건, PostgreSQL 테스트 3건 통과. PostgreSQL 전용 3건은 기본 test에서 건너뛰고 postgresTest에서 실행한다.
- local 서버 18080에서 실제 POST → GET을 호출해 새 ID가 목록에 나타나는 것을 확인했다.
- 기존 다이어리는 유지하고 수동 검증에서 만든 행만 정리했다. 서버와 DB는 실행 중이다.
