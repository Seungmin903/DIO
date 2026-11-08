# DIO final mascot

## 2026-11-08 새 모아 그림으로 교체

로고 · 설치 아이콘 · 시작 화면의 모아를 빈 화면에 쓰는 새 모아(전소연 new_moa, 2026-11-06)를 곡선 벡터로 다시 그린 그림으로 바꿨다. 얼굴은 사용자 수정본(눈 지름 45 · 입 선 굵기 13.3, 두 눈 정가운데)이다.

- 구도는 예전 로고와 같다. 예전 로고 모아 실루엣에 새 모아를 겹침 최대로 맞춘 값(12.97° 회전, 1.773배, 이동 -322.19, -329.9 · 겹침 98%)을 SVG `transform`에 그대로 적는다. 틀은 1254 정사각 rx 212 둥근 사각형이고 모아도 이 틀로 잘린다.
- mascot-final-*.svg: 둥근 사각형 바깥 투명. launcher/app-icon-square-*.svg: 정사각 연보라 바탕 전체. 채색 · 윤곽 분리본도 같은 구도다.
- launcher/app-icon-square-foreground.png: 바탕 없는 모아(투명). Android adaptive 전경은 이 PNG로 만든다(예전 정수 사각 경로 SVG 해석 대신).
- mascot-splash.png: 시작 화면 애니메이션 그림(바탕 없음, 같은 구도).
- display/*, images/*는 `pnpm brand:icons`로 다시 만들었다. brand-logo 테스트의 얼굴 · 책갈피 좌표를 새 그림 기준으로 바꿨다.
- 설치 아이콘 · Android 마스크 · iOS 시작 화면은 새 네이티브 빌드에서 확인이 필요하다.

아래는 2026-11-04 원본 교체 때의 기록이다.

## 설치 아이콘 모서리 보완

설치용 원본은 사용자 제공 app-icon-square.zip의 6개 파일을 launcher/에 보관한다. 일반 아이콘은 app-icon-square-combined.png를 1024px로 축소한다. Android 전경은 해당 SVG의 background 레이어를 제외한 정수 사각 경로를 렌더링해 중앙 683px 표시 영역에 배치한다. 얼굴과 책갈피 중심은 66/108 안전 영역 안에 두며 표지 외곽은 시스템 마스크로 잘린다. 배경은 app.json의 #F0ECFD가 전체를 채운다. 실제 원형·둥근 사각형 외곽은 런처가 결정한다. 설치 아이콘은 새 네이티브 빌드에서 확인한다.

Jira: S15P31F106-476. 사용자 제공 최종 원본(2026-11-04).

- mascot-final-combined.png/svg: 승인된 완성본
- mascot-final-colors.png/svg: 채색 분리본
- mascot-final-outlines.png/svg: 윤곽 분리본

BrandLogo는 완성본 PNG를 사용한다. frontend에서 `node scripts/generate-brand-icons.cjs`로 설치·시작·웹 아이콘을 생성한다. 원본 6개는 변형하지 않으며 dio-logo.svg는 과거 자료로 보존한다.
Android 마스크와 iOS 시작 화면 전환·설치 아이콘은 새 빌드 확인이 필요하다.

최종 적용 원본은 사용자 제공 app-icon-transparent-fixed.zip 수정본이다. ZIP의 app-icon-{combined,colors,outlines}.png/svg를 기존 mascot-final-* 파일명으로 보관한다. 둥근 모서리 외부는 투명하며 앱 내부에서 별도 모서리 마스크를 사용하지 않는다. 설치 기본 아이콘만 연보라 배경으로 불투명 합성하고 시작 화면·favicon·adaptive 전경은 투명도를 보존한다.

## 리뷰 확인

- 재생성은 직접 devDependency jimp-compact와 `pnpm brand:icons`를 사용한다. Expo 내부 의존 경로를 사용하지 않는다.
- BrandLogo 사용처는 AuthScreen, BootSplash이며(편집기 상단 바 TopBar · 읽기 화면 ReadingChrome 의 돌아가기는 2026-11-08 집 모양 홈 아이콘으로 바꿨다) color/accent 인자는 사용하지 않는다. 정사각 비율은 새 원본에 맞춘 의도된 변경이다.
- BootSplash 이미지 onLoadEnd 후 네이티브 시작 화면을 내리며 기존 앱 준비 완료/8초 제한에 의한 해제 경로도 유지한다. 네트워크가 느린 개발 빌드의 실제 시작 전환 확인은 남아 있다.
- android/는 체크아웃에 없고 빌드 시 생성된다. withSplashWindowBackground 플러그인은 Theme.App.SplashScreen의 windowSplashScreenAnimatedIcon을 투명 XML로 덮어쓰므로 생성된 splashscreen_logo.png가 있어도 이 속성으로 표시하지 않는다. iOS는 expo-splash-screen 설정의 새 splash-icon.png를 사용한다. 새 네이티브 빌드에서 확인해야 한다.
- SVG 3개는 원본 6개와 함께 커밋에 포함된다.

- 윤곽 축소 표시 확인: 테이프 pixelSnap은 반복 무늬의 경계 정렬용이다. 로고는 정사각 정수 크기를 유지하고 사진 표시와 동일하게 RN Image resizeMethod=scale, fadeDuration=0으로 Android 사전 축소 디코딩과 페이드를 피한다. 원본의 윤곽은 수정하지 않으며 실기기 전후 비교로 효과를 확인한다.

- 크기별 축소 표시 보완: brand/display에 24·28·30·32·52·160의 1x/2x/3x PNG를 원본에서 Hermite 면적 보간으로 생성한다. Metro가 기기 밀도에 맞는 파일을 선택한다. native scale 옵션만으로 해결되지 않아 적용한 비교안이며 실기기 결과는 확인 중이다.

## b62e93bd 리뷰 검증

- finishBoot는 setBooting(false)와 hideSplash를 함께 실행한다. 목업·설정 오류·8초 제한 경로 모두 이 함수를 호출한다. 이미지 콜백과 완료 경로의 해제는 기존 expo-splash-screen hideAsync를 사용하며 거부된 Promise는 처리한다.
- 신규 표시 크기도 1254px 원본으로 되돌아가지 않고 다음 큰 준비 이미지를 사용한다. 최대 크기보다 크면 160의 밀도별 이미지를 사용한다. 새 고정 크기를 추가할 때는 생성 목록을 확장한다.
- jimp-compact 0.16.1은 package.json 및 pnpm-lock.yaml importer에 함께 등록돼 있다.
- `node --test tests/brand-logo.test.js tests/splash-config.test.js`: 4개 통과. JSX 렌더 결과의 크기·소스·콜백과 Expo introspect의 Android 빈 아이콘 스타일을 확인했다. 실제 설치 빌드 검증과는 구분한다.

## 55c81a61 리뷰 보완

Git index에 pnpm-lock.yaml 및 mascot-final-{colors,combined,outlines}.svg 3개가 모두 추적되는 것을 확인했다. test:auth에 brand-logo.test.js를 등록했다. 지원 크기 24·28·30·32·52·160을 디자인 가이드에 명시하고 목록 밖 크기에 개발 경고를 한 번 표시한다. 로고/시작 화면 테스트 최종 5개 통과(이전 4개 결과에 경고 테스트 추가).

## Android adaptive 전경 안전 영역 보완

완성본 전체(연보라 둥근 배경 포함)를 보존하기 위해 전경을 1024 캔버스 중앙 440×440(좌상단 292,292)로 배치한다. 440×sqrt(2)는 1024×66/108보다 작아 그림의 정사각 경계 전체가 중앙 원형 안전 영역 안에 들어간다. 기존 660 전경을 축소한 것이며 앱 내부·iOS 기본 아이콘 크기는 바꾸지 않는다. brand-logo 테스트에서 모든 불투명 픽셀이 해당 원 안에 있는지 검사한다. 실제 런처의 최종 표시 확인은 새 빌드로 진행한다.
