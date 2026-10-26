# 비회원 다이어리 상세: PostgreSQL 조회

`GET /api/v1/diaries/{diaryId}`는 local 프로필에서 해당 ID의 저장 데이터를 조회한다. 인증·Query·Body는 요구하지 않는다.

```text
DiaryController → DiaryService → DiaryQueryService (읽기 전용 트랜잭션)
  → DiaryRepository.findById → DiaryMapper → {"diary":{...}}
```

| 상태 | 의미 |
|---|---|
| 200 | 저장된 다이어리. 생성·목록과 동일한 필드 및 문자열 ID |
| 400 | 0·음수·숫자가 아닌 값·Long 범위 밖 ID |
| 404 | 유효한 ID이지만 행이 없음. ProblemDetail code는 DIARY_NOT_FOUND |

저장된 규격·표지·시각을 그대로 반환하며 규격 설정에서 다시 계산하지 않는다. 조회만으로 updatedAt은 변경되지 않는다. 현재 비회원 로컬 개발은 사용자·기기별 접근 구분을 제공하지 않는다.

## 확인

local 서버의 Swagger에서 POST 생성 후 응답 diaryId 또는 Location 경로로 상세 GET을 호출한다. 확인용 서버는 http://localhost:8080/swagger-ui.html 이다.

backend에서 `gradlew.bat test postgresTest`를 실행한다. H2에서는 요청 ID에 해당하는 저장 필드·시각 유지·미존재 404를, PostgreSQL에서는 POST의 Location으로 GET 후 SQL 데이터와 비교하고 미존재 404를 검증한다. PostgreSQL 검증용 행은 롤백하며 기존 다이어리는 수정하지 않는다. 기존 잘못된 ID와 DB 없는 프로필 테스트도 유지한다.

수정·삭제도 실제 DB 처리를 지원한다.

## 2026-10-20 검증 결과

- `gradlew.bat test postgresTest`: 기본 테스트 70건, PostgreSQL 테스트 5건 통과. PostgreSQL 전용 5건은 기본 test에서 건너뛰고 postgresTest에서 실행한다.
- 실제 local 서버 18080에서 기존 저장 항목의 상세 200 및 목록과 같은 필드·시각을 확인했다. 미존재 ID의 404와 DIARY_NOT_FOUND 코드도 확인했다.
- 사용자 데이터는 수정·삭제하지 않았고 자동 검증에서 만든 행은 롤백했다.
