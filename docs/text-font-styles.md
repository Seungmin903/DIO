# 글꼴별 굵게·기울임 지원 (181)

Jira: [S15P31F106-181](https://ssafy.atlassian.net/browse/S15P31F106-181)

기준 develop `8616f5f`, 브랜치 `fix/fe/text-font-styles`.

## 원인과 정책

기존 앱은 커스텀 글꼴의 Regular 파일만 등록한 뒤 모든 글꼴에 `fontWeight: 700`·`fontStyle: italic`을 요청했다. 실제 패키지 메타데이터에서 나눔고딕·나눔명조는 Regular/700/800을, 나눔손글씨 펜·푸어스토리는 Regular만 제공한다. 네 커스텀 글꼴 모두 Italic 파일이 없다. iOS React Native의 face 선택은 제공된 서체 안에서 일치하는 스타일을 찾으므로 단일 Regular만 등록한 경우 요청한 외형이 보장되지 않는다. 사용자 제보의 정확한 글꼴과 기기별 결과는 실기기 확인이 필요하다.

사용자는 미지원 서식을 비활성화하고 안내하는 정책을 선택했다. 실제 Bold를 제공하는 두 글꼴은 파일을 추가 등록하고, 선택한 face에 없는 굵기·기울임을 다시 요청하지 않는다.

| 글꼴 | 굵게 | 기울임 |
|---|---|---|
| 기본 고딕 | OS 기본 서식 | OS 기본 서식 |
| iOS 기본 명조(AppleMyungjo) | 미지원 | 미지원 |
| Android·웹 기본 명조 | OS/브라우저 기본 서식 | OS/브라우저 기본 서식 |
| 나눔고딕·나눔명조 | 실제 700 Bold 파일 | 미지원 |
| 나눔손글씨 펜·푸어스토리 | 미지원 | 미지원 |

Apple은 AppleMyungjo를 Regular로 열거한다. System의 한국어 대체 글리프 등 OS 기본 서식의 실제 외형은 iPad QA에서 확인해야 한다.

근거: [Expo 글꼴 사용 문서](https://docs.expo.dev/develop/user-interface/fonts/), [Apple 시스템 서체 목록](https://developer.apple.com/fonts/system-fonts/), 설치된 `@expo-google-fonts/*/metadata.json`, `react-native/React/Views/RCTFont.mm` 및 `expo-font/ios/FontFamilyAliasManager.swift`.

## 구현과 데이터 영향

- 나눔고딕·나눔명조 700Bold를 `NanumGothicBold`, `NanumMyeongjoBold`로 각각 등록한다. 기존 패키지에 포함된 파일이므로 의존성을 추가하지 않는다. 압축 전 에셋은 합계 5,145,552바이트(약4.91MiB) 늘어난다.
- 공통 `textStyle`이 등록된 face를 선택한다. 별도 Bold face에는 weight 400/normal을 주어 OS가 존재하지 않는 스타일을 다시 찾지 않도록 한다. 실제 굵기는 선택한 Bold 파일의 윤곽에 있다.
- 설정 UI의 미지원/로딩/실패 서식은 누를 수 없으며, 비활성 상태와 이유를 안내한다. 밑줄·취소선 등 나머지 서식은 유지한다.
- 다른 글꼴을 선택하면 호환되지 않는 bold/italic만 false로 설정한다. 일반 편집 변경처럼 저장·Undo/Redo 경로를 사용한다.
- 기존 문서의 font ID·bold/italic·부분 크기 데이터를 일괄 변경하지 않는다. 이미 저장된 미지원 요청은 렌더러와 UI가 미지원으로 해석한다. 커스텀 글꼴은 웹·Android에서도 같은 지원 정책을 적용한다.
- 로드 완료/실패 상태를 구독해 캔버스·재편집 입력·설정·투명 링크 배치를 갱신한다. 글꼴별 스냅샷을 사용해 다른 글꼴 로드가 모든 텍스트를 다시 그리게 하지 않는다. 실패한 face는 선택하지 않고 Regular 또는 기존 시스템 대체 글꼴로 표시한다.
- 내보내기에서 사용하는 공통 스타일도 같은 face를 선택하며 웹 폰트 준비는 실제 face 이름으로 요청한다. 앱 초기 글꼴 준비를 기다리는 새 내보내기 흐름을 추가한 것은 아니다.

## 검증

- `node --test tests/text-font-styles.test.js tests/text-fonts.test.js tests/text-settings.test.js tests/text-editor-render.test.js tests/export-content.test.js`: 17개 통과.
- 실제 로더의 6개 face 등록·중복 호출 방지·실패 상태, iOS/Android/웹 Bold 선택·Regular 복귀·미지원 정책, 글꼴 전환 시 설정 정리, 구독·기존 문서 복원·부분 스타일·출력 face 준비를 검증했다.
- `node node_modules/expo/bin/cli export --platform ios --no-bytecode --output-dir .expo/text-font-styles-ios`: iOS JavaScript 번들 생성 성공. 두 Bold 파일의 에셋 포함을 확인했다. 실제 기기 렌더링 확인은 아니다.
- `git diff --check`: 통과.
- `node tests/text-font-styles-browser.cjs`: 독립 Edge Chromium에서 실제 Bold 파일 렌더링 및 실제 설정 UI를 확인했다. 검은 픽셀의 농도 합계가 나눔고딕은 약357,059→552,999, 나눔명조는 약281,712→386,823으로 증가했다. 커스텀 글꼴의 기울임 비활성화, 손글씨 두 종류의 굵게·기울임 비활성화/안내, 실제 글꼴 전환에 따른 이전 설정 해제를 확인했다.

브라우저 검증은 `frontend`에서 `node node_modules/expo/bin/cli start --web --localhost --port 8096` 실행 후 다른 터미널에서 스크립트를 호출한다. `TEXT_FONT_METRO_PORT`, `BROWSER_EXECUTABLE`로 포트·브라우저 경로를 지정할 수 있다. 별도 fixture로 앱 저장소를 읽거나 쓰지 않는다. 결과·스크린샷은 `.expo/text-font-results`(ignore 대상)에 생성한다.

## 남은 iPad 확인

1. 기본 고딕·명조, 나눔고딕·명조, 손글씨 두 종류에서 굵게·기울임 버튼의 활성 상태와 안내를 확인한다.
2. 나눔 두 종류의 굵게 켜기/끄기를 한글·영문으로 비교한다. 재편집 입력·캔버스·썸네일·출력에서 같은 글꼴인지 확인한다.
3. 미지원 글꼴로 전환·다시 지원 글꼴 선택, Undo/Redo·저장 후 재실행 및 부분 크기·색상·링크를 확인한다.
4. 첫 진입 중 로딩과 실패 시 안내를 확인하고 기기 모델·iPadOS·글꼴·설정을 기록한다.

실기기 확인 전까지 Jira는 진행 중이다. MR !94로 제출했다.

최신 develop `4560f2d` 반영 시 문서 색인의 180·181 링크를 모두 유지했다. `node --test tests/text-font-styles.test.js tests/text-fonts.test.js tests/text-settings.test.js tests/text-editor-render.test.js tests/export-content.test.js tests/element-resize.test.js tests/element-selection.test.js tests/text.test.js`로 글꼴 서식과 텍스트 높이 조절을 함께 확인해 40개가 통과했다.
