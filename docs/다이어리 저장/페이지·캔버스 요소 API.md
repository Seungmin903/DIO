# 페이지·캔버스 요소 API

다이어리 페이지(`pages`)와 페이지 위 요소(`canvas_elements`)의 백엔드 API다. Flyway V1 스키마를 그대로 쓰며 마이그레이션은 추가하지 않았다. 인증 토큰은 다이어리 API와 같이 아직 요구하지 않는다. Swagger의 `페이지`, `캔버스 요소` 태그에서도 확인할 수 있다.

## API 목록

| 기능 | Method | Endpoint | 성공 | 주요 오류 |
|---|---|---|---|---|
| 다이어리 페이지 생성 | POST | `/api/v1/diaries/{diaryId}/pages` | 201, `page` | 400, 404 |
| 다이어리 페이지 목록 조회 | GET | `/api/v1/diaries/{diaryId}/pages` | 200, `items` | 404 |
| 페이지 순서 변경 | PUT | `/api/v1/diaries/{diaryId}/pages/order` | 200, `items` | 400, 404 |
| 페이지 상세 조회 | GET | `/api/v1/pages/{pageId}` | 200, `page` + `elements` | 404 |
| 페이지 설정 수정 | PATCH | `/api/v1/pages/{pageId}` | 200, `page` | 400, 404 |
| 페이지 복사 | POST | `/api/v1/pages/{pageId}/copy` | 201, `page` | 404 |
| 페이지 삭제 | DELETE | `/api/v1/pages/{pageId}` | 204 | 404 |
| 캔버스 요소 일괄 변경 | POST | `/api/v1/pages/{pageId}/elements/batch` | 200, `items` | 400, 404, 409 |
| 캔버스 요소 수정 | PATCH | `/api/v1/pages/{pageId}/elements/{elementId}` | 200, `element` | 400, 404, 409 |
| 캔버스 요소 삭제 | DELETE | `/api/v1/pages/{pageId}/elements/{elementId}` | 204 | 404 |
| 캔버스 요소 복구 | POST | `/api/v1/pages/{pageId}/elements/{elementId}/restore` | 200, `element` | 404, 409 |

ID는 모두 UUID 문자열이다. 오류는 `application/problem+json`이며 `code` 필드로 구분한다.

| code | 상태 | 의미 |
|---|---|---|
| `DIARY_NOT_FOUND` | 404 | 다이어리가 없거나 삭제됨 |
| `PAGE_NOT_FOUND` | 404 | 페이지가 없거나 삭제됨 |
| `PAGE_TEMPLATE_NOT_FOUND` | 404 | `templateId`가 없거나 비활성 속지 |
| `ELEMENT_NOT_FOUND` | 404 | 해당 페이지에 요소가 없거나(수정·삭제는) 이미 삭제됨 |
| `ELEMENT_NOT_DELETED` | 409 | 삭제되지 않은 요소를 복구하려 함 |
| `ELEMENT_ALREADY_EXISTS` | 409 | 생성하려는 `elementId`가 이미 있음 |
| `VERSION_CONFLICT` | 409 | 같은 행을 동시에 수정해 낙관적 잠금 충돌 |
| `DATA_CONFLICT` | 409 | `mediaFileId` 등 참조 대상이 없음 |
| `INVALID_REQUEST` | 400 | 순서 목록 불일치, 일괄 변경 대상 중복 등 |

## 페이지

### 생성·수정 요청

```json
{
  "templateId": 3,
  "templateConfig": { "lineGap": 24 },
  "title": "첫 장",
  "canvasWidth": 1280,
  "canvasHeight": 800,
  "gridVisible": true,
  "gridColor": "#AABBCC"
}
```

- 생성은 모든 필드가 선택이다. `{}`면 흰 종이(`templateId` 없음), 1280×800, 격자 숨김으로 만든다.
- `templateId`를 주면 활성 속지만 허용하고, 크기를 생략하면 속지 크기·`default_config`를 쓴다.
- `canvasWidth`와 `canvasHeight`는 함께 보내야 한다. `title`은 앞뒤 공백 제거 후 1~100자, `gridColor`는 `#RRGGBB`.
- 새 페이지와 복사한 페이지는 다이어리 맨 뒤(`sortKey` = 최대값 + 1)에 붙는다.
- 수정(PATCH)은 하나 이상의 필드가 필요하다. 생략한 필드는 유지하고, 명시적 `null`과 알 수 없는 필드는 400이다.

### 응답

```json
{
  "page": {
    "pageId": "…", "diaryId": "…", "templateId": null, "templateConfig": null,
    "title": "첫 장", "sortKey": 1, "canvasWidth": 1280.00, "canvasHeight": 800.00,
    "gridVisible": false, "gridColor": null, "version": 1,
    "createdAt": "2026-10-27T03:00:00Z", "updatedAt": "2026-10-27T03:00:00Z"
  }
}
```

목록은 `{"items":[page, …]}`이며 삭제되지 않은 페이지를 `sortKey` 오름차순으로 준다. 상세는 `{"page":…, "elements":[element, …]}`이며 요소는 삭제되지 않은 것만 레이어 순서(`sortKey` 오름차순, 뒤일수록 앞)로 준다.

### 순서 변경

```json
{ "pageIds": ["c…", "a…", "b…"] }
```

삭제되지 않은 페이지 ID를 **전부, 중복 없이** 원하는 순서로 보낸다. 서버는 `sortKey`를 1부터 다시 매기고 바뀐 목록을 돌려준다. 누락·중복·다른 다이어리의 ID가 있으면 400이다.

### 복사·삭제

- 복사는 설정(속지·제목·크기·격자)과 **삭제되지 않은** 요소를 새 ID로 복제한다. 요소의 레이어 순서와 `propertiesJson`도 그대로 옮긴다.
- 삭제는 `deleted_at`을 채우는 소프트 삭제다. 이미 삭제된 페이지는 404.

## 캔버스 요소

### 요소 필드

| 필드 | 생성 | 설명 |
|---|---|---|
| `elementId` | 선택 | 앱에서 만든 UUID. 생략하면 서버가 만든다. |
| `elementType` (`type`) | 필수 | `TEXT`, `PHOTO`, `STICKER`, `TAPE`, `STROKE`, `SHAPE` (대소문자 무관) |
| `x`, `y` | 필수 | 소수 3자리까지 |
| `width`(`w`), `height`(`h`) | 필수 | 0.001 이상 |
| `sortKey` | 선택 | 레이어 순서. 생략하면 현재 최대값 + 1 |
| `rotation` | 선택 | 도 단위, 기본 0 |
| `opacity` | 선택 | 0~1, 기본 1 |
| `isLocked`(`locked`), `isHidden`(`hidden`) | 선택 | 기본 false |
| `groupId`, `name`, `mediaFileId` | 선택 | `name`은 1~100자 |
| `propertiesJson` | 선택 | 종류별 속성 JSON(글자·색·필기 좌표 등) |

괄호 안 이름은 프런트 편집기 모델에서 쓰는 별칭이며 요청에서만 받는다. 응답은 항상 표준 이름(`elementType`, `width`, `isLocked` …)과 `pageId`, `version`, `createdAt`, `updatedAt`을 포함한다.

### 일괄 변경 (자동 저장용)

```json
{
  "creates": [{ "elementId": "…", "type": "TEXT", "x": 10, "y": 20, "w": 100, "h": 40,
                "propertiesJson": { "text": "안녕" } }],
  "updates": [{ "elementId": "…", "x": 30, "sortKey": 5 }],
  "deleteElementIds": ["…"],
  "restoreElementIds": ["…"]
}
```

- 네 배열 중 하나 이상이 필요하다. creates → updates → deletes → restores 순서로 **한 트랜잭션**에서 적용하며, 하나라도 실패하면 전체가 취소된다.
- 한 요청에서 같은 요소 ID를 두 번 이상 다룰 수 없다(400). `updates` 항목에는 `elementId`가 필수다.
- 성공 응답은 적용 후 페이지의 현재 요소 목록 `{"items":[element, …]}`이다.

### 단건 수정·삭제·복구

- PATCH 본문은 `updates` 항목과 같고 하나 이상의 필드가 필요하다. 본문에 `elementId`를 넣으면 경로와 같아야 한다. `elementType`, `pageId`는 바꿀 수 없다(400).
- DELETE는 소프트 삭제다. 삭제된 요소는 상세 조회에서 빠지고, 수정·재삭제는 404다.
- 복구는 삭제된 요소만 가능하다(아니면 409). 위치·속성은 삭제 전 값 그대로 돌아온다.
- 다른 페이지의 `elementId`로 접근하면 404다.

## 구현 메모

- 코드: `backend/src/main/java/com/f106/DIO/page/` (controller · service · domain · dto · repository · support)
- `templateConfig`·`propertiesJson`(jsonb)은 엔티티에서 문자열로 들고 API 경계에서만 JSON으로 바꾼다. Hibernate의 JSON 매퍼가 Jackson 2를 쓰고 MVC는 Jackson 3를 써서, 엔티티에 `JsonNode`를 직접 두면 저장이 실패한다.
- 페이지·요소는 `version`(낙관적 잠금)을 응답에 포함한다. 요청에서 예상 버전을 받는 조건부 수정은 아직 없다.
- `created_by`는 인증 연결 전이라 비워 둔다.

## 테스트

| 명령 (backend/) | 내용 |
|---|---|
| `./gradlew test` | H2에서 `PageApiTests`(페이지·요소 전체 흐름)와 `PageBatchRollbackTests`(일괄 변경 전체 취소) 실행 |
| `./gradlew postgresTest` | 로컬 PostgreSQL(Flyway V1, jsonb)에서 같은 흐름을 `PostgresPageApiTests`로 실행, 테스트 행은 롤백 |

### 요소 생성 순서와 페이지 생성 재시도

기존 요소 생성 API와 batch의 `creates`는 선택적 숫자 `sortKey`를 받는다. 정수부 최대 10자리·소수부 최대 10자리이며 명시적 `null`은 400이다. 생략하면 서버가 현재 마지막 순서(최대값 + 1)에 배치한다. 지정하면 해당 레이어 순서로 저장한다.

페이지 생성 시 사용한 `templateConfig.clientPageRequestId`는 서버가 설정 수정·속지 변경 후에도 보존하는 생성 식별자다. 수정 요청에서 다른 ID로 교체하거나 기존 ID가 없는 페이지에 추가할 수 없다(400). 설정 변경 후 원래 생성 요청을 재시도하면 409 `PAGE_CREATION_CONFLICT`로 안내하며 중복 페이지는 만들지 않는다. 페이지 복제본은 원본의 생성 식별자를 물려받지 않는다.

자동 요소 순서(현재 최댓값 + 1)가 `NUMERIC(20,10)` 범위(최대 `9999999999.9999999999`)를 초과하면 저장 전에 400으로 거절한다. batch는 전체 롤백하며 이력을 남기지 않는다. 기존 요소의 순서를 낮추거나 범위 내 `sortKey`를 명시해 복구할 수 있다.
