# 비회원 다이어리 수정: PostgreSQL 저장

`PATCH /api/v1/diaries/{diaryId}`는 local 프로필에서 저장된 다이어리 설정을 수정하고 200과 `{"diary":{...}}`를 반환한다. 인증·Query는 요구하지 않고 Content-Type은 application/json이다.

```json
{
  "diaryTitle": "제주 여행",
  "coverColor": "#A8C8E8",
  "coverPattern": "LEATHER",
  "bindingType": "RING"
}
```

## 규칙

- 네 필드는 각각 선택이며 하나 이상 전달해야 한다.
- 생략한 값은 기존 값을 유지한다. 명시적인 null·빈 요청·미지원 필드는 400이다.
- 제목은 앞뒤 공백 제거 후 1~100자, 색상은 #RRGGBB, 패턴은 생성의 다섯 허용 코드다. 제본은 필수값이 아니라 전달했을 때 공백 불가·최대 30자를 검증한다. 제본 허용 목록은 아직 미확정이다.
- 규격 ID·너비·높이·기본 서식·소유자·createdAt은 수정하지 않는다.
- 성공할 때 updatedAt을 갱신한다. 기존과 같은 값을 전달한 경우도 갱신한다.
- 생성·수정 시각은 PostgreSQL과 같은 마이크로초 정밀도로 기록하여 응답과 재조회 시각을 일치시킨다.
- 유효한 ID에 행이 없으면 404와 DIARY_NOT_FOUND, 잘못된 ID는 400이다.
- 현재 비회원 로컬 개발에는 사용자·기기별 접근 구분이 없다. 인증 기능은 추가하지 않는다.

## 처리 경로

```text
DiaryController → DiaryService → DiaryModificationService (@Transactional)
  → ID 조회 → Diary.updateSettings → flush → DiaryMapper → 응답
```

트랜잭션 내에서 변경 사항을 반영한다. 입력 검증이 실패하면 Service에 진입하지 않아 저장 값과 시각이 바뀌지 않는다. 이번 변경은 기존 테이블을 사용하므로 새 마이그레이션은 없다.

## 확인

local 서버의 Swagger에서 POST로 만든 ID를 PATCH한 뒤 GET 상세로 저장 결과를 확인한다. 확인용 서버는 http://localhost:8080/swagger-ui.html 이다.

backend에서 `gradlew.bat test postgresTest`를 실행한다. H2에서 전체·부분 수정, 생략값과 규격·생성 시각 유지, 같은 값 요청 시 수정 시각 갱신, 잘못된 요청의 무변경, 미존재 404를 검증한다. PostgreSQL에서는 PATCH 후 SQL과 상세 GET으로 실제 반영을 확인하고 null 거절 후 데이터 무변경을 검증한다. 자동 검증의 행은 롤백한다.

삭제도 실제 DB 처리를 지원한다. [삭제 안내](./diary-delete-persistence.md)를 참고한다.

## 2026-10-20 검증 결과

- `gradlew.bat test postgresTest`: 기본 테스트 79건과 실제 PostgreSQL 테스트 8건, 총 87건 통과. PostgreSQL 전용 테스트는 기본 test에서 건너뛰고 postgresTest에서 실행한다.
- 실제 local 서버 18080에서 생성→PATCH→상세 GET과 SQL 조회로 저장 변경을 확인했다. 생성 시각 유지·수정 시각 갱신·생략값 유지를 검증했다.
- 생성·수정 응답의 시각과 PostgreSQL 저장 시각이 마이크로초까지 일치하는 회귀 테스트를 추가했다.
- 사용자 데이터는 변경하지 않았고 수동 검증에서 만든 행만 정리했다. 서버는 최신 빌드로 재시작했다.
