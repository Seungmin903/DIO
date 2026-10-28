# 계정 다이어리 수정·권한·충돌 계약

기준: 2026-10-27 develop `b7a626ca740a840f5d5178db091b6fdfc039083c`, 작업 브랜치 `feature/common/diary-auth-read`.
Veloci 담당 7개 중 생성·목록·상세에 이어 메타데이터 수정을 구현했다. 휴지통·복원·영구 삭제는 후속이다.
[P0·P1](./diary-auth-read-contract.md), [생성 계약 및 이전 검증 이력](./diary-create-contract.md)과 함께 읽는다.

## PATCH /api/v1/diaries/{diaryId}

기존 로그인 JWT 및 활성 세션 검증을 재사용한다. UUID 경로이며 소유자만 수정할 수 있다.

```json
{
  "expectedVersion": "1",
  "diaryTitle": "여행 기록",
  "coverColor": "#CED9EE",
  "coverStyle": "LINEN"
}
```

- expectedVersion은 필수 양의 BIGINT **문자열**: 1~9223372036854775807, 선행 0·숫자 JSON·소수·지수 표기 불가.
- diaryTitle, coverColor, coverStyle 중 하나 이상. 생략은 유지, 명시적 null·알 수 없는 필드·잘못된 형식은 400.
- 이름은 앞뒤 공백 제거 후 1~100자, 제어문자 금지. 색은 #RRGGBB로 대문자 정규화.
- 패턴은 PLAIN/LINEN/LEATHER/DOT/GINGHAM/STRIPE. visibility·즐겨찾기·owner·페이지·서식은 수정 대상이 아니다.
- 200 `{ diary: DiaryReadItem }`, Cache-Control: no-store. 읽기와 동일한 전체 DTO이며 version이 1 증가한다. 목록·상세·생성 응답에도 version 문자열을 필수로 포함한다.
- 서버가 수락한 PATCH는 값이 기존과 같아도 버전을 증가시킨다. FE는 실제 변경 항목이 없으면 요청하지 않는다.
- PATCH에 Idempotency-Key를 요구하거나 생성용 키를 재사용하지 않는다.

| 상태 | 의미 |
|---|---|
| 400 | 잘못된 UUID, expectedVersion 또는 수정 입력 |
| 401 AUTHENTICATION_REQUIRED | 로그인·활성 세션 확인 필요 |
| 403 DIARY_OWNER_REQUIRED | 접근 가능한 EDITOR의 수정 시도 |
| 404 DIARY_NOT_FOUND | 없는 다이어리, 비참여·탈퇴·강퇴·삭제 상태 |
| 409 VERSION_CONFLICT | 현재 version과 expectedVersion 불일치 |
| 409 VERSION_EXHAUSTED | BIGINT 최댓값으로 더 이상 증가 불가 |

## 권한과 원자성

READ_COMMITTED 트랜잭션 안에서 다이어리 행, 요청자 membership 순으로 잠근다. 잠금 후 기존 상세 접근 정책과 OWNER 권한을 다시 검사하고, 현재 version을 비교한다. SQL의 owner_user_id·deleted_at·version 조건도 일치해야 저장된다. updated_at과 이름·표지·version은 함께 반영하며 페이지·다른 회원·즐겨찾기·visibility는 변경하지 않는다.

권한을 먼저 검사하므로 EDITOR가 다른 버전을 보내도 403이다. 같은 버전으로 동시 저장하면 한 번만 성공하고 나머지는 409다. 권한 원장은 diaries.owner_user_id다. 기존 조회의 소유자 membership 누락 호환 정책은 유지한다. 소유권 이전·강퇴 등 공유 구현을 가져오지 않았으며, 팀 통합 시 공유 쓰기도 같은 잠금 순서와 원장을 따라야 한다.

## FE 충돌 복구

계정 보관함의 소유자 수정 버튼 및 상세의 수정 버튼에서 최신 GET 후 폼을 연다. 이름·표지만 제공하고 페이지 방향·내지 변경은 표시하지 않는다. 기기 보관함·목 API의 기본 동작은 유지한다.

- 원래 폼과 비교해 사용자가 바꾼 항목만 PATCH한다. 충돌 후 다른 사람이 바꾼 나머지 항목은 보존한다.
- 409 시 입력을 유지하고 저장을 막는다. 사용자가 **최신 정보 확인**을 눌러 현재 이름·표지를 확인한 뒤 **변경 저장**을 명시적으로 눌러야 재요청한다. 최신 version으로 자동 저장하지 않는다.
- 네트워크 오류나 응답 유실 시 입력을 잠그고 같은 입력·expectedVersion으로 재시도한다. 서버가 이미 저장했다면 재시도는 409이며 최신 정보 확인으로 이어진다. 수정 요청을 새 생성 요청으로 바꾸지 않는다.
- 401·403·404는 추가 저장을 막는다. 계정 전환·언마운트 후 지연 응답은 무시한다. 창을 닫고 여는 동안 미확인 수정은 원래 폼에 보존하지만 앱 재시작까지 영속화하지는 않는다. 재시작 후에는 최신 GET부터 다시 시작한다.
- 삭제·일괄 관리·원격 캔버스 편집 기능은 이 단계에서 활성화하지 않는다.

## 저장 데이터와 배포 순서

신규 V10__add_diary_metadata_version.sql이 diaries.version BIGINT NOT NULL DEFAULT 1 및 양수 제약을 추가한다. 기존 행은 1로 시작한다. JPA 내부 저장 경로도 @Version으로 갱신하며 외부 PATCH는 SQL CAS로 갱신한다. pages.version과 독립적인 메타데이터 버전이다.

V9 생성 응답 영수증 중 version이 없는 JSON에는 최초 생성 버전 문자열 "1"만 추가한다. 저장된 제목·표지·첫 페이지 등 생성 스냅샷, 요청 해시·키·TTL은 그대로다. JSON 재직렬화로 문자열의 공백·키 순서는 바뀔 수 있다. 신규 생성과 재사용 응답은 version을 포함하며 현재 수정값은 GET으로 확인한다. 만료되어 본문이 지워진 영수증은 건드리지 않는다.

V10 적용 → BE → FE 순으로 반영해야 한다. 새 FE는 version 없는 구 서버 응답을 유효한 편집 데이터로 받아들이지 않는다. 이미 적용된 V1~V9는 수정하지 않았다. 다른 세션의 migration을 복사하거나 번호를 바꾸지 않았다. 통합 직전 develop의 V9·V10 점유 여부를 확인하고, 충돌하면 **아직 제출하지 않은 이번 신규 migration** 번호만 조정하고 검증해야 한다. 롤백 시 새 열·영수증 테이블을 삭제하지 않는다.

## 검증 기록

2026-10-27 로컬 검증:

| 범위 | 결과 |
|---|---|
| 전체 BE 회귀 | 247개 중 201 통과, 조건부 46 제외, 실패 0 |
| 수정 실제 HTTP | H2 8개 통과: OWNER·403/404·엄격한 요청·문자열 BIGINT·재시도·6개 동시 요청 단일 성공·CORS/OpenAPI |
| PostgreSQL 17 | 생성 10 + 조회/저장 4 + 수정 8 = 22개 통과 |
| 기존 DB 업그레이드 | 별도 스키마 V1~V9 데이터에서 V10 적용, 기존 다이어리/생성 영수증 보존 1개 통과 |
| FE 영향 범위 | 136개 통과, 실패·제외 0. 실제 Spring 조회·생성·수정 JSON 소비 포함 |
| Expo 웹 번들 | 성공 |
| Edge 수정 QA | 1280×800, 1024×768, 412×892, 667×375: 입력 보존·명시적 충돌 확인·부분 저장·403 차단, pageerror 0 |
| Edge 공용 생성 모달 회귀 | 동일 4개 크기: 응답 유실→재실행→같은 키 복구·기기 자료 보존, pageerror 0 |

PostgreSQL 최초 실행에서 업그레이드 테스트용 users fixture에 nickname_key가 빠져 해당 1개만 실패했다. 제품 코드나 migration 실패가 아니며 fixture 보완 후 업그레이드 테스트만 재실행해 통과했다. 이미 통과한 나머지 22개는 반복하지 않았다. 전체 BE 이후 변경은 이 조건부 PostgreSQL 테스트 fixture와 문서뿐이다.

증거는 워크스페이스 `tmp/diary-update-20261027-230634/`의 backend-full.log·backend-full-result.json·current-postgres-schema-test.log·migration-postgres-schema-test.log·frontend.log·spring-read.json·spring-create.json·spring-update.json·web-build.log·browser-update.log·browser-create-regression.log에 있다. 화면은 이 checkout의 `frontend/qa/.out/diary-update/`, `frontend/qa/.out/diary-create/`에 있다. 브라우저 QA는 실제 Spring 응답 형태를 사용하는 HTTP fixture이며 공유 서버 end-to-end 결과는 아니다.

```powershell
# BE 실제 응답을 FE 계약 소비에도 사용한다.
$env:DIO_DIARY_UPDATE_CONTRACT_OUTPUT = Join-Path $env:TEMP 'dio-update-contract.json'
cd backend
.\gradlew.bat test --tests 'com.f106.DIO.diary.DiaryUpdateHttpTests' --rerun-tasks
cd ../frontend
pnpm run test:diary-update
# 브라우저 fixture에는 생성 HTTP 테스트에서 생성한 DIO_DIARY_CREATE_CONTRACT_OUTPUT도 필요하다.
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8080/api'
pnpm exec expo export --platform web --output-dir .expo/diary-auth-web
pnpm run qa:diary-update
```

PostgreSQL 생성·수정 테스트는 DIO_DIARY_CREATE_PG_QA=true, DB_URL/POSTGRES_USER/POSTGRES_PASSWORD와 DB 이름 dio_diary_create_qa를 요구한다. 테스트가 fixture 행을 정리하므로 전용 폐기 가능한 DB만 사용한다. 이번 검증은 독립 클러스터를 만들고 종료했으며 기존 서버에는 접속하지 않았다.

## 보존과 남은 범위

원본·248·다른 세션 8개 작업 폴더의 HEAD·브랜치·인덱스·추적/비무시 파일 해시는 시작 시점과 동일하다. preservation-before.json, preservation-after.json, preservation-check.json에 기록했다. 마무리 시 원격 develop도 b7a626c로 동일했다. 본 브랜치의 기존 생성·조회 변경 위에 수정 구현만 추가했으며 HEAD·인덱스는 그대로다. 커밋·푸시·MR 생성은 하지 않았다.

휴지통·복원·영구 삭제, 공유/초대/248·소유권 이전의 실제 연동, 원격 페이지 편집, Android/iOS 실기기·VoiceOver/TalkBack, 공유 서버·운영 데이터·원격 CI·배포는 미검증/후속 범위다. 이번 4개 API 구현으로 담당 7개 전체가 완료된 것은 아니다.


후속 상태 갱신: [휴지통 이동·복원](./diary-trash-contract.md)을 구현했다. 위 검증 기록은 해당 단계 당시 이력으로 유지하며, 최신 계약과 영향 범위 검증은 휴지통 문서를 따른다. 영구 삭제는 후속이다.


2026-10-28 후속 갱신: [영구 삭제](./diary-permanent-delete-contract.md)를 OWNER·휴지통 상태·하위 원자 정리·완료 기록 재시도로 구현했다. 사용자는 공용 미디어 원본을 보존하고 다이어리 참조만 정리하는 기준을 확정했다. 위 내용과 검증 수치는 해당 단계 당시 이력이며 최신 동작·검증은 영구 삭제 문서를 따른다.

## 2026-10-28 제목 정규화 보완

BE도 FE의 ECMAScript trim과 같은 유니코드 공백 기준으로 양끝을 제거한 뒤 제목 필수·길이를 검증한다. NBSP·BOM 등을 포함한 공백만 있는 제목은 400이다. [최종 리뷰 수정·CI 검증](./diary-review-fixes-ci.md)에 회귀 결과와 CI 연결을 기록했다.
