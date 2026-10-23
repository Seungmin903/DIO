# iOS 내보내기 픽셀 규격 보정

관련 Jira: [S15P31F106-162](https://ssafy.atlassian.net/browse/S15P31F106-162)

## 사용자 기기에서 발견한 문제

iPad 사진첩에서 정사각형이 2160×2160, 스토리가 2160×3840으로 확인됐다. 목표는 각각 1080×1080, 1080×1920이다. 네 가지 프리셋 모두 PNG 저장 자체는 성공했다. 세로 피드와 자유의 실제 크기는 아직 수집하지 않았다.

## 원인과 수정

설치된 react-native-view-shot iOS 구현은 요청 크기를 UIKit 포인트 크기로 받고 UIGraphicsImageRenderer의 scale=0(기기 배율)로 출력한다. 요청한 1080포인트가 2배 기기에서 2160픽셀이 된다.

- 공통 프리셋과 스냅샷의 pixelWidth/pixelHeight는 그대로 픽셀 목표값이다.
- iOS에 넘기는 캡처 크기만 PixelRatio.get()으로 나눈다. Android 요청 크기는 유지한다.
- 생성 PNG에서 시그니처·IHDR와 실제 가로·세로를 읽는다. 이미지 전체를 디코딩하지 않고 앞 24바이트만 읽는다.
- 실제 크기가 목표와 다르면 EXPORT_CAPTURE_SIZE_MISMATCH로 실패한다. 헤더가 올바르지 않으면 EXPORT_CAPTURE_INVALID로 실패한다. 실패 시 캡처 임시 파일을 해제한다.
- 성공 결과의 width/height에는 목표값을 추정해 넣지 않고 확인한 PNG 크기를 반환한다. dispose는 중복 해제하지 않는다.
- 전체 페이지 PNG·선택 영역 PNG·PDF는 같은 capturePage.native 경로를 사용한다. 웹 캡처·파일명·사진첩 권한·PDF 페이지 물리 크기·저장 데이터 계약은 바꾸지 않는다.

## 검증 및 남은 기기 확인

`cd frontend` 후 `pnpm test:export`로 캡처·영역·전체 페이지·PDF 회귀를 실행한다. capture-pixels 테스트는 iOS 배율 1/2/3, Android 요청 크기 보존, 헤더 검증, 2배 결과 차단, 읽기 실패·중복 dispose·자원 해제를 확인한다. 네이티브 부분은 모듈을 대체한 시뮬레이션이며 실제 UIKit 동작을 실행한 것은 아니다.

실행 결과: `pnpm test:export` 88개 통과, `git diff --check` 통과.

`pnpm exec expo export --platform ios --no-bytecode --output-dir .expo/ios-export-pixels-check`도 성공했다. iOS용 JS·에셋 번들 검사이며 Hermes 바이트코드 생성·설치 빌드·iPad 실행 검증은 아니다.

2026-10-21 사용자 iPad 확인: 수정 브랜치에서 스토리 출력 크기 수정 및 자유·정사각형·세로 피드·스토리 네 프리셋 확인 완료를 전달받았다. 정확한 기기 모델·OS 및 항목별 측정 기록은 수집하지 않았다. 아래 전체 페이지·PDF와 잘림 회귀까지 모두 완료했다는 의미는 아니다.

남은 기기 확인:

- 전체 페이지 PNG는 속지 기준 출력 크기와 일치한다.
- 선택선 기준 잘림·회전 사진·글씨가 유지된다.
- PDF 생성 성공, 페이지 수와 내용·잘림이 유지된다.

기존에 사진첩에 저장한 2배 이미지는 변경하지 않는다. 수정 후 새로 생성한 결과를 확인한다.
