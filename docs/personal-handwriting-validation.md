# 손글씨 폰트 검증 기록

[현재 기능 계약과 실행 방법](./personal-handwriting-font.md)과 구분한 과거 검증 결과입니다. 동일한 테스트 입력을 익명으로 '테스트 필체 A', 등록 이름을 '테스트 폰트 A'로 표기합니다. 개인 입력·폰트 해시와 원본 자료는 비공개 QA에만 보관하며 이 문서에 식별 정보를 기록하지 않습니다.

시간·메모리·온도는 해당 모델 버전과 기기에서 관측한 값입니다. PC·에뮬레이터 검사와 실제 휴대폰 전체 생성, Android·PC 간 비교와 동일 환경의 모델 버전 비교를 구분합니다. 소스가 변경되어도 이전 결과가 새 실행 결과가 되지는 않습니다.

## 최초 모바일 경로(v1)에서 확인한 결과

| 검증 | 결과와 범위 |
| --- | --- |
| 기존·신규 Node 회귀 | 391개 통과 |
| 번들 | Android·iOS·웹 JavaScript export 통과. iOS 생성 지원을 뜻하지 않음 |
| PyTorch ↔ ONNX 특징 | 테스트 필체 A36자, 16px 특징 상대 L2 최대 `3.85e-6`, 32px 특징 `2.62e-6` |
| PyTorch ↔ ONNX 생성 | 한·이·민·글 등을 포함한12자, 8bit 출력 최대 차이1, 평균 차이 최대 `0.0001221` |
| 전체 제작 | 실제 ONNX로11,172자 생성 후 공통 Java 제작기로 TTF 생성. 모든 한글 매핑·비어 있지 않은 윤곽선·maxp·체크섬 검사 |
| 윤곽선 보존 | 61자 표본에서 원시 출력과128px TTF 렌더링 비교. 2px 허용 잉크 F1 최소 약1.0. 필체 정답과의 유사도 점수가 아님 |
| Android API36 x86_64 에뮬레이터 | 실제 테스트 필체 A 입력으로12자 생성, PC 출력 대조, 특징 캐시의 바이트 동일 재생, 소규모 TTF 제작·픽셀 표시, 전체 TTF의11,172자 지원·픽셀 표시 통과 |
| 개발 APK | ARM64·x86_64 개발 APK 빌드 성공. `frontend/qa/handwriting-output/android/dio-font-dev-arm64-x86_64.apk`, 모델 포함 약324MB. Metro에 연결하는 개발 빌드이며 배포용 APK가 아님 |
| Android 앱 화면 | 위 APK를 에뮬레이터에 설치해 내 공간→36자 작성 화면 진입, 실제 모듈 지원 표시, 획 입력·자동 저장·창 재진입 복원·1.6배 모델 입력 표시를 확인 |
| 브라우저 UI | 새 저장소에서 획 작성·Undo·복원, 네이티브 생성 비활성화, 실제 TTF 등록·재실행·다이어리 적용, 손상 파일 거부 후 목록 보존, PNG2560×1600·1쪽 PDF 통과 |

검증한 전체 TTF는22,453,492바이트입니다. 개인 폰트 해시는 비공개 검증 기록에서 관리합니다. 검증 산출물은 클론의 `frontend/qa/handwriting-output/`에만 있습니다.

실제 렌더링 검증에서 `maxp`의 과도한 최대 점 수가 빈 한글을 만드는 문제를 찾아 실제 윤곽선의 최대값으로 수정했습니다. 웹 캡처는 SVG 내부에도 개인 TTF를 포함해 화면의 글꼴을 보존합니다. 파일 로드 성공만으로 표시 성공을 판단하지 않습니다.

실제 Expo Go 휴대폰 조작, 앱 강제 종료·취소의 전체 UI 시나리오, 실제 저장 공간 부족은 아직 확인하지 않았습니다. Android 개발 빌드의 실기기 전체 생성과 백그라운드 정지·재개는 아래 실측에서 확인했습니다. 원본과 이전 완성 폰트를 삭제하지 않는 구조를 유지합니다.

## 갤럭시 실기기 실측(v1) — 2026-10-26

같은 날 편집기의 개인 폰트 목록이 보이지 않는 문제도 실기기에서 수정했습니다. 기존 목록은 높이42의 글꼴 선택 필드 안에 절대 위치로 놓여 Android 터치 범위를 벗어났고, 일곱 번째 항목인 개인 폰트가 화면에서 잘렸습니다. 목록을 패널의 일반 흐름 안에 배치하고 ‘내 폰트’를 기본 글꼴보다 먼저 표시합니다. SM-S921N에서 `테스트 폰트 A` 노출·목록 스크롤·실제 선택과 Regular 정책을 확인했습니다. 새로고침 후에도 생성 폰트가 유지됐으며, 관련 Node 검사10개와 수정본 웹 export가 통과했습니다. 이 확인은 편집기에서 새 글상자용 글꼴을 선택한 범위이며 기존 문서의 글상자를 변경하지 않았습니다. 화면/XML 기록은 `frontend/qa/handwriting-output/device/font-editor-fix-20261026/`에 있습니다.

갤럭시 `SM-S921N`, Android16, SoC `s5e9945`에서 실제 한글 11,172자 생성 → TTF 제작 → 이름 등록 → 한글 표시까지 완료했습니다. 기존 DIO와 다른 `com.f106.DIO.handwritingdev` 개발 앱을 사용했습니다. 기존 모델 가중치·FP32·CPU·배치1·intra-op2 스레드를 유지했습니다.

테스트 필체 A의 기존36자 벡터 초안을 새 개발 앱의 빈 초안에 넣었고, 주입 전 앱 DB를 로컬에 백업했습니다. 모델 입력의 일치 여부는 비공개 검증 기록에서 확인했습니다. 첫 샘플 생성으로 만든 참조 특징 캐시를 전체 제작에서 재사용했습니다. 작성·수동 입력 시간은 전체 제작 시간에 포함하지 않습니다.

| 항목 | 실측 |
| --- | --- |
| 전체 제작의 실행 시간 합계 | **약47분20초** · 2,840초. 캐시 읽기·생성·윤곽선·체크포인트·TTF 제작 포함 |
| 시작부터 완료까지 경과 시간 | 53분36초 · 3,216초 |
| 중간 일시 정지 | 2회, 합계6분16초 · 3,776자와7,904자에서 보존 후 재개 |
| 평균 처리량 | 실행 시간 기준3.93자/초 |
| 초반/후반 처리량 | 처음3분 약5.48자/초 → 마지막3분 약3.65자/초 |
| 최대 관측 TOTAL PSS | **약792.9MiB**. 스왑 PSS 포함, 개발 앱 전체, 5초 간격 샘플 |
| 배터리 온도 | 시작31.1°C → 최대38.8°C → 완료38.7°C |
| 기기 보고 SKIN | 시작33.0°C → 생성 중 샘플 최대39.8°C. 전환 직후 포함 전체 최대40.5°C |
| 기기 보고 AP | 생성 중 샘플 최대54.7°C. 전환 직후 포함 전체 최대59.7°C |
| 시스템 발열 상태 | 작업이 processing인 샘플은 최대1. 정지·앱 전환 직후 포함 전체 최대2 |
| 완성 TTF | 22,453,288바이트, 한글11,172자, 전체 glyph11,174개 |
| 앱 등록/표시 | `테스트 폰트 A`로 저장, 실제 한글 미리보기 표시 확인 |

전체 문자 매핑·비어 있지 않은 윤곽선·실제 maxp 최대값·파일 체크섬을 검사했습니다. 원시 샘플 PNG15자는 PC 출력과 최대1/255 차이였고, TTF의61자 표본은 같은 위치·크기의 PC 출력과 2px 허용 잉크 F1 최소 약1.0이었습니다. 이는 실행 경로와 벡터화 보존 검증이며 필체 정답과의 유사도 점수는 아닙니다.

**해석 범위:** 실제 기기1대의 작업1건이며, 두 번의 정지·재개를 포함합니다. 각 실행 구간의 같은 기기 파일 시각을 합산해 정지 시간을 제외했습니다. 파일 시각은1초 단위여서 합계 시간에도 수초 수준의 오차가 있습니다. 연속 실행 한 번이나 여러 기기의 대표 성능으로 해석하지 않습니다.

USB 충전 중이었고, 기존 밝기·절전·화면 유지 설정을 바꾸지 않았습니다. 배터리 잔량으로 소비 전력을 추정하지 않았습니다. PSS는 주기적으로 관측한 최대값이며 짧은 할당 피크를 놓칠 수 있습니다. 센서와 작업 상태는 한 샘플 안에서도 순차 읽기이므로 전환 시점의 분류에 시차가 있습니다. AP·SKIN은 기기 HAL 보고값이고 실내 온도·케이스·사용자 체감은 별도로 측정하지 않았습니다. Android의 단계 정의는 [공식 thermal mitigation 문서](https://source.android.com/docs/core/power/thermal-mitigation)를 따릅니다.

메모리 해석 보충: 이 기기의 `TOTAL PSS`는 스왑 PSS를 포함합니다. 최대 PSS 관측 시점의 원시 로그는 TOTAL PSS 811,912KiB, TOTAL SWAP PSS 222,067KiB, TOTAL RSS 663,826KiB입니다. 따라서 스왑 제외 PSS는 약576.0MiB, 스왑 PSS는 약216.9MiB이며, 같은 시점 RSS는 약648.3MiB입니다. 이는 각 항목의 독립적인 최대값이 아닙니다. 스왑 PSS는 압축 후 물리 메모리 크기를 뜻하지 않으므로 TOTAL PSS 약793MiB를 물리 RAM 점유량으로 그대로 해석하지 않습니다. [AOSP getTotalPss 구현](https://android.googlesource.com/platform/frameworks/base/+/HEAD/core/java/android/os/Debug.java)은 스왑 PSS를 합산합니다. 개발 앱 전체의 값이며, 모델 추가분과 완성 폰트만 사용하는 상태의 메모리는 별도로 분리 측정하지 않았습니다.

생성은 성공했지만 **현재 FP32 CPU 경로의 전체 제작 시간은 실사용에서 큰 제약**입니다. 단시간 샘플 생성 성공과 전체 제작 속도를 구분해야 합니다. CPU 허용 주파수가 기기 최대보다 낮은 시점도 관측했으며, 발열·전력 정책·다른 요인의 영향을 이번 측정만으로 분리하지 않았습니다.

원시 로그·단계 시각·출력 검증·폰트·등록 화면·그래프는 로컬의 `frontend/qa/handwriting-output/device/<run>/`에 있습니다. 주요 파일은 `summary.json`, `segments.json`, `output-validation.json`, `measurement.png`, `font-registered.png`, `device-generated.ttf`입니다. 개인 자료와 산출물은 Git ignore 대상으로 유지합니다.

측정 재현용 스크립트:

```powershell
# 명시한 기기와 작업만 관측. 같은 출력 폴더를 덮어쓰지 않습니다.
pwsh scripts/measure-handwriting-device.ps1 -Serial '<ADB serial>' -JobId '<job UUID>' -OutputDirectory 'qa/handwriting-output/device/new-run/full-first'

# 이번 실측 자료의 시간·온도·PSS 그래프와 요약 재생성
python scripts/analyze-handwriting-device.py --run 'qa/handwriting-output/device/<run>'
```

## 추론 전용 코드 교체(v2) — 2026-10-26

`frontend/model-tools/dio_dmfont/`에 추론 패키지를 구성했습니다. 명시적으로 MIT 고지가 있는 인코더·디코더·메모리·어텐션·한글 분해 소스 7개만 재사용하며, `PROVENANCE.json`에 원본 커밋·원본/로컬 SHA256·수정 내역을 기록합니다. `models/modules/modules.py`는 포함하거나 import하지 않습니다. `weights_init()`, 판별기·보조 분류기·학습 스크립트도 변환 경로에서 제외했습니다. `split_dim()`은 `torch.unflatten`으로 독립 작성했고, 가중치 정규화는 `w_norm='none'` 경로만 지원합니다. 기존 고지는 `model-tools/license-history/`에 보존하고, 새 번들에는 실제 포함한 MIT 코드의 LICENSE·NOTICE를 넣었습니다.

모델 버전은 `dmfont-fp32-e5b28ca6-inference-v2`입니다. 체크포인트 SHA256 `e5b28ca6793429b5e8bc77ed07ef166c7dfce91e089f068cc86318897700cae0`의 학습된 값은 변경하지 않았습니다. 새 작업은 이전 특징 캐시와 분리되며, 이전 버전의 미완료 작업은 상태를 변경하기 전에 재개를 거절합니다. 저장된 36자 입력으로 새 작업을 만들 수 있습니다. 기존 완성 폰트·폰트 ID·문서의 저장 형식은 변경하지 않았습니다.

| 검증 | v2 결과와 범위 |
| --- | --- |
| 의존성 | 원본 `models`·`datasets`·`trainer` import를 차단한 새 패키지 검사 통과. 원본은 별도 비교 프로세스에서만 실행 |
| 가중치 | `strict=True` 로드, 누락·추가 키 없음. 파라미터·버퍼 266개 모두 체크포인트와 정확히 일치 |
| 기존/새 PyTorch | 고정 테스트 필체 A 36자 특징·우회 특징, 12자 생성 출력이 모두 정확히 일치 |
| 기존/새 ONNX | 36자 특징 상대 L2 최대 0. 한글 11,172자 각각의 8bit 출력 최대·평균 차이 모두 0 |
| 전체 폰트 | 11,172자 매핑·윤곽선·테이블·체크섬과 61자 렌더링 검사 통과. 새 TTF가 기존 PC TTF와 바이트 단위로 동일 |
| Android API36 x86_64 | 같은 ORT 1.23.2·스레드 설정에서 기존/새 ONNX 12자 출력 바이트 동일. 캐시 재생·소규모 TTF 제작·실제 한글 표시·전체 TTF 문자 지원, 이전 버전 입력 거절: instrumentation 2개 통과 |
| 갤럭시 SM-S921N / Android16 | 같은 ID·서명으로 v2 앱 업데이트 성공. 12자 생성·캐시 재생·소규모 TTF 제작·실제 한글 잉크 표시, 이전 버전 입력 거절: instrumentation 2개 통과. 실제 앱에서도 샘플 15자 생성·별도 캐시·편집기 기존 폰트 노출 및 로드 확인 |
| JS/Python | Node 회귀 392개와 번들 연동 2개, Python 추론 계약 5개 통과 |
| 번들/개발 APK | Android·iOS·웹 export 통과. ARM64·x86_64 개발 APK 빌드, 모델 해시·앱 ID·서명·개인 시험 자료 미포함 확인 |
| Expo Go 57.0.9 / API36 에뮬레이터 | 내 공간→36자 화면, 획 작성·자동 저장·1.6배 실제 입력 표시, 생성 비활성화 안내 확인. v2 검증 TTF를 파일 선택기로 가져와 실제 한글 표시, 앱 종료·재실행 후 초안과 폰트 복원 확인 |

ONNX SHA256:

- 인코더: `36f39745654a47a352752251429c36fc8f607256a3446d18791bb32b9bfdbab0`
- 디코더: `73ceea513ee8eba489f44a1f9658f2cd22d77fb6881cbd70a79fd307c80f1368`

TTF는 22,453,492바이트입니다. 개인 폰트 해시는 비공개 검증 기록에서 관리합니다. 보고서는 `frontend/qa/handwriting-output/inference-v2/full/equivalence.json`과 `validation.json`, Android 기록은 `emulator-paired-instrumentation.log`에 있습니다. 이 자료는 개인 입력과 함께 ignore 대상입니다.

Android와 PC의 서로 다른 ORT 버전 간 비교는 모델 교체의 동일 환경 비교와 구분합니다. Android 12자와 PC 출력의 최대 차이는 1/255, 글자별 평균 차이 최대는 0.00390625였습니다. 최초 경로부터 쓰던 플랫폼 간 허용 기준(최대 2, 평균 0.05 미만)을 유지했고, **모델 교체의 기준을 완화하지 않았습니다.** 같은 Android 환경의 v1/v2 차이는 0이며, PC의 전체 11,172자 v1/v2 차이도 0입니다.

새 개발 APK는 `frontend/qa/handwriting-output/android/dio-font-inference-v2-arm64-v8a-x86_64.apk`(323,700,359바이트)입니다. 앱 ID `com.f106.DIO.handwritingdev`와 서명 SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`가 이전 개발 APK와 같아 데이터 삭제 없이 업데이트할 수 있습니다. 서명·패키지 일치는 실제 기기의 업데이트·데이터 보존 확인과 별개입니다.

Expo Go 확인 중 Android 파일 선택기의 전역 임시 파일을 legacy FileSystem이 읽지 못하는 문제를 수정했습니다. Android에서는 사용자가 선택한 문서의 허용된 `content://` URI를 새 File API로 바로 읽습니다. 가져온 폰트는 기존 앱 전용 저장 경로에 보관합니다. 기존 미디어 라이브러리의 Expo Go 권한 경고는 별개이며 사진첩 전체 접근을 검증한 것은 아닙니다. 화면 기록은 `inference-v2/go-support.png`, `go-font-imported.png`, `go-restored-font.png`입니다.

Android v2 업데이트 전후 DB·등록 폰트·완성 작업 폰트의 무결성, 36자 초안 개수와 기존 폰트 ID를 확인했습니다. 앱 제거·데이터 삭제 없이 기존 글상자와 폰트를 보존했으며, 편집기 목록과 Expo Font의 준비 상태를 확인했습니다. 개인 파일 해시는 공개 문서에 기록하지 않습니다.

실제 앱의 v2 모델 해시가 번들과 일치하며, 샘플 문구의 고유 15자가 새 입력 해시 폴더에 생성됐습니다. 기존 v1 미리보기 15자는 별도 폴더에 유지됐습니다. 검사 전용 APK에서 새 모델 12자·소규모 TTF·실제 잉크 표시·캐시 재생을 확인한 후 검사 앱만 제거해 공간을 돌려줬습니다. 갤럭시에서 v1 모델을 다시 실행해 비교하지는 않았습니다. 동일 Android 환경의 v1/v2 직접 비교는 앞의 에뮬레이터 결과입니다.

v2 실기기 업데이트 검사는 필요한 메뉴·폰트 항목 존재 여부, 로드 상태·초안 개수·모델 버전으로 확인했습니다. 휴대폰의 원본 획·DB·폰트·다이어리 텍스트를 공개 산출물에 포함하지 않았습니다.

**검토 범위:** 제한 모듈 의존성 제거와 추론 동등성 검증입니다. 가중치·학습 데이터의 사용 및 배포 권리는 이번 검토에서 제외했으며, 전체 상용 배포 권리 검증 완료를 뜻하지 않습니다. v2로 휴대폰 전체 생성이나 장시간 발열 측정을 반복하지 않았습니다. 위 v1 실측 시간을 v2 실측으로 재사용하지 않습니다.

## 2026-10-29 완성 폰트 용량 실험

테스트 필체 A의 갤럭시 실측 완성 폰트 `device-generated.ttf` 한 개를 대상으로 한 결과다. 한글 11,172자·11,174개 glyph를 유지했고 원본 파일은 수정하지 않았다. 생성 모델·가중치·배율·윤곽선을 변경하거나 자주 쓰는 글자만 추리는 작업은 하지 않았다. 이 절은 앱 적용 전 실험 기록이며, 실제 앱 적용 결과는 다음 절에 기록한다.

| 방법 | 파일 바이트 | 용량(MB, 10진) | 원본 대비 감소 | 사용 조건 |
| --- | ---: | ---: | ---: | --- |
| 기존 TTF | 22,453,288 | 22.45 | — | 현재 출력 |
| TTF 좌표 저장 최적화 | 9,292,884 | 9.29 | 58.6% | 현재 TTF 형식 유지. 앱 파일 검증과 Android Typeface 로드 통과 |
| 최적화 TTF의 gzip 보관 | 2,077,251 | 2.08 | 90.7% | 사용 전 TTF 압축 해제 필요. 풀어 놓는 9.29MB 캐시 공간은 별도이며 캐시 정책은 이번에 구현하지 않음 |
| WOFF2 | 1,505,376 | 1.51 | 93.3% | 웹 브라우저에서 로드 확인. 현재 앱의 TTF 전용 등록 경로에는 추가 구현 필요. Android 직접 사용으로 검증하지 않음 |

**형상을 보존하는 방식:** 기존 제작기는 모든 점의 X·Y 차이를 각각 signed 16-bit로 저장한다. 표준 TrueType의 짧은 좌표 차이·0 차이·반복 flag 표현으로 다시 저장하고, 반복되는 advance width는 hmtx의 공통 폭 표현으로 묶었다. 실제 점 좌표·on-curve 상태·윤곽선 순서·글자별 폭과 bearing·unitsPerEm은 그대로다. 직선·곡선 단순화, 작은 획 제거, 힌팅 삭제, 좌표 반올림은 하지 않았다. 기존 폰트에는 힌팅 명령이 없다.

**검증:** PC FreeType/Pillow에서 최적화 TTF와 WOFF2를 복원한 TTF 각각에 대해 모든 한글을 24·48·128·256px로 비교했다. 각 크기 11,172자에서 픽셀 차이가 있는 글자는 0개다. 전체 좌표와 배치 정보의 일치도 검사했다. gzip 압축 해제 후에는 최적화 TTF의 파일 바이트가 정확히 일치한다.

Android API36 x86_64 에뮬레이터의 별도 검증 앱 `com.f106.fontcompressionaudit`에서 원본·최적화 TTF를 Typeface/Canvas로 비교했다. 같은 네 크기·11,172자 전체에서 픽셀 차이·advance 차이·빈 원본 글자 수가 모두 0이다. 이는 Android 런타임의 실제 글꼴 로드·렌더링 비교이며 사용자 휴대폰 재측정이나 DIO 편집기 전체 회귀 검사를 뜻하지 않는다. 독립 검증 앱의 일반 Activity 초기화 경로를 사용했으며 초기 셸 도구의 시스템 글꼴 초기화 실패와 구분했다.

Edge 브라우저에서는 최적화 TTF·WOFF2를 FontFace로 실제 로드하고, 흔한 문구와 한글 범위에 고르게 분포한 총 289자를 네 크기로 비교해 픽셀·폭 차이가 모두 0임을 확인했다. 현재 앱의 `inspectTrueType()`도 원본과 9.29MB 파일에서 동일한 전체 문자 수·glyph 수·unitsPerEm을 반환한다. OTF/CFF 예비 변환은 이름 메타데이터의 Latin-1 인코딩에서 중단되어 용량·품질 결론에서 제외했다.

우선 적용 후보는 **9.29MB TTF**다. 현재 파일 형식과 글꼴 ID·등록 인터페이스를 유지할 수 있고, 새 런타임 압축 라이브러리를 추가할 필요가 없다. gzip 보관·캐시 해제와 웹 WOFF2 분기는 별도의 구현 범위다. 이번 수치는 테스트 필체 A 폰트 한 개의 실측이며 다른 필체의 감소율이나 이론적 최솟값을 보장하지 않는다.

산출물은 `frontend/qa/handwriting-output/compression-20261029-verified/`의 축소 폰트·압축본·`results.json`·`browser-validation.json`·`app-format-validation.json`·`comparison.png`에 보관한다. Android 원본 기록은 `compression-android-20261029/native-validation.json`이다. 실험 도구는 `scripts/measure-font-compression.py`, `scripts/FontCompressionAudit.java`, `scripts/FontCompressionAuditActivity.java`, `tests/font-compression-browser.cjs`이며 제품 코드나 설치된 DIO 앱의 데이터를 바꾸지 않는다. 개인 폰트와 결과는 기존 QA ignore 범위를 유지한다.

형식 지원 근거: [Expo의 TTF·OTF 및 플랫폼별 지원 안내](https://docs.expo.dev/develop/user-interface/fonts/), [fontTools glyf 좌표·윤곽선 API](https://fonttools.readthedocs.io/en/latest/ttLib/tables/_g_l_y_f.html). 이번 실험은 기존 개발 환경의 fontTools/Pillow를 PC 검증에만 사용하며 앱에 포함하지 않는다.

## 2026-10-29 앱 생성 단계·SDK58 검증

제품의 `OutlineFont.java`에 무손실 simple-glyph 재인코딩을 독립 구현했다. 짧은/0인 좌표 차이, 반복 flag를 표준 TTF 방식으로 기록한다. long loca를 유지하면서 글자마다 붙이던 불필요한 패딩을 없앴고, 같은 advance width를 hmtx의 공통 폭 표현으로 저장한다. point·contour·on-curve 상태·명령·bounds·문자 매핑·bearing·실제 글자 폭을 바꾸지 않는다. fontTools/Python은 PC 검증 도구이며 Android 런타임 의존성으로 추가하지 않았다.

새 글자의 체크포인트를 압축해 저장하고, 최종 제작 단계에서도 이전 형식과 새 형식 모두를 다시 인코딩한다. 업데이트 전 중단한 작업과 이후 생성한 글자가 섞여도 전체 TTF에 같은 최적화가 적용된다. 모델·입력 해시·참조 특징 캐시는 그대로이며, 기존 완성 폰트는 다시 쓰지 않는다. 기존 이름·폰트 ID·다이어리의 글꼴 참조를 마이그레이션하지 않는다.

실제 제품 제작기로 원본 전체 폰트를 재구성한 결과는 **9,270,544바이트(9.27MB), 58.7% 감소**다. 앞의 9.29MB 실험보다 hmtx의 공통 폭 저장으로 약 22KB 더 줄었다. 4,424,040개 점과 48,819개 contour, 배치 정보가 원본과 일치한다. PC와 Android API36 x86_64의 Typeface/Canvas에서 각각 11,172자를 24·48·128·256px로 비교해 픽셀·폭 차이가 0임을 확인했다. 구형 체크포인트 전체로 만든 결과와 구형/신형을 절반씩 섞은 이어하기 결과는 파일 바이트까지 같다. 완성 파일의 재작성 요청은 거절되고 원본 해시가 유지된다.

웹 실제 흐름에서 게스트 진입, 36자 작성·Undo·재실행 복원, 네이티브 모듈 없는 생성 비활성화, 제품 제작기의 최적화 TTF 가져오기·복원, 손상 폰트 거절과 기존 목록 보존, 다이어리 적용·재실행, PNG2560×1600·1쪽 PDF 출력을 확인했다. 해당 SDK58 검증 시점의 관련 프론트 자동 검사 69개와 Java 좌표 인코딩 경계·손상 입력 검사 2개를 통과했다. 전체 프론트 검사에서 별도 서버 계약 산출물이 필요한 검사와 기존 Canvas 테스트 mock의 useLayoutEffect 누락은 이 기능의 통과 결과에 합산하지 않는다.

원본 기록은 `frontend/qa/handwriting-output/ttf-production-20261029/`에 보관한다. `full/validation.json`, `native-font-validation.json`, `browser/validation.json`, `handwriting-integration-tests.log`가 핵심 근거다. 이 검사로 휴대폰의 전체 생성 시간·발열을 다시 측정했다고 표현하지 않는다.

2026-10-29 SDK58 Android release 검증 빌드에서 실제 ONNX 추론·특징 캐시 재생·새 TTF 제작·기존 전체 TTF의 한글 지원과 픽셀 표시 instrumentation 2개가 통과했습니다. API36 에뮬레이터의 앱 ID·서명을 유지해 데이터 삭제 없이 업데이트하고 React Native 실행을 확인했습니다. 이 결과는 같은 날의 후속 JS/UI 통합 후 Android 전체 재빌드나 새 휴대폰 전체 편집기 검사 결과가 아닙니다.

SDK58 검증 기록은 `merged-frontend-tests.log`, `browser-merged/validation.json`, `license-browser/browser-validation.json`, `sdk58-instrumentation.log`, `final-artifact-validation.json`이다. Android와 웹의 최신 고지 목록 지문이 실제 실행 번들 안에 있고 대응 소스·고지 파일이 포함되는지 확인했다. APK/AAB는 로컬 검증용 debug 서명이며 스토어 배포를 수행한 것이 아니다.

### 후속 JS/UI 통합 검사 — 2026-10-29

최신 읽기 모드·회원 프로필·공유 관리와 개인 폰트를 함께 확인한 관련 자동 검사 55개가 통과했습니다. 웹 재빌드와 실제 TTF 가져오기·작성 복원·다이어리 적용·PNG/PDF 출력, 웹 고지 47개와 JS 패키지 41개의 출처 검사가 통과했습니다. 기록은 `ttf-production-20261029/`의 `mr-retry-tests.log`, `web-mr-retry.log`, `browser-mr-retry/validation.json`, `web-mr-retry-license-validation.json`입니다. 이 JS/UI 통합 뒤 Android 전체 빌드·휴대폰 측정은 반복하지 않았습니다.
