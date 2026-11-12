# 미디어 API와 편집기 사진 재사용 연결

관련 Jira: S15P31F106-467~471, 473, 477~478. 원본 삭제(472)와 다이어리 공유 보관함(474~476)은 이번 범위에 포함하지 않는다.

## 사용자 동선

홈 독립 메뉴를 추가하지 않는다. 사진 버튼은 스티커·위젯과 같은 renderPanel 경로를 사용한다. 폰 세로는 PhoneSheet 하단 시트, 태블릿·폰 가로는 툴바 앵커 패널로 열린다. ToolPanelHeader와 공용 패널 면·여백을 재사용한다.

- **새 사진 추가**: 기존 기기 갤러리 → 자르기 → 삽입 → 서버 저장 흐름을 유지한다.
- **최근 추가한 사진**: 개인 서버 미디어 목록을 조회하고 사진·GIF만 3열로 표시한다. 서버 createdAt 내림차순(같은 시각은 mediaFileId 내림차순)을 유지한다. 이미지가 없는 커서 페이지도 더 불러오기가 가능하다.
- 사진을 선택하면 메타데이터를 재조회하고 기존 이미지 저장소에 파일을 받아 자르기·삽입을 진행한다. 서버 파일 ID를 기존 계정·다이어리별 업로드 매핑에 기록해 재업로드하지 않는다.
- 기존 파일은 자르기 취소 시 삭제하지 않는다. 사진 교체·빈 틀 채우기는 기존 기기 선택 동선을 유지한다.
- 비회원·기기 전용 다이어리에서는 최근 사진을 비활성화한다. 패널 바깥 터치·다른 도구 선택·Android 뒤로가기로 닫는다.

## API 계약

| API | 사용 |
|---|---|
| GET /api/v1/media?limit=30&cursor=... | mediaFiles·nextCursor 응답, 커서 추가 조회·ID 중복 제거 |
| GET /api/v1/media/{id} | 선택 시 상세 정보와 요청 ID 대조 |
| GET /api/v1/media/{id}/file | 기존 createMediaRequest·canvasMediaFiles로 이미지 수신·캐시 |
| GET /api/v1/media/{id}/thumbnail | 화면에 보이는 최근 사진의 정지 PNG 자동 조회·전용 캐시 |
| POST /api/v1/media | 기존 createCanvasMedia의 업로드 경로 재사용 |

공통 인증 transport의 JWT·개발 Basic 처리를 재사용한다. 로그인 세션의 실제 사용자 ID와 다이어리 계정을 생성 시·요청 전후에 대조한다. 세션 전후 검증과 닫힌 패널의 늦은 응답 무효화로 이전 계정의 선택을 새 화면에 반영하지 않는다. 오류에 토큰·서버 오류 원문을 출력하지 않는다. 목록 미리보기는 `FlatList`의 화면 노출 콜백으로 보이는 항목만 자동 조회하며, 스크롤만으로 원본 파일을 다운로드하지 않는다. 원본이 기기에 없어도 썸네일 API로 표시한다. 정지 이미지 5MB, GIF 15MB 초과 파일은 목록에서 비활성화하고 ‘5MB 초과’·‘15MB 초과’를 표시한다. 상세 재조회 후에도 크기를 다시 검사하며 실제 원본 수신은 GIF 기준 15MB 제한을 따른다(서버가 정지 이미지는 5MiB까지만 저장하므로 상한을 GIF 기준으로 단일화), 시간 제한은 120초다.

썸네일은 최대 2개씩 요청하고 같은 ID의 진행 중 요청을 병합한다. Expo 기기는 `Paths.cache`, 웹은 별도 IndexedDB에 서버·계정별로 저장한다(24시간, 네이티브 계정별 100장/웹 전체 100장). 원본 저장소·mediaRegistry와 분리하므로 작은 미리보기가 자르기·삽입의 원본으로 쓰이지 않는다. 패널 종료·계정/세션 교체 후 늦은 응답은 표시하지 않는다. 로딩 중에는 ‘미리보기 불러오는 중’, 오류 시 ‘미리보기 실패’를 표시하며 이미지 디코딩 실패 캐시는 무효화한다. 미리보기 실패와 관계없이 사진 선택으로 원본을 받을 수 있다.

원본 삭제 API는 최근 목록 숨김과 다르므로 연결하지 않는다. 백엔드는 캔버스·복구 이력 또는 공유 보관함에서 참조하는 원본 삭제를 거절한다. 오디오 재생·PDF 뷰어·폰트 적용·공유 보관함은 별도 범위다. 사용하지 않는 독립 보관함 화면·상태 모델·QA 초안은 제거했다.

## 검증

### 2026-11-12 리뷰·CI 보완

- 추가 예외·경합 보완: ImageIO의 unchecked 디코더 예외도 실패 캐시에 연결하고 `Error`는 그대로 전파한다. 생성 락을 최대 250ms 기다린 뒤 실제 생성 시에만 permit을 잡는다. 동일 파일 대기자의 permit 미점유·뜨거운 캐시의 무예산 조회와 스토리지 실패 시 행 락·커넥션 해제를 검증했다.
- 캐시 환경 보완: 네이티브 저장 시각 sidecar로 mtime 누락 시에도 캐시를 재사용하고 만료시킨다. 웹은 IndexedDB 초기 차단·할당량 초과 시 메모리 URL로 표시하되 로그아웃으로 무효화된 응답은 표시하지 않는다. 관련 프론트 회귀 테스트 50개 통과.
- 추가 보완 후 전체 백엔드 검증: 1,227개 중 843개 통과·조건부 384개 건너뜀·실패 0. Android export `.expo/media-thumbnail-final-review-android` 통과. 실제 기기 mtime·S3 및 PostgreSQL 장애 검증은 별도 범위다.
- 로그아웃·토큰 만료·계정 삭제 등 인증 세션 종료에서 썸네일 전용 캐시를 삭제한다. 웹 Blob 및 object URL, 네이티브 캐시 파일을 정리하고 이전 세대의 늦은 저장·읽기를 차단한다. 원본 저장소는 보존한다.
- 손상·픽셀 제한에 따른 서버 썸네일 실패는 권한 검사 뒤 2분간 캐시한다(인스턴스당 1,024건 상한). 저장소·네트워크·admission 장애는 제외한다. TTL·상한, 재인가, 반복 원본 읽기 억제와 장애 후 복구를 테스트했다.
- 후속 캐시 정리 검증: 관련 프론트 47개, `pnpm test:auth` 424개 통과. 실제 IndexedDB Blob·표시 URL 삭제, 시작 전/커밋 중 웹 저장과 진행 중 네이티브 저장의 종료 경합, 새 로그인 복구, 만료·삭제·일시 오류 구분을 포함한다. 네이티브 파일 IO는 테스트 경계에서 대체했으며 실제 기기 확인과 구분한다.
- 후속 서버 전체 검증: `gradlew.bat test --console=plain` 1,223개 중 839개 통과·조건부 384개 건너뜀·실패 0. Android export도 `.expo/media-thumbnail-review-android` 출력으로 통과했다(실기기 실행과 구분).
- 기본 동시 요청을 2개로 맞추고, 429·503 응답은 400/1,000/2,000ms에 최대 99ms 지터를 더해 최대 3회 자동 재시도한다. 서버는 기본 최대 250ms 대기 후 바쁘면 503을 반환한다. 영구적인 401·403·404는 재시도하지 않고 패널 종료·계정 변경 뒤 추가 요청도 막는다.
- 패널이 직접 생성한 런타임만 소유 목록으로 추적해 종료한다. 부모에게 받은 런타임은 패널 재열기와 늦은 목록 응답에서도 종료하지 않는다.
- CI #290009의 17개 실패는 모두 `PageApiTests`의 `USERS` 테이블 부재였다. 기본 H2 DB 이름을 테스트 컨텍스트별 UUID로 분리해 다른 `create-drop` 컨텍스트 종료가 아직 사용 중인 스키마를 지우지 않도록 했다. 테스트 리소스만 변경하며 개발·운영 DB와 마이그레이션은 변경하지 않는다.
- 프론트 관련 회귀 테스트 41개 통과(요청 상한·백오프 복구/중단·런타임 소유권 포함).

### 2026-11-11 자동 썸네일 연결

- `node --test tests/media-thumbnail-files.test.js tests/media-thumbnail-cache.test.js tests/media-library-api.test.js tests/media-library-runtime.test.js tests/collaboration-media.test.js tests/photo-panel.test.js`: 36개 통과. 요청 병합·동시 요청 상한, 캐시 영속화·계정/서버 격리·만료, 계정 전환 응답 거절, 선택 시 원본 다운로드를 검증했다.
- `backend/gradlew.bat test`: 1,216개 중 836개 통과, 전용 PostgreSQL 등 조건부 380개 건너뜀, 실패 0. 새 API의 PNG 크기·원본 보존·저장된 파생 파일 재사용, 비로그인/다른 사용자/삭제된 파일 거절, 오디오 거절·파생 파일 정리, JPEG 방향과 WebP 투명도·GIF 정지 미리보기를 포함한다.
- Android export: `pnpm exec expo export --platform android --output-dir .expo/media-thumbnail-android` 통과. 실제 Expo Go 기기 실행과는 구분한다.
- 실제 API 연결용 `mediaThumbnailBrowserQa`는 loopback H2와 전용 `backend/build/thumbnail-browser-qa/media`만 사용한다. 2일 전 사진 36장을 생성하므로 날짜와 기기 원본 유무에 무관한 표시를 확인할 수 있다.
- `node qa/media-thumbnail-browser.cjs`: 390×844·1280×800 통과. 클릭 전 보이는 12장만 썸네일 요청, 원본 요청 0건, 페이지 재로딩 시 영속 캐시 재사용, 추가 페이지의 36번째 사진 자동 표시, 선택할 때만 원본 1회 조회를 확인했다. 실제 Android/iOS 기기의 Expo Go 실행은 별도 확인이 필요하다.
- 2026-11-12 사용자 확인: 미리보기 로딩 안내 이후 최근 사진이 모두 자동 표시되는 것을 확인했다. 확인 기기·OS의 상세 정보는 별도로 받지 않았다.

```powershell
# backend/: 전용 H2 QA 서버 (개발/공유 DB 사용 안 함)
$env:DIO_MEDIA_THUMBNAIL_QA='true'
.\gradlew.bat mediaThumbnailBrowserQa

# frontend/: 별도 터미널에서 전용 Metro
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:18567/api/v1'
$env:EXPO_PUBLIC_AUTH_TOKEN_HEADER='Authorization'
$env:EXPO_PUBLIC_QA_ACCESS_ID=''
$env:EXPO_PUBLIC_QA_ACCESS_PASSWORD=''
pnpm exec expo start --web --port 18568 --offline

# frontend/: 별도 터미널, 설치된 Edge 사용
node qa/media-thumbnail-browser.cjs
```

아래는 기존 사진 재사용 연결의 이전 검증 기록이다.

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
