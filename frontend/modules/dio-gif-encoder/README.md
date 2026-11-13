# dio-gif-encoder

페이지 GIF 묶기(팔레트 · 번호 매기기 · LZW)를 Android 네이티브(Kotlin)로 한다. JS 의 `createGifAssembler`(`src/editor/utils/gifExport.js`)를 그대로 옮긴 것이라, 같은 입력이면 같은 GIF 바이트가 나와야 한다.

- 연결: Expo autolinking 이 `frontend/modules/` 를 기본으로 찾으므로 따로 설정하지 않는다. 새 네이티브 모듈이라 **개발 빌드를 새로 만들어야** 들어간다. 모듈이 없는 빌드(이전 개발 빌드 · Expo Go · iOS · 웹)는 JS 로 묶고, Android 개발 빌드에서는 그때 콘솔에 `DioGifEncoder native module not in this build` 를 남긴다.
- JS 와 바이트가 같은지 보는 고정 입력: `node scripts/make-fixture.mjs` 로 `android/src/test/resources/gif-fixture.*` 를 다시 만든다. JS 묶기를 바꾸면 다시 만들고 Kotlin 테스트를 돌린다.
- 테스트
  - JS 쪽(고정 입력이 지금 JS 묶기와 같은지): `pnpm test:gif` (frontend/)
  - Kotlin 쪽(고정 입력과 같은 바이트를 내는지): `npx expo prebuild -p android` 뒤 `cd android && ./gradlew :dio-gif-encoder:testDebugUnitTest`
  - **CI 에서는 Kotlin 테스트를 돌리지 않는다.** `GifAssembler.kt` 나 JS 묶기를 바꾸면 MR 전에 위 두 테스트를 직접 돌린다.
