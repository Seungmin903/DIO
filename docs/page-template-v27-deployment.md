# V27 플래너 배포 순서

> 진행 상태(2026-11-13): 1~3단계 완료, 운영 V27 적용 확인 후 4단계로 `eas.json` 값을 `"1"`로 바꿨다(S15P31F106-887). 아래 절차는 V27 배포 이력이며, 다시 처음부터 따라 할 때는 1단계 빌드 전에 `eas.json`의 preview·production 값을 직접 `"0"`으로 바꿔야 한다.

V27이 적용되기 전에는 DB에 `study-planner-*`·`day-planner-*` 행이 없다. 따라서
렌더러를 포함한 프런트를 먼저 내보내더라도 플래너 선택을 켜면 안 된다. 앱 빌드에
`EXPO_PUBLIC_PLANNER_TEMPLATES_ENABLED=0`을 넣으면 플래너를 열고 기존 페이지를 읽는
기능은 유지하면서, 새 다이어리/페이지에서의 선택과 서버 생성 요청만 차단한다.

- 값은 `frontend/eas.json`의 `preview`·`production` 프로필 `env`에 고정되어 있다. 4단계(2026-11-13)에서 `"1"`로 바꿔 릴리스 빌드에서도 플래너 선택이 켜진다(`production-apk`는 `production`을 이어받는다). 값을 비운 로컬·development 빌드(`pnpm web`, `pnpm android` 등)는 켜진다.
- 웹 배포본(`pnpm web:licensed`)도 `eas.json`의 `production.env`를 읽어 같은 값으로 빌드한다. 셸 값보다 `eas.json`이 우선한다. 다른 경로로 `expo export`를 직접 실행해 배포하지 않는다.
- 플래그가 꺼져 있는 동안에는 데일리·스터디 플래너 대신 예전 `하루 계획`(reusable-daily)을 메뉴에 그대로 보여 준다. 이 기간에 만든 하루 계획 페이지도 V27이 데일리 플래너로 옮긴다.

1. 빌드 전에 `frontend/eas.json`의 preview·production `EXPO_PUBLIC_PLANNER_TEMPLATES_ENABLED`가 `"0"`인지 직접 확인한다. `studyPlanner.js`, `dayPlanner.js`와 플래너 선택 플래그를 포함한 프런트를 먼저 배포한다. 이 단계의 빌드는 반드시 `EXPO_PUBLIC_PLANNER_TEMPLATES_ENABLED=0`으로 만들고(당시 eas.json 값. 지금 값은 `"1"`이므로 다시 진행하려면 `"0"`으로 바꾼다), 새 다이어리·페이지 메뉴에 플래너가 없고 `하루 계획`이 있는지, 기존 reusable-daily 및 플래너 페이지가 열리는지 실제 기기에서 확인한다.
2. 편집 중이던 클라이언트에는 V27의 페이지 버전 증가로 충돌 표시가 나타날 수 있다. 현재 캔버스 협업 경로는 409에서 기기 편집을 보존하고 `캔버스 충돌 · 기기 보존` 상태를 표시한다. 사용자는 화면을 다시 열어 최신 속지를 받은 뒤 저장을 재시도해야 한다. 배포 공지와 점검 시간에 이 안내를 포함한다.
3. 그 뒤에만 백엔드 V27을 배포한다. 배포 전 `docs/page-template-v27-rollback.sql`의 preflight가 0행인지 확인한다.
4. V27 적용 및 기존 페이지 검증이 끝난 뒤, `eas.json`의 값을 `"1"`로 바꾸는 커밋을 병합하고 그 커밋으로 만든 앱·웹 빌드를 배포해 플래너 선택을 연다. 앱 배포 사이에는 이 값을 바꾸지 않는다. 병합 전 검증은 아래 DB 조회와, 지금 배포된 앱(플래그 `"0"`이어도 플래너 페이지는 열린다)에서 V27이 데일리 플래너로 옮긴 기존 reusable-daily 페이지를 회원·공유 구성원 계정으로 열어 배경과 요소를 확인하는 것이다. 5단계는 켠 뒤 새 플래너 페이지를 만들어 보는 확인이다.
   - 병합 전에 운영 DB(`app-db-1`)에서 아래 두 조회를 읽기 전용으로 실행한다. `eas.json`의 preview·production 빌드는 모두 운영 API를 쓰므로 운영 DB만 확인하면 된다. dev DB(`dio-dev-db-1`)는 그 DB를 쓰는 로컬·development 빌드에서 플래너를 시험할 때만 같은 조회로 확인한다(선택). V27이 `success = t`이고 플래너 4행이 모두 `is_active = t`여야 한다.
     ```sql
     SELECT version, success FROM flyway_schema_history WHERE version = '27';
     SELECT code, is_active FROM page_templates WHERE code LIKE 'study-planner-%' OR code LIKE 'day-planner-%';
     ```
   - 2026-11-13 운영 DB에서 V27 `success = t`를 확인하고 S15P31F106-887로 값을 `"1"`로 바꿨다.
   - 되돌리기: 켠 뒤 플래너 생성에 문제가 생기면 `eas.json`의 preview·production 값을 다시 `"0"`으로 바꾸는 커밋을 병합하고 앱·웹을 다시 빌드·배포한다. 이미 설치된 앱은 새 빌드로 바꿔야 꺼진다. 이미 만든 플래너 페이지는 플래그와 상관없이 계속 열린다.
5. 새 빌드에서 회원·공유 구성원 계정으로 데일리·스터디 플래너 페이지를 새로 추가하고, 다시 열어 배경과 요소를 확인한다.
