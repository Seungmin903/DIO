# 공통 페이지 이미지 생성 (S15P31F106-109)

## 호출 계약

`usePageImageRenderer()`는 `{ renderPageImage, surface }`를 반환한다. 호출 화면은 `surface`를 **보이고 크기가 정해진 영역**에 계속 마운트해야 한다. surface 없이 함수만 호출하면 렌더링할 곳이 없어 시간 초과한다. 웹은 DOM, 네이티브는 View를 캡처하므로 순수 백그라운드 함수가 아니다.

```js
const { renderPageImage, surface } = usePageImageRenderer()
const output = await renderPageImage(snapshot, { signal })
// output: { uri, blob? (web), width, height, dispose() }
try { /* PNG 저장 또는 PDF에 이미지 삽입 */ }
finally { output.dispose() }
```

- 입력은 기존 `createExportSnapshot`으로 검증·복사된 페이지다. 공통 작업기는 입력 문서를 다시 읽거나 저장하지 않는다. 파일명·미리보기·형식·OS 저장은 호출 화면의 책임이다.
- 110번은 한 페이지 출력 결과를 PDF 조립기가 소비한 뒤 dispose하고 다음 페이지를 요청한다. 한 작업기에서 동시 호출하면 `EXPORT_BUSY`다.
- 출력 배율은 스냅샷의 pixelWidth/pixelHeight를 따르며 PNG 기본1배는 유지한다. 기존 출력 픽셀에 따른 원본/표시본 선택, GIF 첫 프레임, 회전·크롭·겹침·기본 stroke는 공통 ObjectContent와 준비 경로를 유지한다.
- 영역 출력은118번에서 스냅샷·클리핑을 확장한다. 이번 작업에서 PDF 조립/메뉴/영역 UI는 구현하지 않는다.

## 구성과 수명

| 파일 | 역할 |
| --- | --- |
| pageImageRenderer.js | React를 모르는 작업기. prepare/render 주입, 단일 실행,30초 제한·취소·자원 소유권 |
| usePageImageRenderer.js | 작업 요청을 React surface에 연결하고 마운트 종료 시 진행 작업 취소 |
| PageImageSurface.js | 소재 로드·레이아웃·두 합성 프레임 대기, 전용 ObjectContent 렌더링 및 플랫폼 캡처 |
| PageExportPreview.js | PNG 미리보기·재생성·저장·권한 안내. 공통 API와 surface 사용 |

- 준비 자원은 성공/실패 경로에서 작업기가 해제한다. 성공 결과의 URL/임시 PNG는 **호출자가** 사용 후 해제한다. 반환 dispose는 중복 호출에 안전하다.
- AbortSignal, 화면 종료 또는30초 초과로 호출자는 즉시 오류로 복귀한다. 취소할 수 없는 준비 IO의 늦은 결과는 완료 시 정리한다. 실제 작업이 정리되기 전에는 같은 작업기의 새 호출을 막는다. 단, 취소·시간 초과 뒤 유예 시간(기본 5초) 안에 준비/캡처가 끝나지 않으면 작업기를 해제해 다음 호출을 받는다. 멈춘 작업 때문에 PDF 순차 생성이 영구히 `EXPORT_BUSY`가 되지 않게 하기 위함이며, 그 작업의 늦은 결과는 완료될 때 정리되고 새 작업의 점유를 풀지 않는다.
- 늦은 캡처 결과는 surface 또는 작업기에서 정리하고 다음 작업/닫힌 UI에 표시하지 않는다. 원본·문서·화면 캐시·사진첩 저장 결과는 삭제하지 않는다.
- 취소 오류는 `EXPORT_CANCELLED`, 시간 초과는 `EXPORT_TIMEOUT`, 동시 호출은 `EXPORT_BUSY`다. 기존 소재/캡처 오류는 원인을 유지한다.
- 기존 PNG 저장 중 닫기 금지, 생성 오류 시 저장 차단, 생성 실패는 다시 만들기/저장 실패는 다시 저장, 웹 다운로드 시작·사진첩 저장 완료 구분을 유지한다.

## 검증과 제한

- 작업기 테스트는 순차1배/2배·결과 dispose·입력 불변·실패 후 재시도·동시 실행 차단·취소 전/준비 중/캡처 중·시간 초과와 늦은 결과 정리를 검증한다.
- 기존 소재·GIF·미디어·PNG 저장 및 stroke 테스트도 실행한다. React surface/실제 캡처 검증은 별도로 기록한다.
- 72번의 폰트·부분 스타일 텍스트·필기 종합 검증을 대신하지 않는다. SVG 로드 이벤트·네이티브 화면 크기·캡처 품질·OS 저장/공유는 실기기 검증이 필요하다.
- html-to-image의 조용한 소재 누락 한계는 유지한다. 번들 생성이나 IO mock 통과를 기기 실행 성공으로 표시하지 않는다.

### 이번 실행 결과 (2026-10-20)

- 기준 develop `eac8bb8`에서 폴더 구조와 캔버스가 바뀌었다. EditorScreen은 공통1280×800 상수를 전달하며, createExportSnapshot의 기존 생략 기본값1188×840은 유지한다. 이번 변경이 페이지 규격을 바꾼 것은 아니다. PDF/영역 계약의1188×840 예시는 후속 구현에서 실제 캔버스 규격을 전달받아야 한다.
- `node --test tests/*.test.js`: 기존58개와 공통 작업기6개, 총64개 통과.
- lockfile 고정 설치로 최신 develop의 로컬 의존성을 맞췄다. package.json/lockfile에 신규 의존성은 추가하지 않았다. test:export 명령에 작업기 테스트만 포함했다.
- 웹·Android Expo 번들 생성 통과. 실행 중 발견한 기존 폴더 이동 오류(Canvas→PenInput, PenInput→ObjectView, ObjectView→strokes, stickerAssets→mediaStore) 네 경로와 TopBar의 미정의 MEMBERS 오류는 이후 develop(`d4c5d4d` 등)에서 같은 방식으로 수정되어, develop 병합 시 develop 쪽 변경을 따랐다. 이 MR에는 해당 수정이 남아 있지 않다.
- develop `ed5694b` 병합 후 `node --test tests/*.test.js` 68개 통과, 웹 Expo 번들 생성 통과.
- 사용자 저장소와 분리한127.0.0.1:8110·새 BrowserContext에서 빈 페이지 반복 출력과 하트 모양 회전 사진·n-love GIF·이미지 테이프·stroke의 혼합 페이지를 확인했다. 잘못 구성한 첫 합성 사진 fixture의 crop 필드 누락은 수정 후 검증했으며 제품 결함으로 계산하지 않는다.
- 혼합 페이지 PNG 두 번 모두1280×800·90,159바이트, 중심 사진 RGBA=[36,104,206,255]. 전체 RGBA SHA-256은 두 결과 모두 `35f1ee27cd9e142bb2b7cc51aaeedfab1b2a93d3655b00d928f309e7db8f510f`였다. 최종 실행의 pageerror는0건이다.
- 저장 대화상자 API를 주입해90,159바이트 write 및 close 완료 뒤 저장 완료 안내를 확인했다. 실제 OS 파일 선택/다운로드·모바일 사진첩 검증은 아니다. 초기 실제 파일 선택기가 열린 상태에서 다운로드 이벤트를 기다린 시도는 검증 실패로 구분했다.
- iPhone/iPad/Android 실기기, 네이티브 SVG load·화면 적합 배율의 최종 픽셀 품질·권한은 미검증이다. 변경은 109번 브랜치의 develop 대상 MR에서 검토한다. 번들 생성은 실기기 검증을 대신하지 않는다.
