# 미디어 API와 편집기 사진 재사용 연결

관련 Jira: S15P31F106-467~471, 473, 477~478. 원본 삭제(472)와 다이어리 공유 보관함(474~476)은 이번 범위에 포함하지 않는다.

## 사용자 동선

홈 독립 메뉴를 추가하지 않는다. 사진 버튼은 스티커·위젯과 같은 renderPanel 경로를 사용한다. 폰 세로는 PhoneSheet 하단 시트, 태블릿·폰 가로는 툴바 앵커 패널로 열린다. ToolPanelHeader와 공용 패널 면·여백을 재사용한다.

- **새 사진 추가**: 기존 기기 갤러리 → 자르기 → 삽입 → 서버 저장 흐름을 유지한다.
- **최근 추가한 사진**: 개인 서버 미디어 목록을 조회하고 사진·GIF만 2열로 표시한다. 서버 createdAt 내림차순(같은 시각은 mediaFileId 내림차순)을 유지한다. 이미지가 없는 커서 페이지도 더 불러오기가 가능하다.
- 사진을 선택하면 메타데이터를 재조회하고 기존 이미지 저장소에 파일을 받아 자르기·삽입을 진행한다. 서버 파일 ID를 기존 계정·다이어리별 업로드 매핑에 기록해 재업로드하지 않는다.
- 기존 파일은 자르기 취소 시 삭제하지 않는다. 사진 교체·빈 틀 채우기는 기존 기기 선택 동선을 유지한다.
- 비회원·기기 전용 다이어리에서는 최근 사진을 비활성화한다. 패널 바깥 터치·다른 도구 선택·Android 뒤로가기로 닫는다.

## API 계약

| API | 사용 |
|---|---|
| GET /api/v1/media?limit=30&cursor=... | mediaFiles·nextCursor 응답, 커서 추가 조회·ID 중복 제거 |
| GET /api/v1/media/{id} | 선택 시 상세 정보와 요청 ID 대조 |
| GET /api/v1/media/{id}/file | 기존 createMediaRequest·canvasMediaFiles로 이미지 수신·캐시 |
| POST /api/v1/media | 기존 createCanvasMedia의 업로드 경로 재사용 |

공통 인증 transport의 JWT·개발 Basic 처리를 재사용한다. 로그인 세션의 실제 사용자 ID와 다이어리 계정을 생성 시·요청 전후에 대조한다. 세션 전후 검증과 닫힌 패널의 늦은 응답 무효화로 이전 계정의 선택을 새 화면에 반영하지 않는다. 오류에 토큰·서버 오류 원문을 출력하지 않는다. 목록 미리보기는 기존 기기 캐시만 읽고 스크롤만으로 원본 파일을 다운로드하지 않는다. 캐시가 없는 사진은 ‘선택해 불러오기’를 표시하며 선택 시 원본을 받는다. 5MB 초과 파일은 목록에서 비활성화하고 ‘5MB 초과’를 표시한다. 상세 재조회 후에도 크기를 다시 검사하며 실제 수신은 기존 5MB 제한을 따른다.

원본 삭제 API는 최근 목록 숨김과 다르므로 연결하지 않는다. 백엔드는 캔버스·복구 이력 또는 공유 보관함에서 참조하는 원본 삭제를 거절한다. 오디오 재생·PDF 뷰어·폰트 적용·공유 보관함은 별도 범위다. 사용하지 않는 독립 보관함 화면·상태 모델·QA 초안은 제거했다.

## 검증

- 자동 테스트 명령: `node --test tests/photo-panel.test.js tests/media-library-api.test.js tests/media-library-runtime.test.js tests/media.test.js tests/collaboration-media.test.js tests/editor-page-management.test.js tests/element-selection.test.js`
- 자동 테스트 결과: 45개 통과.
- 최종 웹 export: `pnpm exec expo export --platform web --output-dir .expo/media-integration-final` 통과.
- 최종 사진 패널 QA: 1280×800·1024×768·390×844·844×390·320×740 모두 통과.
- 기존 선택 테스트 mock을 최신 캔버스의 forwardRef·페이지 준비 hook·radius에 맞췄다. 캔버스 구현은 변경하지 않았다.
- 브라우저 QA: `qa/photo-source-browser.cjs`. Metro와 PLAYWRIGHT_EXECUTABLE_PATH가 필요하다. 가짜 runtime으로 사진 필터·커서 추가·선택·뒤로가기·닫기를 확인하며 실제 서버 파일 테스트와 구분한다.

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node qa/photo-source-browser.cjs
```

2026-11-03 사용자가 Expo Go에서 서버 다이어리의 기기 사진 삽입, 최근 사진 선택·자르기·삽입, 홈 복귀 후 재진입 유지를 확인했다. 이후 패널 디자인·문구를 조정했다. 네이티브 사진 파일 재사용 성공과 브라우저 테스트 자료 검증은 구분한다. 실제 서버 부하·다중 기기 사진 재사용·iOS는 별도 확인이 필요하다. 백엔드·인프라·AI 코드는 수정하거나 테스트하지 않았다.

리뷰 확인: Android BackHandler는 bubbleOpen일 때 closeBubbles() 후 true를 반환한다. photoSourceOpen은 bubbleOpen에 포함되고 closeBubbles에서 false로 바뀌므로 기존 핸들러로 닫힌다. 이 검토는 코드 경로 확인이며 브라우저의 패널 뒤로 버튼 테스트를 Android 하드웨어 확인으로 간주하지 않는다.

추가 리뷰 보완: 서버 MediaType enum은 현재 IMAGE/AUDIO/FONT/DOCUMENT지만, 향후 유형 추가가 사진 목록을 막지 않도록 응답의 비어 있지 않은 문자열 유형을 유지하고 IMAGE만 표시·선택한다. ID·크기·응답 구조 검증은 유지한다. 읽기 전용에서는 openDrawer의 사진 분기 진입을 막고 photoPanelVisible 계산에 읽기 전용 여부를 반영하며 모드 전환 시 사진 패널 상태도 초기화한다.

에디터 보호 처리 자동 검증: 실제 EditorScreen이 사용하는 usePhotoPanel과 discardUnusedPhotoImports를 분리하고 모듈 전체를 직접 불러와 테스트한다. 서버 파일의 자르기 취소·미사용 정리 보존, 읽기 전용 열기 거부, 모드 전환 시 숨김·상태 초기화, 토글·공통 닫기 후 재열기를 확인했다. `node --test tests/photo-panel.test.js tests/media-library-api.test.js tests/media-library-runtime.test.js tests/reading-mode.test.js tests/element-selection.test.js`: 32개 통과. 브라우저 사진 선택 흐름은 위 qa/photo-source-browser.cjs 명령으로 별도 실행한다.

## 폰 패널 배치 리뷰 보완 (2026-11-03)

사진 패널도 renderPanel로 렌더링해 PhoneSheet의 높이·키보드 처리·닫기·onHeight 동작을 재사용한다. 폰 세로에서는 sheetCard와 flex:1로 부모 높이 안에 들어가며, 제목줄에 dragHandlers를 전달한다. 태블릿·폰 가로의 기존 앵커 패널은 유지한다.

- 관련 자동 테스트 32개 통과.
- qa/photo-source-browser.cjs는 실제 EditorScreen의 사진 버튼 열기·패널 화면 경계·닫기까지 5개 화면 크기에서 통과했다. 이 실제 편집기 fixture는 기기 전용 다이어리이므로 서버 최근 사진 목록은 비활성이다.
- 서버 목록·선택·시트 내부 격자·5MB 제한은 별도 가짜 runtime fixture에서 같은 5개 화면 크기로 확인했다. 폰 세로 fixture도 실제 PhoneSheet를 사용한다.
- 브라우저 결과를 실제 Android/iOS 폰 검증으로 간주하지 않는다. 네이티브 폰의 세로·가로 회전, 목록 마지막 항목 스크롤·선택, 하드웨어 뒤로가기는 사용자 추가 확인이 필요하다.

2026-11-03 사용자 실기기 추가 확인 완료: 폰 세로 하단 시트 열림, 가로 패널 화면 내 표시, 최근 사진 목록 스크롤·선택·닫기 정상. 위 브라우저 검증과 별도로 사용자 확인 결과를 기록한다.

980c4d64 리뷰 보완: openDrawer의 읽기 전용 가드를 photo 분기 안으로 한정해 다른 보관함의 기존 동작은 바꾸지 않는다. 사진의 읽기 전용 숨김·상태 초기화는 usePhotoPanel에서 유지한다. GIF 배지 모서리와 비활성 투명도는 기존 radius.sm·DISABLED_OPACITY를 재사용하고, 공용 글자/간격 토큰이 없는 역할별 수치는 디자인 가이드 표에 기록했다.

94b85edf 리뷰 보완: 비이미지 항목은 ID·유형만 검증·보관하고 mimeType·fileSize·파일명 등 사용하지 않는 부가 정보는 해석하지 않는다. 정상 사진과 nextCursor는 그대로 유지한다. IMAGE의 크기·MIME·파일명 검사, 모든 항목의 UUID·유형·중복 ID 및 응답·커서 검증은 유지한다. 비이미지 메타데이터 누락/비정상 조합, 다음 페이지 진행과 사진 검증 유지 테스트를 추가했으며 API·런타임·패널 테스트 15개 통과.
