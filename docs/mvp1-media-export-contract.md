# MVP1 로컬 미디어·공통 내보내기 계약 (56)

> 기준일: 2026-10-21 · 구현 기준: develop `f68044a`(!39·!42·!43 포함).
> 현재 로컬 구현을 대조한 계약 정리본이다. 문서 수정은 서버 API 변경·기존 데이터 마이그레이션·실기기 검증 완료를 뜻하지 않는다.

## 1. 적용 범위와 문서 책임

MVP1은 로그인·서버 업로드 없이 이미지/GIF를 기기 내부에 보관하고 꾸민 페이지를 PNG 또는 이미지 기반 PDF로 출력한다. 이 문서의 함수는 HTTP API가 아닌 **프런트엔드 로컬 서비스 계약**이다.

| 기준 문서 | 책임 |
|---|---|
| 이 문서(56) | 미디어 입력·조회·ID·페이지 규격, 공통 소재/폰트 준비, 배경/요소, 오류·재시도·자원 수명, 일반 PNG |
| [PDF 계약](./pdf-export-contract.md) | 네 가지 공유 메뉴의 단일 정의(10절), 페이지 선택·순서·면 구성, A4 배치·문서 한도·메타데이터·PDF 저장 |
| [영역 PNG 계약](./region-png-export-contract.md) | 영역 좌표·오버레이·비율·프리셋 픽셀·확대 확인·클리핑·영역 파일명 |
| [속지 명세](./landscape-svg-templates.md) | 속지 ID/버전·페이지 생성·SVG 배경·기존 문서 호환 |
| 개별 구현/QA 문서 | 구현 근거·과거 측정 수치·검증 환경·남은 실기기 항목 |

같은 규칙을 각 형식 문서에서 다시 정의하지 않는다. 공통 규칙은 56, PDF 전용 규칙은 108, 영역 전용 규칙은 115가 기준이다. 현재 서버 다이어리 API와 로컬 모델의 차이는 2절에서 별도로 기록한다. 원본 GIF 개별 저장, 페이지 GIF/MP4·JPEG·ZIP 출력, 서버 동기화는 이번 계약 범위 밖이다.

## 2. 속지 기준 규격과 출력 해상도

### 2.1 API·페이지 규격 원칙

**API의 페이지 규격과 기준 해상도는 해당 페이지에 적용된 속지의 규격·해상도를 따른다.** 특정 화면 크기나 임의의 1280×800·1188×840을 전체 서비스의 고정 규격으로 삼지 않는다.

- 현재 SVG 속지는 카탈로그 좌표계/viewBox 기준 1024×768이며, 페이지 생성 시 `canvasWidth`/`canvasHeight`, `backgroundAssetId`/`templateVersion`을 저장한다. 이 숫자는 현재 속지의 값이지 모든 미래 속지의 상수는 아니다.
- 편집·썸네일·일반 PNG·PDF·영역 선택은 같은 페이지의 저장된 크기를 사용한다. PDF 여러 면도 각 페이지 크기를 개별 해석한다. 속지·API·요소 좌표의 기준은 일치해야 한다.
- SVG는 벡터이므로 고정 DPI를 이미지 해상도로 간주하지 않는다. 속지 기준 크기와 최종 출력 픽셀을 구분한다. 화면 줌·DPR·태블릿 viewport를 API 좌표나 페이지 크기로 저장하지 않는다.
- 기존 저장 문서는 크기와 요소 좌표를 유지한다. 크기 필드가 없는 이전 로컬 페이지는 현재 `pageSize(page)`의 호환값 1188×840으로 읽는다. 최신 속지 크기로 조용히 재해석하거나 좌표를 일괄 확대하지 않는다.
- 현재 로컬 코드는 저장된 페이지 크기와 속지 메타데이터의 불일치를 일반적으로 자동 교정하지 않는다. 속지 변경 시 기존 요소 좌표 보존/변환과 버전 정책은 별도 합의가 필요하다. 이 문서 변경만으로 기존 문서를 변환하지 않는다.

### 2.2 기준 크기와 출력 픽셀의 구분

속지 기준 규격이 같아도 내보내기 목적에 따라 출력 배율은 다르다. 이번 API 규격 정리는 아래 기존 출력 기본값을 변경하지 않는다.

| 출력 | 기준 | 현재 기본값 |
|---|---|---|
| 일반 페이지 PNG | 해당 페이지의 속지 기준 W/H | 1배, 안전 상한 적용 |
| PDF 삽입 이미지 | 선택된 각 페이지의 W/H | 2배, 안전 상한 적용; PDF 물리 용지는 페이지별 방향에 맞는 A4 가로/세로 정책 |
| 영역 자유 PNG | 속지 좌표계 안에서 고른 영역의 W/H | 2배, 안전 상한 적용 |
| 영역 비율 프리셋 | 속지 안의 선택 영역/비율 | [115의 프리셋 표](./region-png-export-contract.md#3-프리셋과-출력-규격)에 지정된 픽셀 |

일반 PNG/PDF/영역 자유의 공통 픽셀 산식은 다음과 같다. W/H는 전체 페이지 또는 선택 영역의 양의 유한 논리 크기, k는 해당 출력의 배율이다.

```text
s = min(k, 4096 / W, 4096 / H, sqrt(8,000,000 / (W * H)))
pixelWidth  = max(1, floor(W * s))
pixelHeight = max(1, floor(H * s))
```

현재 1024×768 속지의 일반 PNG는 1024×768px, PDF 삽입용 2배 이미지는 2048×1536px이다. 향후 속지 크기가 달라지면 같은 규칙으로 다시 계산한다. 정수화에 따른 1px 미만 차이를 허용한다. 큰 규격은 상한 때문에 1배보다 작아질 수 있다. 출력 크기를 미리보기에 표시하며 픽셀 수가 실제 기기의 선명도나 인쇄 DPI를 보장하지 않는다.

### 2.3 서버 API 연동 차이

정책은 속지 기준으로 통일하지만, 현재 [서버 다이어리 API](./diary-api.md)와 [생성 구현 기록](./diary-create-persistence.md)은 `formatId=1 → 1280×800` 서버 설정을 복사해 다이어리에 저장하는 구현을 기술한다. 로컬 속지 페이지 1024×768과 아직 다르다.

- 서버 연동 시 고정 format 값으로 페이지 크기를 덮어쓰지 않고, 적용 속지의 ID/버전과 기준 크기를 일치시켜야 한다. 전송 필드·규격 카탈로그·서버 검증 방식은 API 담당자와 맞춘다. 확인되지 않은 HTTP 필드나 신규 엔드포인트를 이 문서에서 만들지 않는다.
- 서버 코드·DB·Notion 명세가 이미 변경됐다고 간주하지 않는다. 현재 응답 예시의 1280×800은 기존 구현값으로 읽으며 신규 페이지 기준값으로 채택하지 않는다.
- 다이어리 단일 규격과 페이지별 속지 규격이 공존할 때의 검증/이관도 서버 연동 확인 사항이다. 기존 다이어리·페이지 크기 보존이 우선이며 명시적인 이관 없이 재계산하지 않는다.

## 3. 이미지 가져오기·조회

### 3.1 실제 로컬 함수

| 함수 | 입력·반환과 책임 |
|---|---|
| `pickImages({ multiple=true, usage='photo' })` | photo/sticker/tape 용도. 검사·저장 후 MediaItem 배열 반환; 선택 취소·중복 실행은 `[]` |
| `importMedia(assets, { usage })` | 원본/표시본 저장 및 표시 캐시 등록 후 메타데이터와 `src` 배열 반환 |
| `mediaService.import(asset)` | 기본 photo 한 개 가져오기. 용도 지정은 pickImages/importMedia 사용 |
| `mediaService.get(mediaFileId)` | `{ media, blob, displayBlob }`. 웹 Blob / 네이티브 Expo File, 표시본이 없으면 null |
| `mediaService.resolveDisplay(id)` | 화면 표시 캐시 준비; 최종 출력 소재 선택 API가 아님 |
| `mediaUri(item, { still })` | 동기 화면 URI, 로딩/오류면 null일 수 있음. 출력 성공 판정에 사용하지 않음 |
| `hydrateMedia(references)` | 참조된 ID의 표시 준비 결과 `{ loaded, failures }`. 문서/보관함 복원용 |

MediaItem은 `mediaFileId`(UUID 문자열), originalName, mimeType, extension, fileSize, 원본 width/height, createdAt(ISO 시각), 선택적 display 메타데이터 및 `src: media:<UUID>`를 포함한다. pickImages는 name과 poster(실패/미지원이면 null)를 덧붙인다.

ID가 영구 참조 기준이다. mediaFileId가 있으면 src보다 우선하고, ID가 없는 이전 문서만 media: 참조 또는 data URI로 읽는다. 불일치를 자동 오류 처리하는 계약으로 바꾸지 않는다. Blob URL/네이티브 절대 파일 경로를 새 페이지의 영구 참조로 저장하지 않는다. 이전 IndexedDB 원본은 media가 null일 수 있으며 호환 경로로 처리한다.

### 3.2 형식·저장·수명

- JPEG/PNG/정지 WebP/HEIC/GIF를 파일 시그니처와 실제 디코딩으로 검사한다.
- 정지 이미지: 50MiB, 각 변 12,000px, 64,000,000화소 이내. GIF: 50MiB·각 변 4096px 및 공통 가져오기 화소 제한. **GIF 출력의 800만 화소 한도와 가져오기 한도는 다르다.**
- 표시본 긴 변: 사진 2048px, 스티커 512px, 테이프 1400px. 작은 이미지는 확대하지 않는다. HEIC 원본과 표시 JPEG를 분리하며 투명 PNG/WebP는 투명도를 보존한다.
- 한 호출은 순차 가공·저장한다. 한 파일이 실패하면 이번 호출에서 저장한 미디어를 롤백한다. 부분 성공과 원본 중복 제거는 제공하지 않는다. 같은 파일 재선택은 새 UUID다.
- 웹은 IndexedDB `dio-media` v3의 blobs/metadata/displays, 네이티브는 앱 문서 영역의 파일과 AsyncStorage 메타데이터에 저장한다. 자세한 원자성/정리는 [67·68 구현](./local-media-import.md)을 따른다.
- 썸네일(poster) 실패만으로 성공적으로 저장한 원본을 버리지 않는다.
- 화면 URI는 사용처 참조 수를 관리하고 마지막 사용 해제 30초 뒤 정리한다. 이 처리는 원본 삭제가 아니다. 오류 상태는 안내를 위해 유지한다([70](./local-media-recovery.md)).
- 요소 삭제를 원본 물리 삭제와 바로 연결하지 않는다. Undo·보관함·다른 페이지 참조를 포함한 원본 GC는 아직 없으며, 출력 중 원본 보호도 원본을 유지하는 현재 구조에 의존한다. 명시적 GC를 도입하면 별도 참조 보호 계약이 필요하다.

## 4. 공통 렌더링과 소재 정책

출력 기준은 내보내기 확정 시점의 최신 메모리 페이지의 불변 복사본이다. 자동 저장 완료/저장소 재조회가 기준이 아니다. 배열 앞에서 뒤로 그리므로 뒤쪽 요소가 앞에 보인다. 위치·크기·회전·반전·투명도·사진 크롭·프레임·테이프·부분 색상 텍스트와 필기는 편집기 ObjectContent/StrokeContent를 재사용한다.

- 입력 경계: 현재 UI는 텍스트 편집/사진·테이프 자르기 중 공유 진입을 막고 완료를 안내한다. 비동기 `createExportSnapshot(editorState)`로 모든 입력을 자동 확정하는 함수는 없다. 진행 중 필기/IME/멀티터치의 기기별 입력 종료는 실기기 확인이 남는다.
- 실제 함수는 `createExportSnapshot(page, { width?, height?, scale? })`다. 기본 width/height는 `pageSize(page)`, scale은 1이다. 일반 UI는 페이지 저장 크기를 사용한다. 임의의 호출자 override로 속지 규격을 바꾸지 않는다.
- 반환: `{ pageId, width, height, pixelWidth, pixelHeight, background, template, objects }`. width/height는 렌더링 논리 크기, pixelWidth/pixelHeight는 최종 픽셀이다. `schemaVersion`, `sourceModel`, `jobId`를 요구하는 과거 제안은 현재 반환 계약이 아니다.
- 포함: 불투명 흰 종이 바탕 + 실제 SVG 속지 + 지원 요소. 현재 종이색 선택/투명 배경 출력은 없다. 속지 ID/버전/읽기/렌더링 실패 시 빈 흰 종이로 대체하지 않는다.
- 숨김·opacity 0은 제외하고 잠긴 요소는 포함한다. 종이 밖 부분은 클리핑한다. 선택 핸들·보조 격자·툴바·참여자 커서·페이지 이동 UI는 제외한다. 실제 모눈 속지와 편집 보조 격자는 다르다.
- GIF: 원본의 **0번 이미지 프레임**을 직접 디코딩한다. 현재 재생 시점이나 작은 poster를 쓰지 않는다. 빈 영역은 투명으로 처리하고 이후 원래 변형/크롭을 적용한다. 원본을 수정하지 않는다. 출력 변환은 50MiB·각 변 4096px·800만 화소 이내다([73](./gif-first-frame-export.md)).
- 정지 소재: 필요 픽셀(요소 크기 × 출력 배율 × 크롭 확대)을 충족하는 표시본 → 800만 화소 이내 원본 → 큰 원본에 대한 안전한 표시본 확대 순이다. 마지막 경우 `rasterWarnings`를 결과 diagnostics로 전달하고 저장 전 화질 경고를 표시한다. 표시본이 없거나 손상됐으면 실패를 유지한다. 표시본 사용은 원본 대체 저장/세부 복원을 뜻하지 않는다.
- 같은 소재는 페이지 안에서 한 번 준비하되 가장 큰 사용처에 맞춘다. 페이지 전체를 무제한 디코딩 캐시하지 않는다. 영역 밖 소재도 현재 준비 대상이므로 오류/경고가 영향을 줄 수 있다. 경계 제외 최적화·큰 원본 축소 디코딩·추가 고해상도 파생본은 후속이다.
- 텍스트: 현재 OS 기본 sans/serif/mono 및 저장된 부분 색상/서식을 지원한다. 웹은 실제 문자열·스타일로 폰트 준비를 기다린다(`EXPORT_FONT_FAILED`). 사용자 폰트 등록/임베딩은 미지원이다. 네이티브는 OS 기본 폰트를 사용한다.
- surface의 속지 준비·이미지 로드·레이아웃 완료 후 캡처한다. 네이티브는 화면에 맞게 축소해 그릴 수 있으므로 요청 PNG 픽셀과 실제 렌더링 밀도가 다를 수 있다. 확대 진단·경고를 표시하며 실기기 선명도를 보장하지 않는다.

## 5. 작업·실패·저장 수명

| 실제 경계 | 책임 |
|---|---|
| `preparePageExport(snapshot)` | 속지 XML 및 출력 소재 준비, 작업 전용 참조 반환/정리 |
| `renderPageImage(snapshot, { signal })` | prepare → 전용 surface → PNG 캡처. `{ uri, blob?, width, height, diagnostics, dispose() }` 반환 |
| `savePngFile(result, fileName)` | 웹 파일/다운로드 또는 모바일 사진첩 저장 |
| `generatePdf(snapshot, options)` / `savePdfFile(result)` | [PDF 계약](./pdf-export-contract.md)의 조립·파일 공유 책임 |

- 페이지 준비·로드·캡처 제한은 **30초**, PDF 전체 생성은 PDF 전용 제한이다. OS 저장/공유 선택 시간은 포함하지 않는다. 56번 초기 60초 제안은 폐기했다.
- 감지된 요소/속지/소재/폰트/캡처 실패는 해당 출력 전체를 중단한다. 부분 PNG·부분 PDF 저장을 성공으로 표시하지 않는다. 미지원 요소는 조용히 빼지 않는다. html-to-image의 조용한 소재 누락 가능성은 알려진 한계로 남는다.
- 실패/취소 후 다시 만들기는 **같은 확정 스냅샷**으로 새 작업을 만든다. 최신 편집 반영은 닫고 다시 시작하며, 영역 변경은 영역 다시 선택으로 진행한다. 저장만 실패하면 유효한 결과로 다시 저장한다.
- 중복 시작/저장을 막고 저장 중 앱 내 닫기를 제한한다. 취소 불가능한 I/O의 늦은 결과도 현재 UI에 게시하지 않으며 작업 소유 자원만 정리한다. 성공 결과는 호출자가 사용 후 dispose한다. 화면 공유 캐시나 원본을 출력 측이 삭제하지 않는다.
- 웹은 picker의 write/close 완료에만 saved, 선택 취소는 cancelled, fallback은 download-started로 안내한다. 다운로드 URL은 미리보기와 독립 소유하며 60초 뒤 해제한다.
- 모바일 PNG는 사진첩 저장 완료와 권한 오류를 구분한다. PDF는 OS 파일 공유 시트를 사용하며 일반 반환을 저장 완료로 단정하지 않는다. PDF 사본의 24시간 lease는 PDF 전용 정책이다.
- 일반 PNG 파일명은 `DIO_<제목>_p01_<YYYYMMDD_HHMMSS_mmm>.png`. 제목 정규화·경로/제어문자 제거·48자 제한·현지 시각·문서 내 번호를 사용하며 한 작업/재시도에서 유지한다. PDF/영역 접미사는 각 전용 계약을 따른다.

### 오류 분류

| 계열 | 현재 코드 예시 / 처리 |
|---|---|
| 선택·형식·가공 | PICKER_FAILED, INVALID_MEDIA, UNSUPPORTED_MEDIA_TYPE, FILE_TOO_LARGE, IMAGE_TOO_LARGE, MEDIA_READ_FAILED, MEDIA_DECODE_FAILED, MEDIA_PROCESS_FAILED |
| 저장·조회 | STORAGE_FULL, STORAGE_WRITE_FAILED, STORAGE_READ_FAILED, STORAGE_UNAVAILABLE, STORAGE_BLOCKED, MEDIA_NOT_FOUND, MEDIA_CORRUPT. 기존 문서 유지·재선택/재시도 안내 |
| 출력 입력/준비 | EXPORT_SIZE_INVALID, EXPORT_PAGE_INVALID, EXPORT_ELEMENT_UNSUPPORTED, EXPORT_GEOMETRY_INVALID, EXPORT_TEMPLATE_FAILED, EXPORT_MEDIA_MISSING, EXPORT_MEDIA_FAILED, EXPORT_FONT_FAILED |
| 출력 크기/GIF | EXPORT_RASTER_TOO_LARGE, EXPORT_DATA_URI_INVALID, EXPORT_GIF_TOO_LARGE, EXPORT_GIF_DECODE_FAILED |
| 작업 | EXPORT_BUSY, EXPORT_TIMEOUT, EXPORT_CANCELLED, EXPORT_CAPTURE_FAILED. 취소는 작업 중단으로 처리하고 저장 성공으로 표시하지 않음 |
| 형식/저장별 | PDF는 [108](./pdf-export-contract.md), 영역은 [115](./region-png-export-contract.md), PNG 권한은 [74](./png-file-export.md) 참조 |

오류 code로 분기하며 message나 내부 경로/스택을 API 계약으로 삼지 않는다. 모든 오류가 stage/objectId 목록을 반환한다는 과거 제안은 구현되지 않았다. PDF는 감지 가능한 문서 페이지 번호/phase를 덧붙인다.

## 6. 검토 차이와 완료 판정

| 56번 과거 초안 | 현재 기준 |
|---|---|
| 전체 1188×840 고정·PNG 기본 2배 제안 | 속지/페이지별 규격, 일반 PNG 1배. PDF/영역 배율은 전용 정책 |
| 가상의 editorState/schemaVersion/jobId 입력 | 실제 page·objects 스냅샷 함수와 현재 로컬 모델 사용 |
| 출력은 언제나 원본, 표시본 사용 금지 | 필요한 픽셀에 따른 선택 및 안전한 표시본 대체·화질 경고 |
| 모든 입력 자동 확정 후 내보내기 | 텍스트/자르기는 완료 안내 후 차단, 입력 종료의 기기 검증은 별도 |
| 60초·재시도 시 최신 상태 | 페이지 30초·같은 스냅샷 재생성, 최신 내용은 새 진입 |
| 원본 물리 삭제·서버 규격까지 확정 | 원본 GC 미구현, 서버 속지 규격 전환은 연동 확인 필요 |

정리 근거: pageGeometry/pageExport/pdfSnapshot/regionExport/regionGeometry, mediaStore/mediaImport/mediaPolicy, exportSampling, 공통 surface 및 저장 어댑터. 본 문서 작성에서는 함수·상수·링크·수식을 대조하며 제품 코드를 수정하거나 테스트/실기기 QA를 새로 수행하지 않는다.

웹 증거는 [75 QA](./qa-local-media-export.md), [113 PDF QA](./pdf-export-qa.md), [119 영역 QA](./region-png-qa.md)를 따른다. 실제 12MP/48MP/HEIC·기기 메모리·사진첩/공유·권한·강제 종료 복원은 남은 검증이다. 문서 병합이나 단위 테스트 성공을 실기기 통과로 표시하지 않는다. 56은 서버 연동 규격 확인을 포함한 검토 상태로 남기며 QA 이슈는 진행 중을 유지한다.
