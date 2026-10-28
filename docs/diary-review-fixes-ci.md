# 다이어리 최종 리뷰 수정과 CI 검증

2026-10-28 기준. 전용 브랜치 `feature/common/diary-auth-read`에 최신 원격 develop `2de27fd6528b6c73186d671cda5fcdef9c3da020`을 fast-forward로 반영했다. 새 커밋·푸시·MR 생성은 하지 않았다. 기존 미커밋 구현과 문서 색인의 양쪽 항목을 보존했다. 이전 문서의 기준·검증 이력은 해당 실행 시점의 기록으로 유지한다.

## P2 두 건 수정

- **유니코드 공백 제목:** 생성·수정 요청의 제목을 BE에서도 ECMAScript `String.trim()`과 같은 공백 기준으로 정규화한 뒤 검증한다. NBSP·figure space·narrow NBSP·BOM 등으로만 구성된 제목은 400, 제목 양끝의 해당 공백은 제거된다. 저장된 제목 때문에 FE가 전체 목록을 거부하는 경로를 차단했다. 기존 운영 데이터는 수정하지 않았으며, 이미 저장된 비정상 제목이 있다면 별도 조회·정리 대상이다.
- **기존 목 휴지통의 영구 삭제 버튼:** 목 응답과 어댑터에 `canPermanentlyDelete`를 명시해 휴지통 행의 버튼·취소·실패 재시도 동작을 복구했다. 서버 응답에 대한 공통 화면의 명시적 권한 검사는 유지한다. 목에는 실제 OWNER 보안 모델이 없으므로 기존 목 동작을 유지하는 범위다.

새 migration은 추가하지 않았고 기존 V1~V11은 이번 수정에서 변경하지 않았다. 최신 develop의 테마·문서 정리와 공통 확인창 변경을 함께 보존했다.

## CI 연결

1. `backend-test`가 실제 Spring 응답 6개를 `backend/build/diary-contract/`에 생성하고 artifact로 전달한다. `diary-read.json`, `diary-create.json`, `diary-update.json`, `diary-trash.json`, `diary-restore.json`, `diary-purge.json`이다. 생산자 작업의 출력 파일도 Gradle에 등록해 artifact 누락 시 UP-TO-DATE로 생략되지 않도록 했다.
2. `diary-fe-contract-test`가 해당 artifact를 받아 의존성 설치 없이 Node 24에서 계약 100개를 실행한다. 파일 누락·잘못된 JSON은 즉시 실패하며 Spring 소비자 테스트를 skip으로 통과시키지 않는다. JUnit 보고서를 남긴다. FE 변경만 있는 MR에서도 생산자 작업이 함께 선택된다.
3. `diary-postgres-test`는 별도 PostgreSQL 17 컨테이너에서 `diaryPostgresTest`를 실행한다. 기존 backend-test·인증 PostgreSQL 작업 이후 실행해 같은 backend 빌드 디렉터리의 동시 쓰기를 피한다. 인증 작업이 선택되지 않은 파이프라인도 지원한다. 호스트 포트·공유 볼륨·기존 DB·환경 파일을 사용하지 않는다. 명시적인 `dio_diary_create_qa` DB와 opt-in이 없으면 실패하며 다른 DB로 대체하지 않는다. 생성한 컨테이너 ID만 성공·실패·중단 시 정리하고 이름 충돌 시 다른 컨테이너를 삭제하지 않는다.

CI 트리거는 MR 및 관련 BE·FE 계약/테마/공통 확인창·CI 파일 변경이다. 푸시나 MR을 생성하지 않았으므로 원격 파이프라인 결과는 아직 없다.

## 이번 변경 영향 검증

| 검증 | 결과 |
|---|---|
| 실제 Spring HTTP 생산자 (H2) | 45 통과, 실패·제외 0; 응답 6개 생성 |
| 실제 PostgreSQL·Flyway 및 다이어리 회귀 | 42 통과, 실패·제외 0; 별도 임시 로컬 클러스터에서 새 Gradle 태스크 실행 |
| 실제 Spring 응답 → FE 계약 CI 실행기 | 100 통과, 실패·제외 0 |
| 잘못된 PostgreSQL DB 설정 | 연결 전에 명시적 실패 확인 |
| 기존 배포 CI 계약 회귀 | 3 통과, 실패·제외 0; 기존 컨테이너 실행 계약 유지 |
| YAML·producer/consumer rules 및 artifact 연결 | 로컬 파싱·구조 검사 통과 |
| PostgreSQL CI 셸 | 구문 검사 및 격리된 Docker 대역으로 성공·테스트 실패·이름 충돌·준비 실패 정리 흐름 통과 |
| 목 휴지통 Edge QA | 1280×800, 1024×768, 412×892, 667×375 통과; 영구 삭제·취소·실패 재시도·로컬 자료 보존, pageerror 0 |
| 계정 웹 번들·테마 회귀 | 번들 성공, 테마 테스트 3 통과 |
| 계정 생성·수정 Edge QA | 각 1280×800, 1024×768, 412×892, 667×375 통과; pageerror 0 |

검증 근거: 워크스페이스 `tmp/diary-review-fix-20261028-101343/`. 이전 전체 검증을 반복하지 않고 수정된 제목 처리·목 휴지통·CI 경로와 develop UI 통합에 영향을 받는 범위를 확인했다.

## 유지하는 범위와 후속 확인

- 로컬 Docker 엔진이 실행 중이지 않아 실제 Docker 래퍼·GitLab runner의 컨테이너 실행은 미검증이다. PostgreSQL 자체 테스트는 별도 로컬 임시 클러스터에서 실행했다. 원격 CI는 제출 후 확인해야 한다.
- 기존 로컬/목 보관함을 유지하며 실제 서버 캔버스 편집, 공유·초대 담당 API/248, 실기기·VoiceOver/TalkBack, 배포·공유 서버는 이번 검증 범위가 아니다. 공용 미디어 원본 보존 정책을 유지한다.
- 다른 세션의 다이어리 브랜치에 있는 V9~V11 migration 번호와 `expectedUpdatedAt`/`expectedVersion` 계약 차이는 후속 통합 조율 대상이다. 해당 작업을 수정하거나 가져오지 않았다. 현재 develop에는 이 충돌 migration이 없다.

원본·248 관련 작업을 포함한 다른 8개 작업 폴더의 HEAD·브랜치·index·파일 SHA-256은 시작 스냅샷과 모두 동일하다. 전용 작업 폴더의 기존 migration V1~V11·App.js·lockfile도 이번 작업 전과 동일하다. 전용 브랜치 index는 비어 있으며 변경은 미커밋 상태다. 보존 대조 결과는 같은 근거 폴더의 `preservation-audit.json`에 남겼다.
