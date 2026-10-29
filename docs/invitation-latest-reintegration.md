# 245·248·250 최신 develop 재통합 결과

기준 develop: 56051132a6e3ea1a30c434e63165980f2403e324.
작업 위치: tmp/invitation-integration-latest. 기존 tmp/invitation-lookup-245 및 .worktrees/notification-backend 원본은 수정하지 않았다.

## 변경

- 최신 App의 손글씨·프로필·공유 fixture 진입을 유지하고 동일 sharing runtime과 인증 알림 gateway/callback만 연결했다.
- 최신 SharingHub의 초대 상세(detail) → 참여 프로필 흐름으로 연결했다. 이전처럼 상세를 건너뛰지 않는다. 최신 참여자 관리·소유권 이전 UI를 보존한다.
- 최신 EditorScreen의 읽기 모드와 permissionReadOnly 분리를 유지하고 이탈 guard만 추가했다.
- NotificationAuthenticationHttpTests와 SharingTestSupport에 테스트 전용 invitation-notification-h2.sql을 추가했다. 알림 payload_json·처리 이력 테이블을 제공하며 H2의 timestamp with time zone 문법을 사용한다. 제품 어댑터를 비활성화하지 않았다.
- 실제 React QA는 최신 참여 프로필 진입과 형식 확인 단계 제거에 맞춰 갱신했다.

## 검증

- 기존 H2 인증 HTTP 3개 + 이메일 초대 13개 = 16개 통과. 앞선 fixture 회귀 12개 실패 해소.
- FE 실제 gateway·세션 격리·알림 HTTP·공유 API·참여자 관리·공유 관리·읽기 모드 43개 통과.
- 최신 production 웹 export 성공.
- 격리 PostgreSQL 전체 migration·조회·생산자·경합·삭제 재전달·JWT·실제 FE 어댑터/React 수락·거절 종단 18개 통과. 실패·제외 없음. 기존 송신 mock 유지, 임시 서버 종료 확인.
- 최신 실제 EditorScreen 전용 QA에서 텍스트 입력 후 저장 중 이동 차단, 저장 완료 후 허용, localStorage 내용 보존 및 pageerror 0 확인.
- QA 전용 entry 빌드의 package.json 변경은 finally로 원문 복원했고 diff 없음.

## 남은 범위

공유 runtime canOpenDiary=false 정책과 가입 후 실제 공유 편집기 이동은 기존 제한이다. 전체 앱에서 편집→초대→다른 다이어리 전환을 한 번에 조작한 QA, 사진/테이프 자르기·저장 오류 브라우저 재현, 실기기, 초대 목록 순회 비용·오프셋 변경 한계, 사용자 비활성 동시성·이력 장기 정리는 남아 있다. OS 푸시는 별도 범위다.

2026-10-29 제출 선별 시 origin/develop을 다시 fetch했으며 기준 56051132와 동일했다. 기존 migration V1~V19는 변경하지 않고 신규 V20만 추가하며 버전 중복은 없다. 초대 토큰 경로가 QA 로그에 남지 않도록 요청·응답 경로 출력을 제거했다. 변경한 QA 스크립트 구문 검증을 통과했다. 과거 기준의 검토 문서 4개는 제출에서 제외하고 이 문서를 최신 결과로 사용한다. 로그·.expo·캡처·node_modules junction·output 실행기는 커밋 대상에서 제외한다. 커밋·푸시·실제 발송은 수행하지 않았다.


## !222 자동 리뷰 후속 검증

- 23b08ad 기준 pipeline 251508: backend-test, PostgreSQL auth/sharing/diary/lifecycle, secret-scan, ai-code-review 7개 모두 성공.
- INFO 4건 중 필드 주입은 기존 EntityManager·ApplicationEventPublisher 주입으로 충족. 생산자 now는 이미 Instant.now().truncatedTo(MICROS)이므로 이벤트 시각 정밀도도 충족한다.
- 이메일 DIRECT 초대는 expires_at 검사를 건너뛰고 상태만 판정하도록 수정. 레거시 만료값과 시간대에 따라 UTC 상한을 넘는 무기한 sentinel도 알림 생성을 막지 않는다. LINK의 만료 경계와 이벤트 시각 검증은 유지한다.
- 기본 CI에서 실행할 Mockito 핸들러 테스트 6건 추가: 과거 이메일 만료값, 시간대 sentinel, 취소, 부적격, 링크 만료 경계, 나노초 이벤트 거부 및 중복 재생성 방지. H2 기존 16건과 합계 22개 통과.
- 최신 develop 2880896을 merge해 개인 사본 onOpenCopy와 알림 onInvitationReady를 모두 보존. FE 관련 회귀 69개 통과, 웹 production export 성공. V20 번호 충돌 없음.
- PostgreSQL 경합·실제 React 종단 테스트는 기본 CI에 자동 연결하지 않았으며 별도 격리 실행이다. Mockito 테스트는 DB 동시성 검증을 대체하지 않는다.
- 최신 격리 PostgreSQL 실행은 기존 18건+신규 핸들러 6건=24개 모두 통과. 과거 expires_at을 가진 이메일 초대의 4개 동시 재전달, 실제 React 수락·거절 포함. 메일 mock 및 임시 서버 종료 확인.
