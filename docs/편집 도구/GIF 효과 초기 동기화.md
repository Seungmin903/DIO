# 기본 GIF 스티커 효과 초기 동기화 (207)

## 기준과 원인

- 기준: develop `6cee1f8`, Jira S15P31F106-207.
- 기존 iOS는 동일 PNG 프레임을 여러 native Image에 전달했으나, 각각 비동기로 로딩했다. Android는 본체와 효과가 GIF를 독립 재생했다. 따라서 같은 재생 시점·로드 완료를 보장하지 못했다.
- 사용자 보고는 기본 GIF이며 iPad·Android 모두 발생 가능하다는 내용이다. 두 기기의 직접 재현은 아직 하지 않았다.

## 변경

- 두 native 플랫폼에서 효과가 켜진 GIF는 공통 PNG 프레임 준비/재생기를 사용한다.
- 단일 SVG Image를 정의하고 본체와 윤곽선·그림자의 alpha mask가 Use로 같은 노드를 참조한다. 효과용 GIF/이미지 디코더를 별도로 만들지 않는다.
- 준비 중 기본 제공 PNG poster도 같은 SVG 경로로 표시한다. 준비 실패 시 정지 poster와 기존 오류 안내를 유지한다.
- 효과 오프, 일반 정지 스티커, 웹 및 정지 내보내기는 기존 경로를 유지한다. GIF 원본은 변경하지 않는다.
- 기존 재생기 프레임/픽셀 상한, 캐시 공유, 백그라운드 일시정지 및 자원 정리 정책을 유지한다. 개별 이미지의 로딩 속도 차이는 제거하지만 SVG 처리 비용과 프레임 전환의 실기기 성능은 별도로 검증해야 한다.

## 자동 검증

frontend에서:

```sh
node --test tests/sticker-effects-render.test.js tests/sticker-playback.test.js
```

17개 통과: 두 플랫폼의 단일 프레임 렌더링 연결, poster/실패, 효과 오프·정지 출력·웹 회귀, SVG 단일 Image와 alpha mask 참조, 기본 GIF 36종 변환, 프레임/픽셀 상한, disposal, 캐시/취소/자원 정리, 백그라운드 재생 시계.
컴포넌트 테스트는 구조 검증이며 native SVG의 실제 픽셀 결과를 검증한 것은 아니다.

iOS·Android Hermes 번들 생성 통과:

```sh
node node_modules/expo/bin/cli export --platform ios --output-dir .qa-gif-startup-ios --max-workers 2
node node_modules/expo/bin/cli export --platform android --output-dir .qa-gif-startup-android --max-workers 2
```

iOS 첫 시도는 샌드박스 임시 hbc 쓰기 권한으로 실패했고, 동일 명령을 제한 밖에서 재실행하여 통과했다. 번들 생성은 실기기 실행 검증이 아니다.

## 남은 실기기 QA (iPad와 Android 각각)

1. 앱을 새로 열어 기본 GIF를 추가하고 윤곽선만/그림자만/둘 다 켠다. 첫 표시부터 본체와 효과의 모양이 맞는지 본다.
2. 여러 GIF, 복제본, 빠른 효과 토글·색상/굵기 변경, 크기·회전·뒤집기를 확인한다. 효과 잘림과 사각 배경도 없어야 한다.
3. 다른 페이지로 이동/복귀, 앱 백그라운드/복귀, 재실행 시 동기화·메모리·응답성을 확인한다.
4. 효과를 끄면 원래 GIF 재생으로 돌아가고 정지 스티커·내보내기는 유지되는지 확인한다.
5. 많은 GIF에서 초기 준비 및 재생 중 깜빡임/지연을 기록한다. 단일 이미지 참조는 로드 동기화 설계이며 무지연 재생을 보증하지 않는다.

Jira는 실기기 검증 전 진행 중으로 유지한다.
