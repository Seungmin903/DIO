# 비회원 다이어리 API (S15P31F106-58)

## 실행

Docker Desktop을 켜고 루트에서 `docker compose up -d --wait postgres`를 실행한다. backend에서:

```powershell
.\gradlew.bat bootRun
```

기본 프로필은 local이며 PostgreSQL을 사용한다. Swagger는 http://localhost:8080/swagger-ui.html, OpenAPI JSON은 http://localhost:8080/v3/api-docs 이다. 인증 토큰은 요구하지 않는다.

## API 목록

| 기능 | Method | Endpoint | 성공 | 주요 오류 |
|---|---|---|---|---|
| 생성 | POST | /api/v1/diaries | 201, diary 객체 | 400 |
| 목록 | GET | /api/v1/diaries | 200, items 배열 | |
| 상세 | GET | /api/v1/diaries/{diaryId} | 200, diary 객체 | 400, 404 |
| 수정 | PATCH | /api/v1/diaries/{diaryId} | 200, diary 객체 | 400, 404 |
| 삭제 | DELETE | /api/v1/diaries/{diaryId} | 204, 본문 없음 | 400, 404 |

분류는 프 → 백, 종류는 API, 권한은 전체(비회원 MVP1), 토큰은 X다. 생성·수정 요청은 Content-Type: application/json이다. Query는 없으며 ID는 양수 Long 범위의 값이다. 응답 ID는 문자열이다.

## 생성 요청

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

모두 필수다. 제목은 앞뒤 공백 제거 후 1~100자, 색상은 #RRGGBB, 패턴은 LINEN/LEATHER/DOT/GINGHAM/STRIPE다. 제본은 공백 불가·최대 30자이며 허용 목록은 추가 합의 필요하다. 현재 formatId=1은 가로 1280×800이고 없는 규격은 400이다. 기본 서식은 MONTHLY/WEEKLY/BLANK/LINED/SQUARED/DOTTED다. 첫 페이지는 생성하지 않는다.

## 생성·상세·수정 응답

```json
{
  "diary": {
    "diaryId": "1",
    "diaryTitle": "여행 다이어리",
    "coverColor": "#D6BFA7",
    "coverPattern": "LINEN",
    "bindingType": "RING",
    "formatId": "1",
    "canvasWidth": 1280,
    "canvasHeight": 800,
    "defaultPageTemplate": "BLANK",
    "createdAt": "2026-10-20T04:00:00Z",
    "updatedAt": "2026-10-20T04:00:00Z"
  }
}
```

규격 크기는 생성 시 저장한 값을 반환하고 시각은 UTC·마이크로초 정밀도다. 생성 응답에는 Location 헤더도 포함한다.

## 목록

동일한 diary 필드를 가진 객체를 items 배열로 반환한다. 빈 목록은 {"items":[]}다. 생성 시각 내림차순, 같은 시각이면 ID 내림차순이다. 페이지네이션·검색은 미구현이다.

## 수정

이름·표지색·패턴·제본 중 하나 이상 전달한다. 생략은 유지, 명시적 null·빈 요청·미지원 필드는 400이다. 규격·기본 서식·소유자·생성 시각은 유지하며 수정 시각만 갱신한다.

## 삭제

현재 로컬 스키마에서 다이어리 행을 실제 삭제한다. 삭제 후 상세 조회와 재삭제는 404, 목록에서는 제외된다. 페이지·요소가 추가되면 하위 데이터 삭제 정책을 별도로 구현한다.

## 비회원 범위

현재 로컬 개발에서는 owner_user_id가 NULL이며 기기·사용자별 접근 구분은 제공하지 않는다. 회원·공유 기능 도입 시 소유권을 별도 설계한다.

## 검증

```powershell
.\gradlew.bat test postgresTest
```

기본 자동 테스트는 H2 테스트 DB, postgresTest는 실제 로컬 PostgreSQL을 사용한다. 실제 앱 실행은 PostgreSQL에 연결한다. 두 방식 모두 실제 저장·조회 로직을 검증한다. 테스트용 데이터는 롤백한다.

세부 구현은 [생성](./diary-create-persistence.md), [목록](./diary-list-persistence.md), [상세](./diary-detail-persistence.md), [수정](./diary-update-persistence.md), [삭제](./diary-delete-persistence.md), [로컬 DB](./local-postgresql.md) 안내를 참고한다.

2026-10-20: 실행 경로를 DB 연동으로 단순화한 뒤 `clean test postgresTest`에서 총 86건이 통과했다. 기본 8080 서버의 DB 상태 UP, Swagger 성공 응답, 실제 생성·목록·상세·수정·삭제를 확인했고 검증용 행은 정리했다. 임시 18080 서버는 종료했다.
