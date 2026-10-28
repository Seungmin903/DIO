# 다이어리 API

> 2026-10-27 인증 조회 전환: 현재 목록·상세 계약은 [다이어리 P0·P1 계약](../diary-auth-read-contract.md)을 따른다. 아래는 기존 무인증 저장 구현 이력이다. 현재 GET은 JWT와 참여 권한이 필요하며, POST는 [계정 생성 계약](../diary-create-contract.md)으로 대체했고 PATCH는 [OWNER 수정 계약](../diary-update-contract.md)으로 대체했다. DELETE 휴지통·POST 복원은 [새 계약](../diary-trash-contract.md)으로 대체했다. permanent=true는 [OWNER 영구 삭제 계약](../diary-permanent-delete-contract.md)으로 제공한다. 아래의 201/200/204는 현재 외부 쓰기 성공을 의미하지 않는다.

## 실행

Docker Desktop을 켜고 루트에서 `docker compose up -d --wait postgres`를 실행한다. backend에서:

```powershell
.\gradlew.bat bootRun
```

기본 프로필은 `local`이며 PostgreSQL을 사용한다. Swagger는 `http://localhost:8080/swagger-ui.html`, OpenAPI JSON은 `http://localhost:8080/v3/api-docs`다. 현재 다이어리 조회는 로그인 토큰을 요구한다.

## API 목록

| 기능 | Method | Endpoint | 성공 | 주요 오류 |
|---|---|---|---|---|
| 생성 | POST | `/api/v1/diaries` | 201, `diary` 객체 | 400 |
| 목록 | GET | `/api/v1/diaries` | 200, `items` 배열 | |
| 상세 | GET | `/api/v1/diaries/{diaryId}` | 200, `diary` 객체 | 400, 404 |
| 수정 | PATCH | `/api/v1/diaries/{diaryId}` | 200, `diary` 객체 | 400, 404 |
| 삭제 | DELETE | `/api/v1/diaries/{diaryId}` | 204, 본문 없음 | 400, 404 |

생성·수정 요청은 `Content-Type: application/json`이다. Query는 없으며 ID는 UUID 문자열이다.

## 생성 요청

```json
{
  "diaryTitle": "여행 다이어리",
  "coverColor": "#D6BFA7",
  "coverStyle": "PLAIN",
  "visibility": "MEMBERS"
}
```

`diaryTitle`은 앞뒤 공백을 제거한 뒤 1~100자로 검증하며 필수다. `coverColor`는 `#RRGGBB` 형식이다. `coverStyle`은 최대 30자, `visibility`는 `PRIVATE`, `MEMBERS`, `LINK` 중 하나다. 첫 페이지와 속지는 이 API에서 생성하지 않는다.

선택 필드를 생략하면 `coverColor`는 `#CED9EE`, `coverStyle`은 `PLAIN`, `visibility`는 `PRIVATE`가 적용된다. 생성 응답에는 `/api/v1/diaries/{diaryId}` 형식의 `Location` 헤더가 포함된다.

## 생성·상세·수정 응답

```json
{
  "diary": {
    "diaryId": "1c4d5e6f-2a3b-4c5d-8e9f-0123456789ab",
    "diaryTitle": "여행 다이어리",
    "coverColor": "#D6BFA7",
    "coverStyle": "PLAIN",
    "visibility": "MEMBERS",
    "createdAt": "2026-10-20T04:00:00Z",
    "updatedAt": "2026-10-20T04:00:00Z"
  }
}
```

시각은 UTC·마이크로초 정밀도다.

## 목록

동일한 `diary` 필드를 가진 객체를 `items` 배열로 반환한다. 빈 목록은 `{"items":[]}`다. 생성 시각 내림차순, 같은 시각이면 UUID 내림차순이다. 페이지네이션·검색은 미구현이다.

## 수정

`diaryTitle`, `coverColor`, `coverStyle`, `visibility` 중 하나 이상 전달한다. 생략한 필드는 유지된다. 명시적 `null`, 빈 요청, 지원하지 않는 필드는 400이다. 삭제된 다이어리를 포함해 없는 UUID를 수정하면 404다. 수정 시 `updatedAt`만 새 시각으로 갱신한다.

## 삭제

행을 물리적으로 지우지 않고 `deleted_at`을 기록하는 소프트 삭제다. 삭제된 다이어리는 목록·상세에서 제외되며, 수정과 재삭제도 404다. 페이지·요소가 추가되면 하위 데이터 삭제 정책을 별도로 구현한다.

## 이전 계약에서 바뀐 점

이 API는 최초 스키마 기준으로 이전 비회원 다이어리 계약을 교체했다. 프런트엔드는 아래 필드를 더 이상 보내거나 읽지 않아야 한다.

- 제거: `coverPattern`, `bindingType`, `formatId`, `canvasWidth`, `canvasHeight`, `defaultPageTemplate`
- 추가: `coverStyle`, `visibility`
- ID 변경: 숫자 문자열에서 UUID 문자열로 변경
- 삭제 변경: 하드 삭제에서 소프트 삭제로 변경

## 인증 전 범위

현재 인증·소유권 검증은 아직 구현되지 않았다. `visibility`는 저장·반환하는 메타데이터이며, 현재 목록·상세 API의 접근을 제한하지 않는다. 인증과 공유 정책을 도입할 때 사용자·멤버십 조건을 조회에 반영해야 한다.

## 검증

```powershell
.\gradlew.bat test postgresTest
```

기본 자동 테스트는 H2 테스트 DB를 사용한다. `postgresTest`는 실제 로컬 PostgreSQL을 사용한다. 실제 배포 전에는 해당 DB가 현재 V1 초기 스키마로 초기화되어 있어야 한다. 스키마 전환 절차는 [운영 스키마 초기화](../runbooks/production-schema-reset.md)를 따른다.

세부 구현은 [생성](./다이어리%20생성%20저장.md), [목록](./다이어리%20목록%20저장.md), [상세](./다이어리%20상세%20저장.md), [수정](./다이어리%20수정%20저장.md), [삭제](./다이어리%20삭제%20저장.md), [로컬 DB](./로컬%20PostgreSQL.md) 안내를 참고한다.
