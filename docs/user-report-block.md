# 사용자 신고·차단 API 및 운영 연결

관련 Jira: S15P31F106-506, S15P31F106-507, S15P31F106-508, S15P31F106-509.

## 범위

사용자 신고만 제공한다. 기존 프론트 화면의 API 연결은 [신고·차단 프론트](./신고%20차단%20프론트.md)를 따른다. 관리자 웹·콘텐츠 필터링·계정 제재 실행은 포함하지 않는다.
신고 접수와 사용자 차단은 독립적이며 신고 건수로 자동 제재하지 않는다.
기존 다이어리 멤버·권한·작성물·공동 편집은 차단 여부와 무관하게 유지한다.
새 테이블은 `user_reports`, `user_blocks` 2개이며 V30 마이그레이션으로 생성한다.

## 인증·응답

모든 신규 API는 기존 세션 검증 JWT와 개발용 보조 인증 헤더를 그대로 사용한다.
신고자/차단자는 JWT에서 결정하며 본문으로 변경할 수 없다.
성공·입력 검증·도메인 오류·미인증 응답에 `Cache-Control: no-store`를 적용한다.
기존 공유 API 경로는 바꾸지 않는다.

| 기능 | Method | 경로 | 성공 |
|---|---|---|---|
| 사용자 신고 | POST | `/api/v1/reports` | 최초 201, 같은 요청 재시도 200 |
| 사용자 차단 | PUT | `/api/v1/me/blocks/{userId}` | 204 |
| 차단 목록 | GET | `/api/v1/me/blocks?page=0&size=20` | 200 |
| 차단 해제 | DELETE | `/api/v1/me/blocks/{userId}` | 204 |

## 신고 요청

`multipart/form-data`로 `report` JSON 파트와 선택 `evidenceFiles` 파일 파트를 전송한다.
JSON 파트 Content-Type은 `application/json`으로 지정한다.

```json
{
  "reportedUserId": 25,
  "diaryId": "733273ea-b906-4ed1-bb8c-88ceea920bab",
  "reasonCode": "HARASSMENT",
  "description": "반복적인 모욕",
  "clientRequestId": "f732f1e2-0905-4777-a1dd-50be13fdf81f"
}
```

- 본인 신고 불가. 접수 시 현재 공유 멤버 관계를 검증한다. 레거시 소유자도 기존 멤버 판정과 동일하다.
- description 최대 1,000자. OTHER이면 공백이 아닌 설명 필수.
- reasonCode: HARASSMENT, HATE_DISCRIMINATION, SEXUAL_CONTENT, THREAT_PRIVACY, CHILD_SAFETY, SPAM_FRAUD, RIGHTS_INFRINGEMENT, COLLABORATION_ABUSE, OTHER.
- 사진 없이 접수 가능. PNG/JPEG 최대 3장, 장당 입력 5MiB. 확장자/MIME만 신뢰하지 않고 디코딩 검증한다.
- 자원 보호를 위해 최대 8192px/1600만 화소를 허용한다. 재인코딩으로 부가 메타데이터를 제거하며 저장 결과는 20MiB 이하이다.
- clientRequestId는 사용자가 새 신고를 시작할 때 만들고 전송 재시도 동안 유지한다.
- 동일 신고자·요청 ID·정규화 내용/증빙 해시이면 기존 결과 반환, 다른 내용이면 409 REPORT_REQUEST_CONFLICT.
- 다이어리·사용자 잠금으로 동시 중복 요청을 직렬화한다.

응답:

```json
{"reportId":101,"status":"RECEIVED","createdAt":"2026-11-04T12:00:00Z"}
```

오류: 400 INVALID_REPORT(입력/자기 신고), 404 REPORT_TARGET_NOT_FOUND(대상 관계 없음),
409 REPORT_REQUEST_CONFLICT, 413 REPORT_EVIDENCE_TOO_LARGE, 415 REPORT_EVIDENCE_UNSUPPORTED.
기존 다이어리 접근 오류는 기존 DIARY_NOT_FOUND/DIARY_ACCESS_DENIED 계약을 유지한다.

## 증빙 보안

증빙은 기존 MediaStorage 연결을 사용하되 `media_files`에는 등록하지 않는다.
`evidence_json`에 provider, storageKey, mimeType, size만 보관하며 사용자 응답에는 포함하지 않는다.
미디어 목록·파일 API로 증빙에 접근할 수 없다. S3 퍼블릭 차단과 운영자 IAM 접근 제한은 배포에서 유지해야 한다.
로컬 파일은 기존 MEDIA_LOCAL_DIRECTORY 아래에서 보관한다.
운영자는 권한 있는 DB/저장소 도구로 신고에 해당하는 파일만 검토한다. 신규 공개 증빙 다운로드 API는 없다.
트랜잭션 롤백 시 생성한 증빙을 정리한다. 외부 저장소 장애로 정리까지 실패하면 식별정보 없는 경고를 남기므로 운영 확인이 필요하다.

## 차단 요청·목록

PUT 본문: `{"diaryId":"UUID"}`. 신규 차단은 해당 다이어리 현재 멤버만 가능하며 자기 차단은 불가하다.
이미 차단한 경우 성공하며, 해제는 다이어리 탈퇴 후에도 가능하다.
GET page >= 0, size 1~100. 최근 차단 시각 내림차순·대상 ID 오름차순.

```json
{"items":[{"userId":25,"nickname":"다이어리 친구","blockedAt":"2026-11-04T12:00:00Z"}],"page":0,"size":20,"hasNext":false}
```

계정 닉네임을 사용하고 탈퇴/비활성 계정은 `탈퇴한 사용자`로 표시한다. 차단 해제는 상대의 역방향 차단을 제거하지 않는다.

## 기존 공유 응답·수락 변경

- GET `/api/v1/diaries/{diaryId}/members`: 각 멤버에 `blockedByMe` boolean 추가. 상대가 나를 차단했는지는 공개하지 않는다.
- POST `/api/v1/diaries/{diaryId}/invites/email`: 초대자·수신자 중 어느 쪽이 차단했든 초대/알림 생성 안 함. 기존 공통 202 응답 유지.
- 이메일 초대 수락도 차단 중에는 409 INVITE_UNAVAILABLE. 초대를 자동 취소하지 않으므로 해제 후에도 유효한 초대는 수락 가능하다. 취소·만료된 초대는 복구하지 않는다.
- GET `/api/v1/invites/{token}`: `requiresBlockedMemberConfirmation` 추가. 비로그인은 false이며 로그인한 본인이 차단한 현재 멤버에 대해서만 true.
- POST `/api/v1/invites/{token}/accept`: 선택 본문 `{"acknowledgeBlockedMembers":true}` 추가. 생략/false 기본값.
- 본인이 차단한 멤버가 있으면 false일 때 409 BLOCKED_MEMBER_CONFIRMATION_REQUIRED, true면 기존 정원·권한 검사 후 참여.
- 상대가 나를 차단한 이유만으로 링크 참여 거절하지 않는다. 서로 차단했다면 내 차단도 있으므로 확인 후 참여한다.
- 기존 멤버의 중복 수락은 새 참여가 아니므로 경고 확인을 다시 요구하지 않는다.
- 이메일 발송/수락·차단 관계 변경은 사용자 행을 정렬해 잠그므로 동시 요청에도 직렬화된 결과를 적용한다.

## 메일 설정·재시도

```ini
REPORT_NOTIFICATION_ENABLED=true
REPORT_NOTIFICATION_TO=dioapp.official@gmail.com
```

기존 SIGNUP_MAIL_FROM 및 SPRING_MAIL_*를 사용한다. 실제 비밀값은 저장소에 넣지 않는다.
Compose dev/prod에서 메일 활성화·수신처·증빙 첨부 변수를 전달한다. 기본 false이므로 활성화 전에는 신고만 저장되고 메일은 대기한다.
SMTP 작업은 전용 단일 스레드·유한 큐에서 실행해 공동 편집/세션 점검 스케줄러를 막지 않는다. 진행 중에는 추가 작업을 누적하지 않는다.
기본 시작 10초 후, 60초 간격으로 커밋된 전송 대상 최대 20건을 조회한다.
기본 메일에는 신고 번호·사유·신고자/대상 ID·접수 시각을 포함한다. 설명·공개 URL은 전송하지 않는다. 증빙 첨부는 아래 별도 설정과 활성화 전 개인정보 확인 절차를 따른다.
실패 시 PENDING/FAILED 행을 재시도하며 시도 횟수와 다음 시각을 기록한다. 최초 실패 후 120초, 최대 1시간 이내 간격으로 재시도한다.
여러 인스턴스에서는 신고 행 잠금으로 같은 건의 동시 전송을 막는다.
SMTP 전달 성공 직후 프로세스/DB가 실패하는 경우 중복 메일 가능성은 있으므로 운영자는 신고 번호로 식별한다. 정확히 한 번 전송을 보장하지 않는다.

## 운영 처리 기반

ReportReviewService는 외부 API가 아닌 내부 서비스이며 검토·처리 결정과 담당자/시각/판단 근거를 history_json에 누적한다.
상태: RECEIVED, REVIEWING, RESOLVED, DISMISSED.
조치: NONE, WARNING, CONTENT_RESTRICTED, TEMP_SUSPENSION, PERMANENT_SUSPENSION.
신고 누적은 검토 자료이며 개수 기반 자동 정지하지 않는다.
이 서비스의 조치 기록만으로 실제 계정 정지·콘텐츠 삭제를 실행하지 않는다. 실제 조치가 끝난 뒤 운영 경로에서 기록해야 한다.
관리자 웹/API, 제재 실행·만료 해제, 사용자 결과 통지 연결은 별도 작업이다. 직접 SQL 수정은 도메인 검증/이력 기록을 우회하므로 변경 내역과 실제 조치를 함께 관리해야 한다.
신고·증빙 보관 기간은 미확정이며 자동 삭제 배치를 임의로 추가하지 않았다. 출시 전 처리방침과 함께 확정해야 한다.

## 검증

```powershell
cd backend
.\gradlew.bat test --tests 'com.f106.DIO.sharing.*'
```

실제 PostgreSQL 마이그레이션 검증은 DIO_MODERATION_POSTGRES_TEST=true와 로컬 DB_URL/POSTGRES_USER/POSTGRES_PASSWORD를 설정한 뒤
`test --tests 'com.f106.DIO.moderation.ModerationMigrationPostgresTests'`로 수행한다.
테스트는 임의 moderation_qa_ 스키마에 전체 Flyway를 적용하고 자신의 스키마만 제거하며 기존 테이블 데이터를 지우지 않는다.


## 최신 develop 화면과의 통합

프론트는 develop의 `SafetyProvider`/`safetyApi`/`reportBody`를 그대로 사용한다. 이전 로컬 어댑터와 중복 연결하지 않는다.
API 응답의 items/page/size/hasNext, reportId/status/createdAt, 멤버 blockedByMe 계약을 실제 백엔드와 맞춘다.
신고·차단 경로에만 AUTH_ALLOWED_ORIGINS 기반 CORS를 적용하고 프론트의 Cache-Control 요청 헤더를 허용한다.
다른 도메인의 CORS 설정이나 화면 디자인은 변경하지 않는다.
개발 서버의 DEVELOPMENT_ACCESS_REQUIRED 401은 회원 토큰 refresh로 재시도하지 않고 기존 코드로 전달한다.

## 운영자 메일 증빙 첨부

- `REPORT_NOTIFICATION_ATTACH_EVIDENCE=true`이면 신고에 저장된 비공개 PNG/JPEG를 운영자 메일에 실제 파일로 첨부한다. 공개 URL·S3 키·이메일 주소·신고 상세 설명은 메일 본문에 추가하지 않는다. 사진은 이메일 프로그램에서 첨부파일로 열거나 내려받아 확인한다.
- 기본값은 `false`. 기존 `REPORT_NOTIFICATION_ENABLED`, `REPORT_NOTIFICATION_TO`, SMTP 설정은 그대로 사용한다. 서버 환경 파일에 설정하고 백엔드를 재시작한다. 프론트 환경변수·새 API·테이블은 필요 없다.
- 최대 3장, 메일용 파일은 장당 4MiB 이하. 큰 증빙은 메일에만 축소 PNG(`-preview`)를 보내고 서버 원본을 변경하지 않는다. 원본 확인은 기존 운영 절차를 따른다.
- 사진 읽기·검증·메일 전송 실패 시 접수는 유지되고 기존 알림 재시도를 사용한다. 이미 `SENT`인 과거 알림을 자동 재발송하지 않는다.

### 첨부 기능 활성화 전 개인정보 확인

사진 첨부 자체가 일률적으로 금지되는 것은 아니지만, 개인 Gmail로 앱 증빙을 자동 전송하면 사진 속 타인의 정보와 민감한 내용도 외부에서 처리될 수 있다. 신고자의 사진 제출만으로 사진 속 모든 정보주체의 국외 이전 동의가 확보되는 것은 아니다.

운영자는 처리 목적·필요 최소 범위, 위탁에 해당하는 경우 개인정보 보호법 제26조의 계약·공개 요건, 국외 이전에 해당하는 경우 제28조의8의 적법한 근거와 고지 항목을 확인한 뒤 활성화한다. 기존 방침의 ‘이용자가 문의 메일에 첨부’ 설명만으로 ‘앱에서 제출한 증빙의 자동 Gmail 전송’까지 충족했다고 가정하지 않는다. 필요하면 앱 안내·개인정보처리방침을 개정하고 요구되는 동의 절차를 먼저 적용한다. 이 변경에서는 공개 법적 문서·동의 버전을 임의로 변경하지 않는다.

운영자 지정 메일함만 이용하고 접근을 제한하며, 후속 처리 종료 시 메일함·휴지통·내려받은 사본을 함께 정리한다. 분쟁 대응 등 별도 보존이 필요한 경우 근거와 기간을 구분한다. Gmail 내부 삭제·백업 처리 기간까지 DIO가 보장하는 것은 아니다.

근거: [개인정보 보호법 제28조의8](https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033215841), [제26조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335233), [Gmail 첨부 한도](https://support.google.com/mail/answer/6584?hl=ko).
