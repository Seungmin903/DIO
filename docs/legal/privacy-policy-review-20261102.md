# 개인정보처리방침 별도 개정본 검토 기록

기준일: 2026년 11월 2일. 문서 작업이며 앱 동작·약관 버전·API·DB·공개 URL 설정을 변경하지 않았다.

## 보존한 원본과 새 파일

- 참고 원본: [2026-10-21 기기 저장 중심 Google 문서](https://docs.google.com/document/d/1JxZvkpKiEl7GXpVThQYxck0l_bwzg33FxGShE6rpqd0/edit). 읽기만 했으며 수정 시각 2026-10-22T01:55:19.639Z가 작업 전후 동일함을 확인했다.
- 새 문서: [별도 개정 검토본](https://docs.google.com/document/d/1f5PlI34AVt5plRXmW4IeR3sWz2nvCAgqcipV3p1FZHk/edit). 원본과 다른 문서 ID이며 ChatGPT 폴더에 보관한다. 링크 공개·게시 전환은 하지 않았다.
- 새 로컬 원본: [privacy-policy-revised-20261102.md](v2/privacy-policy-revised-20261102.md).
- 새 게시용 파일: [privacy-policy-revised-20261102.html](v2/privacy-policy-revised-20261102.html).
- 기존 `v2/privacy-policy.md`와 `.html`은 이 별도 개정본 작성 과정에서 수정하지 않았다. 기존 문서·앱 링크를 자동으로 교체하지 않는다.

## 이번에 채운 사항

1. 운영자·책임자·고충처리 담당자 신승민, 문의 이메일, 사용자 지정 시행일 2026년 11월 2일.
2. 원문이 정한 문의·신고의 답변과 후속 처리 완료 후 Gmail 휴지통에서도 삭제, 팀 PC·Drive 별도 사본 미보관 정책. 자동 삭제 프로그램이 구현됐다는 뜻은 아니다.
3. 회원·서버 저장·공동 편집이 있는 현재 구조. ‘모든 자료가 기기에만 있고 서버 전송이 없다’는 과거 설명은 새 문서에서 사용하지 않음.
4. Android 손글씨 폰트 생성은 기기 내 추론이며 자동 서버 업로드·계정 동기화가 아님. Expo Go와 실제 생성 지원 빌드를 구분.
5. SAM 2 대상 분리는 이용자가 선택한 이미지가 백엔드를 거쳐 AI 서버로 가는 경로와 구분. 모델 다운로드와 이용자 사진의 외부 모델 업체 전송을 혼동하지 않음.
6. 단순 배경색 분리, 기기 권한, 내보낸 사본·PDF 임시 사본, 공유 사진 공개 범위와 권리행사 경로.
7. 앱 화면 광고 미게재, 광고용 추적 미운영, 선택 광고 메일·푸시는 실제 구현 후 별도 동의. 다이어리·사진·필기의 광고 분석·홍보 재사용·모델 재학습을 포괄 허용하지 않음.
8. 코드로 확인한 인증정보·세션·동의 기록·탈퇴·파일 삭제의 기준. 배포 환경에서 실행이 확인되지 않은 정리를 완료된 사실처럼 표현하지 않음.

## 코드·근거 확인 위치

- `docs/personal-handwriting-font.md`: Android 기기 내 생성, Expo Go 한계, 자동 업로드·계정 동기화 없음.
- `backend/src/main/resources/application.yml`: 사진 분리 서버 연결과 임시 세션, 미디어 삭제 기본 24시간 및 자동 정리 기본 비활성 설정. 환경변수의 실제 값은 추정하지 않음.
- `auth/service/ExpiredVerificationCleanup.java`: 인증번호·후속 토큰 만료 후 24시간이 지난 행 정리.
- `auth/service/ExpiredLoginSessionCleanup.java`: 만료 세션·회전 이력 정리.
- `user/service/UserWithdrawalService.java`, `user/repository/UserWithdrawalDataRepository.java`, `sharing/service/UserWithdrawalDiaryAdapter.java`: 탈퇴 시 동의 행 삭제·로그인 자격 정리·개인 다이어리 삭제·공유 작업 보존·초대 폐기.
- `push/service/PushRegistrationCleanup.java`: 만료 응답 암호문 정리와 요청 이력 존속의 구분. 등록 이력 전체가 자동 삭제된다고 약속하지 않음.
- `collaboration/service/CanvasChangeJournal.java`: 상세 스냅샷과 중복 요청 식별 이력의 구분. 전체 이력의 80건/80일 일괄 삭제 약속 없음.
- `frontend/src/editor/utils/pdfFileSave.js`: PDF 공유용 임시 사본 24시간 만료·후속 정리.
- [개인정보 보호법 제30조](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1034292763): 목적·기간·위탁·파기·권리행사·책임자·자동 수집 등 방침 기재 항목. 제15조·제21조·제26조·제28조의8 등에 맞춘 처리 근거·실제 위탁·이전 검토도 필요하다.
- [개인정보보호위원회 안내서 목록](https://pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS217&mCode=D010000000): 최신 작성지침·표준안 확인 경로. 이번 작업에서 작성지침 PDF 전문을 확보해 전 항목 대조한 것으로 표현하지 않는다.
- [Google 개인정보처리방침](https://policies.google.com/privacy?hl=ko): Gmail 일반 처리 설명 참고. 그 문서만으로 DIO의 이전 국가·계약상 근거를 확정하지 않음.

## 공개 전에 남은 사항

새 문서 제12조의 5개 행만 실제 운영 사실에 맞춰 확정한다. 인프라는 업체·국가·로그·백업·설정 사실을 제공하고, 운영자와 기능 담당자는 푸시·초대·알림·작업 식별 이력의 필요 최소 보관·삭제 정책을 정한다. 후자를 인프라가 법적으로 결정해야 하는 문제로 넘기지 않는다.

공유 자료의 표시 범위와 법적 처리 근거, 연령 자기확인의 적정성은 기능 제공 형태와 이용자 대상에 맞춰 출시 전에 검토한다. 새 문서·HTML 생성은 국외 이전 동의나 개별 기능 동의의 구현을 대신하지 않는다. 공개 시 내부 검토표를 사용자용 조항으로 치환하고, 원문 방침의 이력과 실제 적용일을 함께 제공한다.

## 검증

별도 MD·HTML 생성, 정보 표 3개와 13개 조항을 확인했다. Google Docs로 변환한 새 문서를 읽어 내용과 네이티브 표 3개가 존재함을 확인했다. HTML에 스크립트를 추가하지 않았다. 원본 Google 문서는 쓰기 호출 대상에 포함하지 않았다.

## 앱·설정에서 추가 확정한 사항

2026년 11월 2일 후속 확인으로 별도 개정본과 HTML·새 Google 문서만 보완했다. 기존 원본과 `privacy-policy.md/html`은 수정하지 않았다.

- `frontend/src/shared/appLock.js`와 `frontend/App.js`의 실제 연결을 확인해 과거의 ‘별도 앱 잠금 없음’ 설명을 수정했다. 현재 앱은 4자리 PIN의 salt+SHA-256 검증값을 계정별 기기 저장소에 보관한다. 전체 자료 암호화나 생체인증이라고 표현하지 않는다.
- `frontend/src/auth/authApi.js`는 서버 로그인 토큰을 메모리에 둔다. `developmentAccessStore.js`의 SecureStore는 개발 서버 접속 자격용이므로 일반 로그인 토큰 영구 보관이라고 혼동하지 않는다.
- `push/security/PushSecrets.java`의 AES-GCM과 `auth/config/AuthPasswordConfig.java`의 BCrypt를 확인했다. DB·S3·백업 전체의 저장 암호화가 확인된 것으로 확대하지 않는다.
- `ai/app/segmenter.py`는 임시 이미지·특징을 메모리 캐시에 최대 32개 보관하고 기본 마지막 사용 후 1800초 초과를 후속 `get`에서 만료 처리한다. 타이머가 없어 정확한 30분 삭제 보장은 하지 않는다. `main.py`의 결과 PNG는 BytesIO로 반환하며 영구 파일 쓰기 경로는 없다. 업로드 프레임워크·호스팅의 별도 임시 파일·로그·스왑까지 무저장이라고 단정하지 않는다.
- `infra/compose/compose.prod.yml`, `compose.dev.yml`은 PostgreSQL DB 연결과 S3 기본 저장소·서울 기본 리전, 미디어 삭제 유예 24시간·자동 정리 기본 비활성 값을 정의한다. 실행 중 배포 서버의 실제 환경변수나 AWS 설정을 읽은 것은 아니다.
- `infra/nginx/prod/default.conf`, `dev/default.conf`에 HTTPS·TLS 1.2/1.3이 있다. 운영 기본 HTTP는 HTTPS로 전환한다. 실제 적용·인증서 만료·관리자 권한은 별도 확인한다.
- 미디어 정리는 활성화 시 기본 1시간 주기, 탈퇴 사진은 기본 5분 주기 재시도다. 푸시 최초 등록 응답 암호문은 24시간 만료 후 기본 1분 주기 정리 대상이지만 요청 이력은 남는다. 알림 watermark 정리는 알림 본문 전체 자동 삭제가 아니다.
- `docs/push-device-isolated.md` 및 실제 push 패키지에는 기기 등록·계정 연결·폐기 경로가 있고 외부 전송 워커·대기열 생산·앱 토큰 등록 연동은 아직 없다. 현재 앱 직접 의존성에도 expo-notifications가 없다. Expo 토큰 형식을 받는다는 이유로 Expo/FCM/APNs에 실제 개인정보 전송을 수행한다고 기재하지 않는다.
- 앱 직접 의존성·앱 코드에서 Sentry/Firebase Analytics/Google Analytics/Amplitude/Mixpanel 등의 연결은 발견하지 못했다. 개발 도구·서버·배포 CDN의 수집 도구까지 조사 완료한 것은 아니다.

### 남은 질문의 담당 구분

인프라에는 실제 업체·계약 주체·서버/버킷/AI 위치·복제·SMTP 계정 종류·로그/백업 보관 및 설정 적용만 확인한다. AI 기본 캐시·암호화 방식·푸시 구현 유무 등 코드로 확인한 내용을 다시 결정해 달라고 요청하지 않는다. 초대·알림·푸시 요청·작업 식별 이력의 일괄 삭제 기준은 현재 자동 정리 경로가 없어 운영자와 기능 담당자가 정책·구현을 정해야 한다. 문서에 임의 기간을 적는 것으로 해결하지 않는다.

## 최신 develop pull 후 재확인 — c6dff2d0

이 절은 위의 이전 코드 확인 중 ‘푸시 발송 미연결’ 결론을 대체한다. 로컬 develop을 원격 c6dff2d0까지 fast-forward pull해 확인했다. 검토 후 feature/be/signup-consent로 돌아와 보존한 문서 상태를 복원했다. 가입 브랜치에 develop을 병합한 것은 아니다.

- `push/service/ExpoPushGateway.java`, `PushDeliveryWorker.java`: 외부 Expo 전송·receipt 조회가 구현됐다. 토큰·일반 초대 안내·inviteId를 전송하며 다이어리 본문·사진·수신자 이메일을 포함하지 않는다. 서버 delivery 기본값은 false다.
- `frontend/src/notifications/pushRuntime.native.js`: expo-notifications를 통한 토큰 등록·초대 클릭 처리가 추가됐다. `EXPO_PUBLIC_PUSH_ENABLED=true`일 때만 시작한다. 실제 기기·배포 활성화는 이번 검토로 확정하지 않는다.
- `push/service/PushQueueRetention.java`: 초대 outbox·자식 전달 기록 중 만료되고 모두 최종 처리 후 30일이 지난 적격 항목을 제한 배치로 삭제한다. CREATED 중복 방지 영수증·환경/앱 범위 등의 조건이 있다. 진행 중·receipt 대기·잠긴 항목은 보류할 수 있다.
- `push/config/PushQueueRetentionSchedule.java`: `dio.push.queue-retention.enabled=true`일 때만 정리한다. 기본 1분 주기다. 중복 방지 receipt, notifications, 설치·등록 요청 이력까지 지우는 작업이 아니다.
- `notification/repository/NotificationRepository.java`와 `NotificationDeleteService.java`: 목록은 활성 행을 조회하고 삭제는 deleted_at 표시다. 30일 후 알림 본문 전체를 지우는 스케줄은 확인되지 않았다. `docs/push-notification-flow.md`의 ‘알림과 같은 30일’ 표현만으로 실제 알림 물리 삭제가 구현됐다고 판단하지 않는다.
- 공유 초대 저장소, 탈퇴 어댑터, 공동 편집 journal은 초대 상태 변경·탈퇴 개인정보 정리·다이어리 영구 삭제 및 최근 스냅샷 정리는 제공한다. 초대 원본·작업 식별 기록의 기간 기반 전체 정리 기준은 별도다.
- 사용자가 문의·회원가입·비밀번호 재설정에 모두 개인 Gmail을 사용한다고 확인했으므로 계정 종류를 더 이상 미정으로 두지 않았다. Google 측 국외 처리 국가·보관 기간·이전 근거까지 자동 확정하지 않는다.

검토는 소스·설정 확인이며 배포 서버·외부 발송·DB 정리 실행 테스트는 하지 않았다. 앱·API·DB 구현 변경이나 새 마이그레이션은 추가하지 않았다.
