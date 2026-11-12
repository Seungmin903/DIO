# Android·웹 배포물의 코드 라이선스와 소스 제공

## 푸시 통합 후 감사 (2026-10-31)

푸시 의존성과 최신 develop의 PDF 모듈을 포함한 `releaseRuntimeClasspath` 및 푸시 활성 Android·웹 소스맵을 기준으로 고지와 대응 소스를 다시 생성했다. Android 고지 284개와 웹 고지 47개를 준비했고, 실제 웹 배포물과 로컬 감사용 Android APK/AAB에서 각각 포함된 JS 41개·54개 패키지 및 Android 네이티브 라이브러리 각 46개를 대조했다. 앱에 들어간 고지·대응 소스와 UI 목록 지문도 검증했다.

`installreferrer:2.2`와 Google Play services의 `auth:21.4.0`, `auth-api-phone:18.0.2`, `auth-base:18.0.10`, `base:18.5.0`, `basement:18.5.0`, `cloud-messaging:17.2.0`, `fido:20.0.1`, `stats:17.0.2`, `tasks:18.2.0`(Google 로그인 추가로 2026-11-05 갱신)은 POM에서 Android SDK 계약을 가리킨다. 감사 목록은 해당 계약의 이름과 원본 URL을 명시하며 이를 MIT·Apache 오픈소스 라이선스로 바꾸지 않는다. Play services AAR에 포함된 `third_party_licenses.txt` 전문은 SDK 계약과 구분해 원문대로 보존한다. JSON 색인 범위를 확인하고 다른 버전·변경된 POM·고지 파일 구조는 재검토 전 거부한다. installreferrer AAR에서는 같은 이름의 제3자 고지 파일이 없어 없다고 기록한다. SDK 계약의 적용 및 기타 상용 배포 권리에 관한 최종 판단을 이 기술 감사가 대신하지는 않는다.

검증 대상 APK/AAB는 로컬 템플릿의 테스트 키로 서명한 감사용 릴리스이며 스토어 게시용이 아니다. 푸시 자격증명·실기기 수신과 모델 가중치·학습 데이터·상표·코덱 특허는 이 검증 범위에 포함되지 않는다.

검토 대상은 `feature/fe/personal-handwriting-font`의 Android **release** 런타임과 웹 정적 배포물이다. 모델 가중치·학습 데이터의 권리는 제외한다. 이 문서는 특정 파일의 코드·고지·소스 제공을 대조한 기술 검증 기록이며, 앱의 모든 상용 배포 권리를 보증하는 문서는 아니다. 최초 검토 당시에는 원격 배포·커밋·푸시를 수행하지 않았으며, 이후 사용자가 요청한 develop 반영의 통합 사항은 아래에 구분한다.

## 실제 포함 대상을 정하는 방법

- JavaScript: 최종 Metro 소스맵에서 실제 포함 패키지와 버전을 찾는다. 설치된 532개 패키지를 모두 배포 코드로 취급하지 않는다. 현재 웹은 JS 41개 패키지에 별도 HEIC 모듈을 제공하며, Android는 JS 49개 패키지를 포함한다.
- Android: `releaseRuntimeClasspath`의 Maven 아티팩트 158개와 로컬 프로젝트 17개를 수집한다. POM·동일 버전 소스 JAR·AAR/JAR 내부 고지와 로컬 npm 원본을 대조한다. 같은 좌표의 여러 아티팩트는 고지 항목에서 합친다.
- 네이티브: AAR의 JNI 라이브러리와 최종 APK/AAB의 `.so`를 SHA256 또는 ELF GNU Build ID로 대조한다. 2026-10-28 감사에서는 `libc++_shared.so`를 당시 NDK 28.2.13676358과 대조했다. 이후 푸시 통합 감사 빌드의 실제 Gradle NDK는 27.1.12297006이며, 해당 빌드의 libc++는 fbjni 아티팩트와 일치했다. 최종 배포 빌드마다 실제 NDK와 네이티브 라이브러리를 다시 대조한다. 앱에서 컴파일한 `libappmodules.so`, `libexpo-modules-core.so`, SVG·safe-area의 codegen 라이브러리는 React Native·Expo·해당 로컬 npm 모듈의 고지에 연결한다.
- 코드에 내장된 부품: ONNX Runtime의 Eigen, OkHttp의 Public Suffix List, Hermes의 런타임 고지, Fresco의 JPEG/PNG/WebP/GIF, React Native의 C++ 부품과 Android NDK 런타임 고지를 추가한다. 원본의 광범위한 NOTICE는 ‘upstream component superset’으로 표시하며, 선택 기능이 전부 포함됐다는 뜻으로 쓰지 않는다.
- 추가 JNI: `libavif_android.so`는 libavif `14d8e3c4`의 JNI 설정·빌드 스크립트와 바이너리 문자열을 대조해 dav1d·libyuv의 원저작권·특허 고지를 함께 제공한다. 스크립트의 참조 버전은 dav1d 1.4.3, libyuv 464c51a0이며 공식 AAR의 모든 컴파일 옵션을 재현했다고 주장하지 않는다. APNG4Android 3.0.5의 GIF JNI는 해당 태그의 CMake·C++와 Apache 고지를 확인한다. zstd-kmp 0.4.0이 정적으로 연결한 Zstandard는 원본 submodule 커밋 `1dbc2e09084e843f6c0dcc2d0791610015c50979`의 BSD 조건을 선택해 고지한다.
- Skia(2026-11-05 추가): `@shopify/react-native-skia` 2.14.0은 Android에서 `react-native-skia-android` 154.0.0(Skia m154) 정적 라이브러리를, 웹에서 `public/vendor/canvaskit/0.41.0/canvaskit.wasm`을 쓴다. 정적 라이브러리 문자열에서 FreeType·HarfBuzz·libpng·zlib·Expat·libjpeg-turbo·libwebp·Wuffs·DNG SDK·piex·ICU 흔적을 확인했고, Skia `chrome/m154` DEPS(`skia-m154-DEPS.txt`)에 고정된 각 커밋의 원문 라이선스를 `inputs.json`에 해시로 고정해 고지한다. FreeType은 FTL을 선택하며, FTL·DNG SDK·IJG가 요구하는 문구를 고지 항목의 `notice`에 둔다. 웹 CanvasKit 항목은 m154 기준 ‘reference notices’(상위 집합)이며 CanvasKit 빌드에 모두 포함됐다는 뜻이 아니다.
- 폰트·콘텐츠: 기본 Google Fonts 패키지의 OFL 원문과 콘텐츠 고지는 `contentLicenses.json` 에서 읽는다. 외부 기본 스티커(Fluent · Noto · Twemoji)는 커밋 `06818fdf`에서 그림과 고지 파일을 함께 지웠고, 이 커밋은 develop 병합 `e36ecafc`(`feature/fe/editor-widget-tab`, 2026-11-02)로 이미 들어가 있다. 지금 `frontend/` 추적 파일에 Fluent · Noto · Twemoji 그림이 없어(`git ls-tree` 0건) 목록은 비어 있다. 이모지는 기기 · 브라우저 기본 글꼴로 그리는 글자라 앱에 이모지 그림을 넣지 않는다. 이런 그림을 다시 넣으면 CC BY 4.0 고지 행과 `contentLicenses.json` 항목도 함께 되살린다. 개인 손글씨 원본·폰트는 이 수집 과정에서 읽지 않는다.

## 조건과 반영 내용

| 구분 | 배포 시 조건 | 반영 |
| --- | --- | --- |
| MIT·BSD·ISC 등 | 원저작권·허가·면책 고지 보존. BSD 등의 이름을 이용한 추천·보증 금지 조항 유지 | 패키지 원본 LICENSE, 내장 NOTICE와 원본 소스 헤더를 보존. 앱에서 오프라인 열람, 배포물의 통합 전문에도 포함 |
| Apache-2.0 | 전문과 제공된 NOTICE 보존, 변경한 원본을 배포할 때 변경 표시 | 원본 JAR/AAR·동일 버전 소스 JAR 고지와 Apache 전문 포함 |
| 웹 HEIC: LGPL-3.0 계열 | 라이선스·저작권과 대응 소스 제공, 수정 라이브러리와 재결합 가능, 해당 수정의 디버깅을 위한 역공학을 제한하지 않음 | 원본 변환기를 Metro 앱 번들에서 분리. 같은 사이트의 `vendor/heic-to/1.6.6/heic-to.mjs`를 교체 가능하게 로드. 원본 소스·빌드 스크립트·재결합 안내 ZIP 제공 |
| Eigen: MPL-2.0 | 포함한 MPL 파일의 Source Code Form을 이용할 수 있게 하고 그 방법을 안내. 더 큰 앱 전체의 소스 공개 요구와 구분 | ONNX Runtime 1.23.2의 `cmake/deps.txt`가 지정한 정확한 Eigen 커밋 아카이브 제공. upstream SHA1과 자체 SHA256 검사 |
| Public Suffix List: MPL-2.0 | 실제 포함 데이터의 편집 가능한 소스와 라이선스 제공 | OkHttp 4.9.2의 gzip에서 정확한 규칙을 텍스트로 복원. DIO 변경 표시, 원래 NOTICE·MPL 전문·재생성 스크립트·원래 gzip 제공. 압축 해제한 규칙 payload의 완전 일치 검사 |
| 기본 폰트: OFL-1.1 | 원저작권·라이선스 보존, 폰트 단독 판매·Reserved Font Name 등 해당 조건 준수 | 패키지의 LICENSE_FONT를 원문 고지에 포함. 앱에 기본 폰트로 묶어 사용하며 개인 생성 폰트에 OFL이 적용된다고 가정하지 않음 |

`checker-compat-qual:2.5.5`의 POM에는 GPL2/Classpath와 MIT가 함께 적혀 있다. upstream LICENSE는 배포용 qualifier annotations가 MIT임을 명시한다. 이 아티팩트에는 MIT 주석 부분을 적용하며 GPL 컴파일러를 포함한 것으로 표시하지 않는다. `lightningcss`의 MPL과 `node-forge`의 복수 라이선스는 설치 목록에서 확인됐지만 현재 최종 JS 소스맵에 없는 빌드 도구다. 이를 실행 앱의 GPL/MPL 코드로 잘못 집계하지 않는다.

### 웹 LGPL 소스와 교체

원본은 `heic-to 1.6.6`, 내부 `libheif 1.23.6`, `libde265 1.0.16`이다. 원본 소스·빌드 스크립트·LGPL/GPL 전문·원본 prebuilt JavaScript·DIO 로더와 `REBUILD-AND-RELINK.txt`를 `heic-decoder-sources.zip`으로 제공한다. npm 원본의 wrapper·worker·빌드 스크립트·libheif JavaScript가 동일 버전 소스 아카이브와 정확히 일치하는지 검사한다.

소스 묶음의 DIO 로더·재생성 도구에는 별도 MIT 허가를 넣었다. 이 허가는 해당 도구에 한정되며 앱 전체·모델 가중치의 허가를 변경하지 않는다. Emscripten·musl·libc++의 원본 런타임 고지도 함께 보존한다. 런타임 고지 참조는 Emscripten 3.1.72이며 upstream의 정확한 컴파일러 버전이라는 뜻은 아니다.

호환 모듈로 `heic-to.mjs`를 교체하면 앱 JS를 다시 빌드하거나 서명 키를 얻지 않고 사용할 수 있다. `DIO_HEIC_DECODER_URL`로 같은 사이트의 다른 등록 모듈을 선택할 수도 있다. 원본 해시를 런타임에 강제해 수정본을 막지 않는다. 다른 서버에서 사진 처리 코드를 불러오는 것은 허용하지 않는다. 배포된 앱 JS 객체 코드와 제공하는 로더로 라이브러리를 재결합할 수 있다.

upstream은 정확한 Emscripten 컴파일러 버전을 공개하지 않았으므로 C/C++부터 바이트가 동일한 생성물을 재현했다고 표현하지 않는다. 선호 수정 형태의 소스와 upstream 빌드 명령·알려진 옵션을 제공하며, 실제 브라우저에서 호환 라이브러리 교체와 기존 HEIC 디코딩을 별도로 검증한다. 라이브러리를 변경해 배포할 경우 그 변경 소스·고지도 갱신해야 한다.

### 제공 위치

- 앱: **내 공간 → 오픈소스 및 콘텐츠 라이선스**. 이름·버전·라이선스로 검색하고 원문을 오프라인 열람한다. Eigen·Public Suffix List의 ‘소스 받기’는 APK/AAB 안의 ZIP을 기기 공유/저장 화면에 전달한다.
- 웹: 같은 화면과 `/licenses/index.html`, `/licenses/THIRD_PARTY_NOTICES.txt`, `/licenses/inventory.json`, `/licenses/sources/`.
- `.mjs`는 `application/javascript`로 제공하고, `/licenses/`와 `/vendor/`를 SPA index fallback으로 덮어쓰지 않는다. ZIP은 실행 파일과 같은 사이트에서 내려받을 수 있어야 한다. 배포 시 이 폴더를 제거하면 소스 제공 검증도 무효다.
- 공개 웹 디렉터리에는 앱 소스맵을 복사하지 않는다. 소스맵은 로컬 감사 폴더에 보존해 실제 JS와 대조한다. LGPL 라이브러리의 원본·재결합 자료는 소스 ZIP으로 별도 제공한다.

## 재현과 갱신

공개 입력의 URL·SHA256은 `frontend/third-party/inputs.json`에 고정한다. `fetch-license-inputs.py`는 고정 해시를 검증하며, 기본 실행은 변경된 입력을 자동 승인하지 않는다. `--record-hashes`는 새 입력을 사람이 검토한 뒤 최초 등록할 때만 사용한다. 캐시와 개인 QA 결과는 ignore 대상이다.

기존 짧은 Android 빌드 사본을 준비한 뒤, 다음 순서로 새 감사 디렉터리에서 실행한다. 아래 `QA`는 출력 폴더를 가리키는 예시이며 기존 폴더를 덮어쓰지 않는다.

```powershell
cd frontend
python -B scripts/fetch-license-inputs.py
# 빌드 사본 android/에서 SDK 환경을 지정하고 릴리스 실제 의존성을 수집
./gradlew.bat :app:dioLicenseInventory -I '<clone>/frontend/scripts/export-license-deps.gradle' '-PdioLicenseOutput=<QA>/native-dependencies.private.json'
# 최초 고지 생성용 Android·웹 probe: expo export --platform ... --source-maps
# 각 실제 소스맵에 대해 prepare-release-licenses.py --platform ... 실행
python -B scripts/publish-release-licenses.py --web '<QA>/web-notices.private.json' --android '<QA>/android-notices.private.json' --native-inventory '<QA>/native-dependencies.private.json' --ndk '<actual Android NDK directory>' --report '<QA>/published-notices.json'
pnpm licenses:check:android
pnpm licenses:check:web
pnpm web:licensed --audit-dir '<new private audit directory>' --output-dir '<new web distribution directory>'
pwsh scripts/build-handwriting-android.ps1 -BuildDirectory '<owned short build folder>' -Architecture 'arm64-v8a,x86_64' -ArtifactPrefix 'dio-license-release-audit' -Release
```

`prepare-release-licenses.py`는 새 비상업 전용·불명확 조건과 대응 소스가 검토되지 않은 새 copyleft 패키지를 거절한다. 라이선스 복수 표기를 무조건 `OR`로 간주하지 않는다. Android `preBuild`도 고지·소스의 누락·해시 불일치·의존성 lock 변경을 검사한다. 최종 `verify-release-licenses.py`에는 실제 웹 디렉터리, 비공개 소스맵, APK/AAB, Android 바이트코드와 새 네이티브 의존성 목록을 함께 전달해 대조한다.

감사용 release APK/AAB는 현재 템플릿의 debug 키로 서명한다. release 코드 경로 점검용이며 스토어 게시용 서명·게시 완료를 뜻하지 않는다. 실제 게시 시에는 정식 서명으로 다시 만들고 그 최종 파일에 같은 검증을 수행한다. 가중치·학습 데이터·상표·HEVC 등 코덱 특허는 이번 코드 고지 검토의 승인 범위가 아니다.

## 이번 로컬 검증 결과

2026-10-28 최종 웹 정적 디렉터리와 release APK/AAB를 대조했다. 고지는 웹 45개, Android 222개 항목이며, Android의 arm64-v8a·x86_64 네이티브 라이브러리 40개를 아티팩트·NDK·로컬 프로젝트에 연결했다. 대응 소스 ZIP과 통합 고지가 최종 파일에 들어 있고 해시가 일치한다. 공개 웹 디렉터리에 소스맵이 없으며 비공개 감사 소스맵의 JS·Android 바이트코드와 최종 파일이 일치한다.

- 최종 파일 검사: `frontend/qa/license-release-20261027/final-artifact-validation.json` — 통과.
- 웹 브라우저: 전문 검색, 소스 ZIP 내려받기와 해시, 공개 예제 HEIC → 1280×854 JPEG 변환, 같은 사이트의 호환 모듈 교체, 외부 사이트 모듈 거절 — 통과. `browser-verified-validation.log`에 기록.
- 자동 검사: 기존 Node 테스트 394개, 라이선스·대응 소스·규칙 복원·원본 모듈 검증 Python 테스트 6개 — 통과.
- Android API 36 x86_64 에뮬레이터: 최종 APK의 소프트웨어 222개·콘텐츠 3개 항목, Eigen 검색과 MPL 전문, 오프라인 ZIP 공유 화면 진입 — 통과. 공유는 외부 전송 없이 취소했다. `native-ui-validation.json`에 최종 APK 해시와 함께 기록했다. 실제 휴대폰 재검증은 수행하지 않았다.
- APK SHA256: `2fd60aa0b935f56f63bf09487a6d55222abcf6e1a7c4f852bea5cb23e2166269`.
- AAB SHA256: `e6c728356b99235903fe552d45bba94854b524f1523ada8b98f5ff5630c54bac`.
- 파일: `frontend/qa/handwriting-output/android/dio-license-release-audit-arm64-v8a-x86_64.apk`·`.aab`, 웹: `frontend/qa/license-release-20261027/web-distribution-verified/`.

이번 범위의 실제 코드에서 비상업 전용 조건은 발견하지 않았다. LGPL·MPL 구성요소에는 위의 조건을 반영했으며, 이를 앱의 모든 상업적 배포 권리에 대한 승인으로 확대하지 않는다. 장시간 휴대폰 측정은 반복하지 않았다.

검증 중 React Native Gradle 작업의 기본 입력이 JSON을 포함하지 않아 화면의 고지 목록이 이전 캐시에 남는 문제가 발견됐다. 고지·콘텐츠 JSON을 번들 작업 입력에 명시하고, 최종 Hermes·웹 JS 안의 고지 목록 지문을 검사하도록 수정했다. 고지 자산만 최신이고 화면 목록은 이전인 배포물도 이제 거절한다. 수정 후 최종 파일과 화면을 다시 검증했다.

## 근거

### 2026-10-29 Expo58·RN0.88 통합 시 갱신

- 최신 develop의 잠금 파일과 실제 네이티브 목록을 다시 수집했다. Maven 아티팩트 171개·로컬 프로젝트 19개이며, 생성한 고지는 Android 238개·웹 47개다. 이전 SDK57의 최종 파일 해시·고지 개수는 과거 검증 기록이며 새 배포물의 결과로 재사용하지 않는다.
- 실제 선택된 Hermes `260318099.0.4`, Fresco `3.7.0`, RN `0.88.0`의 원본 고지를 버전별로 고정했다. Fresco3.7.0 소스의 JPEG·PNG·GIF·WebP 버전도 대조했다. 새 로컬 기본 폰트인 고운돋움·고운바탕의 원본 OFL도 양쪽 배포 고지에 포함했다.
- Expo58의 inline indexed source map을 모든 section에 걸쳐 수집한다. 외부 URL section은 자동으로 신뢰하지 않고 거절한다.
- 공개 고지·필수 소스 ZIP·교체 가능한 HEIC 모듈을 기능과 함께 저장소에 포함해 새 클론에서도 사용할 수 있게 했다. 다운로드 캐시·모델·개인 원본·개인 폰트·QA는 계속 제외한다. 원문 고지와 외부 모듈은 Git 줄바꿈 변환·공백 정리로 내용을 바꾸지 않는다.
- Windows native 빌드는 짧은 독립 경로와 CMake 오브젝트 경로 한도를 사용한다. 앱의 모델·추론 계산·글씨 모양을 바꾸는 설정이 아니다. 최종 Android·웹 파일의 대조 결과는 `frontend/qa/handwriting-output/ttf-production-20261029/`에서 새로 기록한다.
- SDK58의 `libexpo-modules-jsi.so`는 해당 npm 패키지가 추출한 prebuilt 파일, `libexpo-modules-v2.so`는 같은 버전의 로컬 release 빌드 파일과 SHA256·Build ID를 대조한다. 이름만으로 허용하지 않는다. 최종 두 ABI의 native library 44개가 모두 출처에 연결됐고, APK/AAB·웹의 코드·고지·대응 소스 대조가 통과했다.
- 최종 웹에서도 고지 전문, 동일 해시 소스 ZIP 내려받기, 실제 HEIC→JPEG 변환과 호환 라이브러리 교체를 확인했다. 원본 결과는 `license-browser-merged.log`, `final-artifact-validation.json`이며 가중치·코덱 특허·전체 상용 권리는 계속 검토 범위에서 제외한다.

- [LGPL 3.0 원문](https://opensource.org/license/lgpl-3-0), [heic-to 1.6.6 라이선스](https://github.com/hoppergee/heic-to/blob/v1.6.6/LICENSE)
- [MPL 2.0 배포 안내](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [ORT 1.23.2 고정 Eigen 의존성](https://github.com/microsoft/onnxruntime/blob/v1.23.2/cmake/deps.txt)
- [Checker Framework 2.5.5의 주석 MIT 범위](https://github.com/typetools/checker-framework/blob/checker-framework-2.5.5/LICENSE.txt)
- [OFL의 앱 번들·판매 안내](https://openfontlicense.org/ofl-faq/), [CC BY 4.0 조건](https://creativecommons.org/licenses/by/4.0/)
- [libavif JNI 설정](https://github.com/AOMediaCodec/libavif/blob/14d8e3c4/android_jni/avifandroidjni/src/main/jni/CMakeLists.txt), [APNG4Android 3.0.5](https://github.com/penfeizhou/APNG4Android/tree/v3.0.5), [zstd-kmp 0.4.0](https://github.com/square/zstd-kmp/tree/parent-0.4.0)

이번 로컬 검증의 원본 기록은 `frontend/qa/license-release-20261027/`에 보관한다. 최종 아티팩트 해시·검사 결과·브라우저 및 Android 확인 범위는 이 폴더의 결과 JSON과 로그를 기준으로 한다.
