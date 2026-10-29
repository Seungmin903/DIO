# 페이지·캔버스 API

페이지와 캔버스 요소는 `pages`, `canvas_elements` 테이블의 소프트 삭제와 JSONB 속성을 사용한다. 다이어리·페이지·요소 저장 API는 Bearer Access Token이 필요하다. 다이어리 생성자는 `OWNER`로 저장되며, `OWNER`·`EDITOR`는 생성·수정·삭제·순서 변경을 할 수 있고 `VIEWER`는 저장된 내용만 조회할 수 있다. 소유자 또는 활성 멤버가 아닌 사용자는 `403 DIARY_ACCESS_DENIED`를 받는다.

비로그인 사용자의 그리기는 프런트 로컬 임시 상태로만 유지해야 하며, 서버에 저장된 다이어리·페이지·요소 API는 호출할 수 없다.

## 엔드포인트

| 기능 | Method | Endpoint | 성공 |
|---|---|---|---|
| 페이지 목록 | GET | `/api/v1/diaries/{diaryId}/pages` | 200 |
| 페이지 생성 | POST | `/api/v1/diaries/{diaryId}/pages` | 201 |
| 페이지 순서 변경 | PATCH | `/api/v1/diaries/{diaryId}/pages/order` | 200 |
| 페이지 상세 | GET | `/api/v1/pages/{pageId}` | 200 |
| 페이지 설정 수정 | PATCH | `/api/v1/pages/{pageId}` | 200 |
| 페이지 삭제 | DELETE | `/api/v1/pages/{pageId}` | 204 |
| 페이지 복사 | POST | `/api/v1/pages/{pageId}/copies` | 201 |
| 요소 목록·생성 | GET, POST | `/api/v1/pages/{pageId}/elements` | 200, 201 |
| 요소 수정·삭제 | PATCH, DELETE | `/api/v1/pages/{pageId}/elements/{elementId}` | 200, 200 |
| 요소 일괄 변경 | POST | `/api/v1/pages/{pageId}/elements/batch` | 200 |
| 요소 복구 | POST | `/api/v1/pages/{pageId}/elements/{elementId}/restore` | 200 |

모든 표의 다이어리·페이지·요소 API는 Swagger의 **Authorize**에서 발급받은 Access Token을 `Bearer` 방식으로 입력해야 한다. Swagger UI의 자물쇠 표시는 이 인증 요구를 뜻한다.

## Swagger 필드 입력

페이지와 단일 캔버스 요소의 생성·수정은 기존 `application/json`과 함께 `application/x-www-form-urlencoded`도 받는다. Swagger UI에서 해당 API를 열고 **Content-Type**을 `application/x-www-form-urlencoded`로 바꾸면, JSON 본문 대신 제목·좌표·크기·잠금 여부처럼 각 필드를 별도 입력칸으로 작성할 수 있다.

`templateConfig`, `propertiesJson`만은 중첩 데이터를 보존해야 하므로 한 개의 JSON 문자열 입력칸이다. 예를 들어 `{"paperColor":"#FFFDF7"}` 또는 `{"text":"오늘의 기록"}`처럼 입력한다. 페이지 순서 변경과 요소 일괄 변경은 배열·중첩 구조를 포함하므로 계속 JSON 요청만 사용한다.

## 페이지

생성 요청의 `templateId`, `templateConfig`, `title`, `canvasWidth`, `canvasHeight`, `gridVisible`, `gridColor`는 모두 선택이다. 크기는 반드시 너비·높이를 함께 보내야 하며 생략하면 활성 속지의 크기, 속지를 생략하면 `1280 × 800`을 사용한다. `templateId`가 있다면 활성 속지여야 한다.

```json
{
  "title": "10월 27일",
  "templateId": 3,
  "templateConfig": { "paperColor": "#FFFDF7" },
  "canvasWidth": 1024,
  "canvasHeight": 768,
  "gridVisible": true,
  "gridColor": "#D9D9D9"
}
```

목록은 `sortKey` 오름차순이다. 순서 변경은 삭제되지 않은 페이지 ID를 중복 없이 **전부** 전달한다. 페이지 수정에서 `templateId`만 바꾸면 새 속지의 기본 크기와 `defaultConfig`로 설정을 교체한다. `templateConfig`도 함께 보내면 그 값을 우선하고, `templateConfig`만 보내면 현재 속지는 유지한 채 해당 설정만 바꾼다.

```json
{ "pageIds": ["page-uuid-1", "page-uuid-2"] }
```

상세 응답은 `{ "page": { ... }, "elements": [ ... ] }`이고, 목록·생성·수정·복사 응답은 각각 `items` 또는 `page` 래퍼를 사용한다. 페이지 복사는 속지 설정과 삭제되지 않은 요소를 새 UUID로 복제해 해당 다이어리의 마지막에 추가한다. 요소의 `groupId`도 복사본 안에서만 쓰는 새 UUID로 바꾸며, 같은 그룹이던 요소는 복사본에서도 같은 그룹이다. 페이지 삭제는 소프트 삭제이므로 이후 조회·수정·복사의 대상이 될 수 없다.

## 캔버스 요소

생성에는 `elementType`, `x`, `y`, `width`, `height`가 필수다. 유형은 `TEXT`, `PHOTO`, `STICKER`, `TAPE`, `STROKE`, `SHAPE`다. `rotation`의 기본값은 `0`, `opacity`는 `1`, 잠금·숨김은 `false`다. 프런트의 기존 필드명인 `type`, `w`, `h`, `locked`, `hidden`도 생성·수정 요청에서 별칭으로 받을 수 있다.

```json
{
  "type": "TEXT",
  "name": "제목",
  "x": 48,
  "y": 72,
  "w": 360,
  "h": 84,
  "propertiesJson": { "text": "오늘의 기록", "fontSize": 28 }
}
```

`propertiesJson`과 `templateConfig`는 JSONB로 보존되며 응답에서는 객체·배열 형태 그대로 반환한다. `propertiesJson`은 요소 하나당 최대 128KiB, `templateConfig`는 최대 512KiB다. 요소 목록은 레이어 순서인 `sortKey` 오름차순이다. 삭제는 소프트 삭제이며 복구 API는 삭제된 요소에만 적용된다.

요소 수정과 일괄 변경의 `updates` 항목에는 마지막으로 조회한 요소의 `version`이 필수다. 서버의 현재 버전과 다르면 덮어쓰지 않고 409 `CANVAS_ELEMENT_VERSION_CONFLICT`를 반환한다. 수정에 성공하면 응답의 `version`이 1 올라가므로 다음 수정에는 그 값을 보낸다.

`groupId`는 한 페이지 안에서만 쓰는 묶음 식별자다. 다른 페이지의 요소가 이미 쓰는 `groupId`는 400 `INVALID_PAGE_REQUEST`로 거절한다. 미디어 소유권 검증이 아직 없으므로 `mediaFileId`를 보내면 생성·수정 모두 400 `MEDIA_FILE_NOT_SUPPORTED`로 거절한다. 미디어 API를 붙일 때 해당 다이어리 보관함 소속인지 검증한 뒤 허용한다.

일괄 변경은 하나의 트랜잭션으로 처리한다. `creates`, `updates`, `deleteElementIds`, `restoreElementIds`는 각각 최대 100개이며, 각 배열에 `null`은 넣을 수 없다. `creates`와 `updates`에 담긴 `propertiesJson`의 합계는 4MiB 이하다. 같은 요소를 한 요청에서 두 번 조작하면 전체 요청을 400으로 거절한다. 멀티파트 요청의 서버 전체 상한은 6MB다.

```json
{
  "creates": [{ "type": "STICKER", "x": 16, "y": 24, "w": 100, "h": 100 }],
  "updates": [{ "elementId": "element-uuid", "version": 3, "x": 80, "isLocked": true }],
  "deleteElementIds": ["old-element-uuid"],
  "restoreElementIds": []
}
```

## 오류

로그인하지 않은 요청은 401 `INVALID_TOKEN`이다. 잘못된 UUID·본문·범위·순서 목록은 400이다. 소유자·멤버가 아닌 사용자는 403 `DIARY_ACCESS_DENIED`를 받는다. 존재하지 않거나 삭제된 다이어리·페이지·요소는 404이며 각각 `DIARY_NOT_FOUND`, `PAGE_NOT_FOUND`, `CANVAS_ELEMENT_NOT_FOUND` 코드가 담긴 `application/problem+json` 응답을 반환한다. 활성 요소 복구는 409 `CANVAS_ELEMENT_NOT_DELETED`다. 보낸 `version`이 현재 버전과 다르거나 같은 요소를 동시에 수정해 낙관적 락 충돌이 나면 409 `CANVAS_ELEMENT_VERSION_CONFLICT`를 반환하며, 최신 페이지를 다시 조회한 뒤 재시도해야 한다. 페이지 설정 수정·순서 변경이 동시에 겹쳐 페이지 자체에서 충돌하면 409 `PAGE_VERSION_CONFLICT`다. `mediaFileId`를 보내면 400 `MEDIA_FILE_NOT_SUPPORTED`다.

인증 이전에 만들어져 `owner_user_id`가 비어 있고 `diary_members` 행도 없는 다이어리는 누구도 조회·수정할 수 없다. 운영 DB에 이런 행이 있는지 확인하고, 소유자 지정 또는 정리 정책을 정한 뒤 별도 Flyway 마이그레이션으로 처리한다. 임의 소유자를 채우지 않는다.

## 검증

```powershell
cd backend
$env:JAVA_HOME='C:\Users\SSAFY\.jdks\azul-17.0.20'
.\gradlew.bat test --tests com.f106.DIO.page.PageApiTests --no-daemon
```

통합 테스트는 H2에서 로그인 요구(401), 다른 사용자 접근 차단(403), 다이어리·페이지·요소 생성, Swagger 폼 입력과 OpenAPI 보안·스키마 노출, 프런트 별칭 변환, 요소 수정, 페이지 복제, 일괄 변경, 삭제·복구, 페이지 순서 변경, 배치 `null` 항목 거절, 다이어리 없음 404를 검증한다.

### 요소 생성 순서와 페이지 생성 재시도

기존 요소 생성 API와 batch의 `creates`는 선택적 숫자 `sortKey`를 받는다. 정수부 최대 10자리·소수부 최대 10자리이며 명시적 `null`은 400이다. 생략하면 서버가 현재 마지막 순서(최대값 + 1)에 배치한다. 지정하면 해당 레이어 순서로 저장한다.

페이지 생성 시 사용한 `templateConfig.clientPageRequestId`는 서버가 설정 수정·속지 변경 후에도 보존하는 생성 식별자다. 수정 요청에서 다른 ID로 교체하거나 기존 ID가 없는 페이지에 추가할 수 없다(400). 설정 변경 후 원래 생성 요청을 재시도하면 409 `PAGE_CREATION_CONFLICT`로 안내하며 중복 페이지는 만들지 않는다. 페이지 복제본은 원본의 생성 식별자를 물려받지 않는다.
