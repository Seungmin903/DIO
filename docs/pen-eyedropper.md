# 펜·형광펜 캔버스 스포이트

관련 이슈: [S15P31F106-439](https://ssafy.atlassian.net/browse/S15P31F106-439)

## 사용 방법

펜·형광펜 설정의 기본색 7개 옆 + 원은 현재 색을 직접 지정한다. 기존 팔레트 칸 변경은 ‘팔레트 편집’ 후 색 칸을 선택한다. 공용 창의 X·바깥·뒤로가기는 확정한다. ‘내 색상’은 제공하지 않으며 최근 실제 사용 색 8개는 별도로 기록한다.

스포이트는 PresetColorEditor 공용 경로를 사용한다. Android/iOS는 앱 전체 화면 캡처, 웹은 브라우저 EyeDropper로 선택한다. 앱은 원형 3배 돋보기와 새 색/이전 색 반원 링을 보여준다. 상세 검증과 플랫폼별 한계는 [색 창 통합](./color-picker-unification.md)을 따른다.

## 이전 캔버스 전용 구현 이력

아래 항목은 통합 전 캔버스 전용 경로의 기록이다. 현재 펜은 위 공용 전체 화면 경로를 사용한다.

- 속지·사진·스티커·텍스트·필기 그림 층만 한 번 캡처한다. 격자·선택 테두리·도구 UI는 제외한다.
- 긴 변 최대 2048px의 PNG를 RGBA로 한 번 해석하고 포인터 픽셀을 평균 없이 읽는다. 캡처 실제 크기와 확대·이동 좌표를 반영한다.
- 캡처와 픽셀 버퍼는 기기 안에서만 처리하며 완료·취소·실패 시 해제한다. 뒤늦게 완료된 캡처도 폐기한다.
- 페이지 밖 놓기·입력 취소·뒤로가기·Esc·백그라운드·페이지/내용/화면 크기 변경은 색을 적용하지 않는다. 캡처 실패는 기존 색을 유지하고 재시도를 제공한다.
- 문서 형식·서버 API·기존 획은 변경하지 않는다. 새 네이티브 모듈을 추가하지 않는다.
- 공용 PresetColorEditor와 기존 웹/네이티브 eyedropper 유틸은 보존한다. 캔버스용 유틸은 canvasEyedropper.js로 분리한다.
- iPad 점진 렌더링은 일반 페이지 전환에서 유지하고 캡처 중에는 전체 그림을 표시해 일부 획만 캡처하지 않게 한다.
- 네이티브 측정이 늦어도 색 칸 클릭은 즉시 창을 연다. 팔레트 복원 전 편집은 비활성화한다. RN 0.88에서 제거된 absoluteFillObject 대신 명시적 절대 좌표를 사용한다.

## 이전 스포이트 구현 검증 기록 (2026-11-03)

아래 기록·화면은 통합 전 UI의 이력이다. 현재 색 창 검증은 위 통합 문서를 따른다.

- `node --test tests/color-picker-opening.test.js tests/color-picker-placement.test.js tests/eyedropper.test.js tests/capture-pixels.test.js`: 14개 통과.
- 펜 설정·펜 입력·형광펜·페이지 이미지 회귀: 39개 통과. 네이티브 페이지 준비/점진 표시 회귀: 2개 통과.
- `EXPO_QA_PORT=8084 node tests/eyedropper-browser.cjs`: Windows Edge 실제 EditorScreen, 1280×800 / 390×844 / 844×390 통과. 반투명 합성 색상 #8A315C, 사진 #E08020, 펜·형광펜 적용, 프리셋 저장, 취소·회전·실패/재시도·늦은 캡처 해제, 문서 불변을 확인했다.
- `expo export --platform all --output-dir .expo/eyedropper-publish-export`: Android/iOS Hermes 및 웹 산출물 생성 완료. CLI는 산출 완료 뒤 종료 지연 경고를 남겼다. 앱 설치·실기기 실행 검증과는 별개다.
- 이전 혼합 작업 폴더에서는 Android 에뮬레이터의 Expo Go로 + 열기와 펜·형광펜 색 적용을 확인했다. 이 분리 브랜치의 실기기 Android/iPad 재검증은 수행하지 않았다. 에뮬레이터 및 브라우저 검증을 실기기 검증으로 간주하지 않는다.
- Expo Go 시작 시 발생한 ExpoCrypto/Reload 문제는 별도 사안이며 이 변경으로 해결됐다고 판단하지 않는다.

## 화면 자료

![독립 색 선택 창](./images/pen-eyedropper/color-picker-1280x800.png)

![현재 캔버스에서 색 선택](./images/pen-eyedropper/drag-preview.png)

![좁은 화면 색 선택 창](./images/pen-eyedropper/color-picker-390x844.png)
