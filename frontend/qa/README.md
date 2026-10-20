# 선택 영역 PNG QA 실행기 (119)

## 재실행

앱 의존성은 `frontend/package.json`과 `pnpm-lock.yaml`로 통일한다. `qa/` 아래 별도 npm 프로젝트나 node_modules를 만들지 않는다. 영역·미디어 QA 모두 같은 Playwright와 번들 Chromium을 사용한다.

`frontend/`에서 최초 한 번:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

각 QA 실행:

```sh
pnpm qa:region
pnpm qa:media
```

기본 실행은 Expo 웹 번들을 새로 생성하고 `127.0.0.1`의 빈 포트로 서버를 열어 별도 번들 Chromium 컨텍스트에서 검사한다. 기존 사용자의 브라우저·저장소와 분리하며 종료 시 서버와 브라우저를 닫는다. 실패하면 종료 코드 1을 반환한다.

```sh
# 포트/설치된 브라우저 채널 지정
pnpm qa:region --port 8127 --channel msedge
# 동일 제품 코드에서 직전에 만든 번들 재사용 (코드 변경 뒤에는 사용하지 말 것)
pnpm qa:region --skip-build
```

`--out .out`은 이 QA 폴더 기준 경로다. 결과는 `.out/region-results.json`, 화면은 `.out/*.png`, 번들은 `.out/web/`에 생기며 모두 Git 제외 대상이다. QA 보고서는 커밋할 요약과 로컬 원시 결과를 구분한다. 앱 저장 키는 런타임 의존성이 없는 `src/editor/utils/storageContract.js`의 `STORAGE_KEYS`를 직접 import한다. 소스 문자열이나 버전을 정규식으로 추출하지 않는다. 좌표/픽셀 기준이 1280×800 테스트 페이지인 것은 의도한 oracle이며 제품 논리 규격 변경 시 fixture와 기대값을 함께 재검토한다.

## 범위

- 사분면 PNG, 회전·크롭 사진, 겹침 요소, 빨강/파랑 2프레임 GIF, 기본 텍스트와 펜 획을 실행 시 생성한다. 사진 crop은 `fx/fy/zoom`을 포함한다.
- 선택 화면 배율·뷰포트·DPR·스크롤, 픽셀 해시, 최소/경계/프리셋, 역방향 마우스 드래그와 작은 드래그 복원, CDP 한 손가락 가로 스크롤을 검사한다.
- 회전·크롭·겹침 영역을 전체 자유 2배 PNG의 동일 구역과 비교한다. 채널 차이 2 초과 비율 0.1% 미만을 허용한다. 이번 결과는 차이 최대 1이었다.
- picker 취소/공간 부족/저장 성공/중복 클릭은 브라우저 mock이다. mock write/close 완료와 UI 안내를 확인하며 실제 OS 파일 저장 검증으로 간주하지 않는다.
- 다운로드 fallback은 실제 브라우저 download 이벤트·파일명·실패 여부를 확인한다. 사용자가 선택한 파일 경로에 영구 보관됐다는 의미는 아니다.
- 모든 시나리오 뒤 문서 저장 문자열 불변과 pageerror 없음도 검사한다. 누락 소재는 영역 밖에 둬도 생성이 중단되고 저장이 차단되는 현 정책을 확인한다.

## 남은 확인

412×892/DPR 2와 CDP 터치는 브라우저 에뮬레이션이며 Android/iPad 실기기가 아니다. 실제 사진·대용량 문서·메모리·스타일 폰트/부분 텍스트·72번 전체 검증, 실제 사진첩 권한·저장·강제 종료 복원, 네이티브 캡처 품질, 실기기 수직/수평 스크롤·펜 입력·스크린리더는 별도로 확인한다. 합성 이미지의 시간은 일반 사용자의 실제 사진 성능을 대표하지 않는다.

!36 리뷰 재검증에서는 11개 시나리오를 실행한다. 닫기/재선택 구분, Modal 내부 확정 오류, 동적 규격의 SVG 속지 클리핑 비교를 추가했다. fixture는 canvasWidth/canvasHeight를 명시하고 템플릿 참조는 앱 catalog에서 읽는다.

기존 실행 환경에서 `frontend/qa/node_modules`를 설치한 경우 이 폴더를 먼저 제거해야 한다. 남아 있으면 Node의 가까운 패키지 우선 탐색 때문에 qa:media까지 예전 Playwright를 불러올 수 있다. 이전 npm 전용 package.json/package-lock.json은 제거했다.

## PDF 생성·저장 QA (113)

`pnpm qa:pdf`는 공통 localhost 실행기를 재사용해 `.out/pdf`에 결과와 화면을 남긴다. 기본 실행은 웹 번들부터 생성한다. 같은 코드의 직전 번들만 재사용하려면 `pnpm qa:pdf --skip-build`를 사용한다. 번들은 스위트마다 따로 만든다(`qa:region`은 `.out/web`, `qa:pdf`는 `.out/pdf/web`). `--skip-build`로 실행했는데 해당 스위트의 번들이 없으면 시나리오를 시작하지 않고 바로 실패한다. PDF 면 수·순서·A4/RGB/메타데이터·사진/스티커/테이프/GIF·기본 필기와 텍스트, 저장 취소/실패/재시도·생성 취소·20/21페이지·중간 면 실패를 확인한다. 실제 모바일 공유와 72번 전체 검증은 포함하지 않는다.
