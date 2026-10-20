# 다중 페이지 PDF 생성 (S15P31F106-110)

## 구현 범위

현재/개별/범위 선택을 문서 순서의 스냅샷으로 고정하고, 전달받은 공통 페이지 이미지 생성 함수로 **한 장씩** PNG를 만든 뒤 A4 가로 PDF 한 파일로 조립한다. 메뉴/선택 화면은111번, 저장·공유는112번이다. 이번 작업은 기존 PNG 버튼을 PDF 버튼으로 바꾸지 않는다.

109번이 아직 develop에 병합되지 않아 해당 브랜치 커밋을 이 작업에 섞지 않았다. `renderPageImage(snapshot,{signal})`를 주입받는 경계로 구현했다. 111번에서는109번 hook의 surface를 마운트하고 반환 함수를 연결해야 한다.

```js
import { createPdfExportSnapshot, pdfSelectAllPolicy } from './pdfSnapshot.js'
import { generatePdf } from './pdfExport' // Metro web/native 분기

const snapshot = createPdfExportSnapshot(doc, {
  scope: 'pages', selectedPageIds, width: PAGE_WIDTH, height: PAGE_HEIGHT,
})
const output = await generatePdf(snapshot, { renderPageImage, signal, onProgress })
try { /* 112번: output.uri/blob과 fileName으로 저장·공유 */ }
finally { output.dispose() }
```

- 결과: uri, 웹 blob, byteLength, pageCount, fileName, mimeType=application/pdf, 중복 호출 가능한 dispose.
- 문서/원본/저장 스키마/서버 API는 변경하지 않는다. 생성 도중 스냅샷을 외부에서 변경해도 작업 입력이 바뀌지 않도록 시작할 때 복사한다.
- pdf-lib ~1.17.1과 기존 upng-js를 사용한다. UMD 배포 진입점의 namespace exports로 가져와 Metro의 tslib1.x import 조건 및 default export 충돌을 피한다. Node만 통과한 것을 브라우저 호환으로 판단하지 않는다.

## 선택·크기·용량

- current는 현재 ID 한 개, pages는 중복/없는 ID 없는 개별 목록, range는1부터 시작하는 양끝 포함 정수 범위다. 잘못된 입력은 자동 보정하지 않는다. 체크 순서와 무관하게 문서 순서다.
- 실제 캔버스 width/height는 필수 입력이다. 기본 배율은2, 긴 변4096px·면당8MP, 전체20면·80MP, 삽입 RGB PNG 누적 및 최종 PDF 각각50MiB, 전체 생성180초다. 면별30초는109번 렌더러의 계약을 따른다.
- 현재1280×800은2배2560×1600이며19장77,824,000px,20장81,920,000px다. 최대20면은 절대 개수 상한이고 픽셀 예산 때문에 실제 선택 한도가 더 작을 수 있다.
- `pdfSelectAllPolicy`는 전체 선택 활성화 여부와 이유/문서 페이지 수/실제 최대 면 수(`maxPages`)를 제공한다. `maxPages`는 20면 상한과 80MP 픽셀 예산 중 작은 값이며, 현재 1280×800의 2배에서는 19면이다. 21장 이상 또는 픽셀 초과 문서는 전체 선택을 비활성화하되 일부 선택은 허용한다. UI 표시 자체는111번에서 구현한다.
- 페이지별 비율을 유지해 A4 가로297×210mm에 중앙 contain 배치한다. 빈 면은 생략하지 않는다.

## RGB·수명·실패

- 캡처 PNG의 바이트 및 헤더 크기를 디코딩 전에 검사한다. 면 크기가 스냅샷과 다르거나 PNG가 아니면 실패한다.
- RGBA를 종이 배경에 합성하고 모든 알파를255로 만든 뒤 팔레트를 금지한 무손실 RGB PNG로 인코딩한다. PNG color type2를 확인한다. PDF 내부에 불필요한 SMask를 생성하지 않는다.
- JPEG는 계약상 허용된 후속 후보다. 사진/필기 혼합의 손실 화질 비교 전이므로 이번 구현은 RGB 무손실로 고정한다. 용량 초과 시 자동 손실 압축이나 부분 저장을 하지 않는다.
- PDF 조립기는 면별 이미지 embed를 즉시 완료해 디코딩된 이미지 채널을 다음 면까지 누적하지 않는다. 압축된 PDF 스트림/직렬화 버퍼는 누적되므로50MiB가 메모리 사용 상한이라는 뜻은 아니다.
- 면 삽입이 끝나면 캡처의 dispose를 호출한다. 생성/읽기/디코딩/삽입 실패에도 이번 캡처를 해제하며 최종 파일 생성으로 넘어가지 않는다. PDF 면의 오류 번호는 문서 내 번호, 진행률은 출력 순번이다.
- 취소·시간 초과 시 호출자는 즉시 복귀하고, 늦게 완료된 캡처 또는 최종 파일은 작업이 정리한다. 동기 디코딩/인코딩 동안 타이머가 지연될 수 있어 단계마다 경과 시간도 검사한다. JS 연산 자체의 즉시 선점 취소는 보장하지 않는다.
- 완료된 결과는 호출자가 해제한다. 웹은 PDF Blob URL, 네이티브는 작업 전용 캐시 PDF다. 사진첩/공유 API를 여기서 호출하지 않는다. 실제 공유 시의24시간 캐시 수명 정책은112번에서 연결한다.
- 메타데이터는 원래 다이어리 제목, 작성자/주제/키워드 비움, Creator/Producer=DIO, 생성/수정일=스냅샷 시각으로 명시한다.

## 108번 계약 후속 수정

[PDF 계약](./pdf-export-contract.md)의3절 입력 본문을 current/pages/range로 직접 정리했다. 이전 내용을 대체한다는 선언을 삭제하고 검토 이력은 본문 뒤 부록으로 분리했다. 전체 선택의21장/80MP 비활성화·일부 선택 허용, 실제 캔버스 규격과 픽셀 예산도 반영했다.

## 검증 결과 (2026-10-20)

- `node --test tests/*.test.js`:69/69 통과(기존58+PDF11). 109번 미병합 테스트6개는 이 브랜치 수에 포함하지 않는다.
- 실제 생성된 PDF를 pdf-lib로 재열람해 면 수·A4·원래 문서 순서의 빨강/파랑 RGB 스트림·SMask 없음·메타데이터를 확인했다. 20개의 작은 빈 면, 잘못된 선택/규격/PNG, 부분 실패·IO 실패·취소·시간 초과·늦은 파일 정리, 웹 Blob 및 네이티브 File mock도 확인했다.
- 별도 임시 진입점에서 새 PDF 모듈을 실제로 import하여 Web·Android Expo export 통과. 진입점/package main은 finally에서 복원했고 산출물은 저장소 밖 tmp/pdf110-web·tmp/pdf110-android다. 현재 앱 경로에 아직 import하지 않은 코드를 일반 앱 번들 성공만으로 검증하지 않았다.
- 사용자 앱과 분리한127.0.0.1:8111·새 BrowserContext에서1280×800 논리 페이지2장(각2560×1600 PNG)을 PDF로 조립했다. application/pdf·25,376바이트·%PDF-1.7 헤더, pageerror0건이다. 합성 단색/반투명 데이터로 실제 사진 메모리·성능을 대표하지 않는다.
- 초기 ESM/default UMD 진입점은 Metro에서 실행 오류가 나 namespace UMD로 수정 후 다시 검증했다. 실패한 시도는 최종 성공 수에 포함하지 않는다.
- 109번 실제 React surface 연동·사진/GIF/필기 전체 출력은111·113번 통합 검증으로 남는다. 네이티브 실기기·사진첩/파일 공유·72번 텍스트·JPEG 화질 비교는 미검증이다.
- 변경은 110번 브랜치의 develop 대상 MR에서 검토한다. 전체 기능 완료와 실기기 검증은 후속 범위다.

## 참고

- [pdf-lib PDFDocument API](https://pdf-lib.js.org/docs/api/classes/pdfdocument)
- [UPNG.js 공식 저장소](https://github.com/photopea/UPNG.js) 및 설치된2.1.0의불투명 RGB 인코딩 경로
