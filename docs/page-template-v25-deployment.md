# V25 플래너 배포 순서

1. `studyPlanner.js`, `dayPlanner.js`, `serverCatalog.js`를 포함한 프런트 앱을 먼저 배포하고, 두 `day-planner-*` 코드를 실제 기기에서 열어 확인한다.
2. 이전 앱 사용자가 편집 화면을 열어 둔 경우 저장 시 버전 충돌이 날 수 있다. 클라이언트는 충돌 안내 후 최신 페이지를 다시 불러오고, 사용자가 재시도하도록 안내한다.
3. 그 뒤에만 백엔드 V25를 배포한다. 배포 전 `docs/page-template-v25-rollback.sql`의 preflight가 0행인지 확인한다.
4. 백엔드 배포 뒤 기존 reusable-daily 페이지와 새 플래너 페이지를 회원·공유 구성원 계정에서 각각 열어 배경과 요소를 확인한다.
