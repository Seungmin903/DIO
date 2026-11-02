# C 감성 원리와 트렌드 — 조사 원자료

> 조사일: 2026-10-30 · 영역: 00 조사 계획의 **C 감성 원리 · 트렌드**(G 구현 제약 일부 포함) · 상태: 원자료(검토 전)<br>
> 범위: 감성 이론 · 2025~2026 트렌드 · 색 · 서체(라이선스) · 모션/햅틱/사운드 · 마이크로카피 · 빈 상태/삭제 · 폼의 한계. **무엇을 어떻게 바꾸면 감성이 생기는가의 근거와 수단**만 다룬다.<br>
> 표기: `[n]` = 5장 출처표 번호 · **(내 계산)** = 이 조사에서 직접 계산한 값 · **추정** = 근거 없는 판단 · **미확인** = 확인하지 못함.<br>
> 이 문서는 색 · 세기 · 모양의 **예쁨을 판단하지 않는다**(코덱스 몫). 아래의 색 hex는 대비 검증용 예시이지 추천이 아니다.<br>
> 먼저 읽은 우리 쪽 자료: `docs/디자인 가이드.md`(기준일 2026-10-22), `frontend/package.json`, `frontend/src/shared/theme.js`, `docs/다이어리 홈 햇살 책상/색인.md`, `frontend/src/editor/services/textFonts.js`, `frontend/assets/fonts/README.md`, `frontend/app.json` [66].

## 0. 한 장 요약

**결론 한 줄**: 감성은 한 겹이 아니라 첫인상(본능) · 조작감(행동) · 기억(반성) 세 겹으로 쌓이고, 우리 앱에서 효과가 가장 큰 자리는 **첫 화면 · 완료/삭제/복원의 순간 · 서체 한 곳**이다. 유행 효과(유리 · 뉴모피즘)는 근거가 오히려 부정적이고, **질감 · 스티커 · 캐릭터 · 틴트 그림자 · 짧은 스프링 모션**이 우리 제약 안에서 오래 간다. 계획의 반증 대상 가설 "Liquid Glass 같은 유행 효과가 감성의 핵심이다"는 **반증됐다**([9][11], 1-2).

핵심 발견 10개

1. **세 겹 모델**: 본능(첫인상) · 행동(사용 경험) · 반성(사용 뒤 떠올리는 이미지)은 Norman의 틀이다 [1][2]. 우리 화면에서 행동은 이미 공들였고 본능(홈)과 반성(끝맺는 순간)이 비어 있다는 것은 **추정**이다.
2. **예쁨은 작은 결함만 용서한다**: 매력적인 UI는 더 쓰기 쉽다고 지각되지만 "작은 문제는 용서하되 큰 문제는 용서하지 않는다"(NN/g, 2024) [3]. 폼 · 삭제 흐름은 감성을 입혀도 명확성이 먼저다.
3. **기억은 정점과 끝이 만든다**: 경험은 가장 강한 순간과 끝 순간으로 평가된다(Kahneman 외 1993을 인용한 Laws of UX) [6]. 우리의 '끝'은 저장 · 내보내기 완료, 삭제 · 복원, 로그아웃이고 '정점'은 다이어리를 여는 순간과 스티커를 붙이는 순간이다(**추정**).
4. **귀여움 근거는 있으나 좁다**: baby schema(큰 머리 · 둥근 얼굴 · 큰 눈)는 귀엽다는 지각과 돌봄 동기를 높인다(n=122) [8]. 귀여운 이미지를 본 뒤 손재주 과제가 좋아졌다(실험1 43.9% vs 11.9% 향상, n=48) [7]. 실험실 · 소표본 · 사진 자극이라 **캐릭터를 쓰는 근거**일 뿐 UI 전반의 귀여움 처방은 아니다.
5. **트렌드 선별**: Liquid Glass는 NN/g가 대비 · 가독성 문제로 비판했고 Apple도 커스텀에는 "sparingly"라 한다 [9][11]. Material 3 Expressive는 연구 근거(18~24세 선호 최대 87%)가 있지만 "명확성을 이기는 표현은 없다"고 스스로 경고한다 [12]. 뉴모피즘처럼 클릭 신호가 약한 화면은 과업 시간이 22% 늘었다는 NN/g 결과가 있다 [14](뉴모피즘 자체를 잰 연구는 아님, 적용은 **추정**). **유효 = 질감 · 스티커 · 콜라주 · 절제된 모션, 과함 = 유리 · 뉴모피즘 · 대규모 표현형 모션.**
6. **우리 팔레트는 색상 232° 단색조**이고(내 계산) 글자 대비는 넉넉하나 **네 곳이 WCAG에 못 미친다**(내 계산): `primaryStrong` 글자/`surfaceSoft` 4.47, `danger` 글자/흰색 3.85, `border` 1.39(입력칸 경계가 유일한 단서일 때 3:1 필요), 앱 배경 위 `primary` 선 2.98 [15][16]. 감성 작업과 별개로 보정 대상.
7. **면 색은 파스텔로 넓혀도 네이비 글자가 버틴다**: 후보 면 7종 위 `text` 대비 11.97~14.91, `textMuted` 5.17~5.71(내 계산, 모두 4.5 이상). 그림자는 이미 네이비 틴트라 회색 그림자 문제가 없다 [22][66]. 색이 많으면 컨트롤 글자가 읽기 어려워진다는 Apple 경고는 지킨다 [23].
8. **제목 서체 한 곳은 비용이 거의 없다**: 고운돋움(7.2MB) · 고운바탕(8.4/8.2MB)은 **이미 앱에 번들되고 시작 때 미리 불러온다** [30][31][66]. OFL 1.1을 원문으로 확인한 서체는 Pretendard · 고운돋움 · 고운바탕 · 동글 · 하이멜로디 · 나눔손글씨 펜(6종)이며 마루부리 · 온글잎은 **미확인** [27~34]. 득실은 3장.
9. **모션은 100~500ms, 대부분 100~400ms, ease-out 기본**(NN/g) [42]. 우리 가이드 §10의 240~260ms와 일치한다. 햅틱 · 사운드는 "보완용 · 끌 수 있게"가 Apple 기준 [38][39]. 쓸 수 있는 도구는 대부분 Expo Go 포함이나 **package.json에는 Reanimated · Lottie · Skia · haptics · gradient · blur가 하나도 없다**(미설치, 추가 필요) [47~54][66].
10. **감성 톤 ≠ 친절한 안내 멘트**: 토스 · Apple · Mailchimp 모두 명확성이 먼저, 톤은 상황에 맞춰 바꾼다 [41][56][58]. 우리 규칙(사용법 · 결과 예고 금지)과 양립하는 정서 문구는 **인사 · 계절감 · 빈 상태 한 줄**이고, 정서의 대부분은 문구가 아니라 그림과 모션이 맡는 편이 안전하다. 가입 폼에 일러스트를 얹으면 전환이 떨어졌다는 보고가 있으나 2차 출처 · 수치 없음이라 **약한 증거**다 [62].

## 1. 질문별 발견

### 1-1. 감성 디자인 이론 (질문 1)

| 이론 | 실제 출처에서 확인한 것 | 우리 화면에서 쓰는 자리 | 주의 |
|---|---|---|---|
| Norman 3수준 | 본능 = "초기 인상, 외관", 행동 = "룩앤필, 사용 전체 경험", 반성 = "사용 뒤의 생각 · 그것이 풍기는 이미지" [2]. NN/g 영상도 같은 세 수준을 소개 [1](설명 본문은 읽지 못함) | 본능: 홈 책상 · 로그인 첫 화면 / 행동: 꾸미기 공방 · 스티커 붙이는 손맛 / 반성: 내 공간 · 휴지통 · 완료 뒤 남는 기억 | Norman 글 자체가 "아름답지만 못 쓰는" 물건(Jensen 시계)을 경고 [2] |
| 심미-사용성 효과 | Kurosu & Kashimura(1995) 252명이 ATM 26안을 평가: 미관 평점은 **실제**보다 **지각된** 사용 쉬움과 더 강하게 상관 [3] | 감성화한 뒤에도 과업 테스트를 반드시 한다 | 사용성 테스트에서 시각 칭찬이 문제를 가릴 수 있고, 큰 문제는 용서받지 못함 [3] |
| Kano | delighter = 기대하지 않았지만 만나면 크게 반응하는 것. "오늘의 기쁨은 내일의 기대" [4]. Kano 외 1984 논문의 분류(Must-be · Attractive · One-dimensional · Indifferent)는 2차 요약으로만 확인 [5] | 감성 요소는 **닳는다**: 같은 인사 · 같은 모션을 매번 반복하지 말고 몇 군데에 두고 가끔 바꾼다 | 1984 원문은 읽지 못함. [4]는 설문 도구 판매사 글 |
| 정점-끝 규칙 | 경험은 가장 강한 순간과 끝으로 평가. 1993년 실험에서 60초 14℃에 30초(15℃)를 더한 쪽을 다시 하겠다고 선택 [6]. 같은 글이 Mailchimp가 불안한 확인 순간에 일러스트 · 미세 애니메이션 · 유머를 넣은 사례를 든다 [6] | 끝맺는 순간(저장 · 내보내기 완료, 복원, 삭제)과 첫 정점(다이어리 열기)에 감성을 몰아준다 | 부정적 정점도 기억된다 [6] → 실패 · 삭제 순간이 오히려 위험 |
| 귀여움 / 카와이 | Glocker 외(2009): 큰 머리 · 둥근 얼굴 · 높은 이마 사진이 더 귀엽다고 평가되고 돌봄 동기가 더 컸다(n=122) [8]. Nittono 외(2012): 아기 동물 사진 뒤 정밀 손동작 +43.9%(성체 +11.9%), 시각 탐색 +15.7%(성체 +1.4%, 음식 +1.2%), 표본 48 · 48 · 36 [7] | 모아 · 디오를 빈 상태 · 완료 · 휴지통에 쓰는 근거. 둥근 모서리 · 큰 눈 비율 같은 형태 코드 | 대학생 표본 · 사진 자극 · 실험실. UI 요소가 같은 효과를 낸다는 증거는 못 찾음 |
| 따뜻한 미니멀 | 학술 근거는 **찾지 못함**. Pantone 2026 올해의 색 Cloud Dancer 설명이 "균형 있고 친절하고 깊이 인간적인 세계" · "과로하고 과자극된 24/7 문화에 대한 반응" [21]. Creative Market(판매처 글)은 2026년을 AI의 매끈함에 대한 촉각 · 불완전성 반작용으로 규정 [24] | 면은 차분하게, 따뜻한 손길은 한두 군데(소품 · 빛 · 질감)에만 두는 구성이 시류와 맞는다(**추정**) | 색상 기관 · 판매처 글은 연구가 아니라 시류 진술 |

현재 작업과의 접점(저장소 확인): 홈 '햇살 책상'은 버튼 · 레일 · 칩은 지금 토큰 그대로 두고 **바닥 · 빛 · 소품 · 캐릭터**만 바꾸며, 색은 캐릭터 최종 시안의 모아 버터 `#FEF0BF` · 디오 목도리 `#DBDCF9`에서 가져와 새 토큰이 없다 [66]. 이는 위 표의 '본능 층'과 '정점' 전략에 해당하고, 아래 결론과 충돌하지 않는다.

### 1-2. 2025~2026 트렌드 (질문 2)

| 트렌드 | 권위 자료에서 확인한 것 | 차분한 유틸리티 앱에서의 판정 |
|---|---|---|
| Apple Liquid Glass (iOS 26) | Apple: 컨트롤 · 내비게이션의 **기능 층**을 이루는 재질. "커스텀 컨트롤에 쓴다면 sparingly", "가장 중요한 기능 요소로 한정" [9]. 컨트롤의 색은 "judicious"하게 [10]. 투명도 · 모션 줄이기 설정에서 효과가 바뀌므로 테스트하라 [9]. NN/g(2025-10-10): 반투명 컨트롤이 사진 위에서 대비를 잃고 "Motion for motion's sake is not usability" [11] | **과함.** 우리 패널의 `rgba(255,255,255,0.97)` + 웹 blur 18px 수준이 상한. 유리를 흉내 내면 가독성과 안드로이드 성능을 같이 잃는다. 표준 네이티브 컴포넌트가 자동으로 유리를 입는다는 점 [9]이 RN 앱의 네이티브 알림 · 탭 등에 영향을 줄지는 **미확인** |
| Material 3 Expressive | Google: 46개 연구 · 18,000명 이상, 18~24세에서 선호 최대 87%, 핵심 요소를 최대 4배 빨리 찾음(Send 버튼 사례) [12]. 같은 글: "No amount of expressive design will beat basic functionality", 친숙한 목록 패턴을 버린 안은 사용성 점수가 낮았고, **강한 소수(strong minority)는 더 차분한 디자인을 선호** [12]. 형태 변형 · 스프링을 핵심으로 소개 [13] | **부분 유효.** 가져올 것은 모양(큰 곡률) · 스프링 모션 · 색 폭의 절제판. 자료가 구글 자체 연구라는 점과, 타깃이 18~24세라는 점은 우리 타깃(10~20대)과 겹치는 부분만 참고 |
| 촉각 / 뉴모피즘 | NN/g 71명 아이트래킹(웹페이지 9종 × 2안): 클릭 신호가 약한 안은 과업 **22% 더 오래**, 응시 25% 더 많음 [14] — 뉴모피즘이 아니라 약한 신호 일반을 잰 결과. WCAG 비텍스트 대비 3:1 [16]. 뉴모피즘의 대비 부족 비판은 2차 요약으로만 확인 [65] | **과함**(전면 적용, 위 두 근거를 뉴모피즘에 적용한 **추정**). 부분 차용은 이미 있다: `shadow.card/float`로 깊이를 주고 선택은 색+테두리 [66] |
| 스티커 · 콜라주 · 종이결 | Creative Market(판매처 글, 갱신 2026-01-20): 질감 · 콜라주 · 손글씨형 서체 수요 [24]. 파이낸셜뉴스(2025-05-21): 무신사 다꾸 검색 +143.8%, 29CM 다이어리 · 플래너 판매 +151%(전년 동기 대비) [26]. Apple Design Awards 2025 Delight and Fun 수상작 CapWords는 **사진 속 사물을 스티커로** 바꾸는 앱 [25] | **가장 유효.** 제품 정체성(사진 위에 스티커)과 일치. 단, 크롬(버튼 · 레일)에 질감을 얹으면 약한 신호 문제 [14] → 질감은 **바탕**, 버튼은 또렷하게 |
| 그레인 · 종이 질감 | 질감 수요는 [24]. 그레인 자체의 효과 · 접근성 연구는 **찾지 못함** | 큰 면에 낮은 불투명도로, 글자 · 입력 영역 뒤는 제외(**추정**) |
| 모션 · 마이크로인터랙션 | 정의: 트리거-피드백 쌍. 효과는 상태 전달 · 오류 방지(되돌리기) · 브랜드 표현. "fluffy하지 말고 목적이 있어야" [43] | 유효하되 목적이 있을 때만. 5장 모션 항목 참고 |

### 1-3. 색 (질문 3)

**현재 팔레트**(theme.js/가이드 §2) [66]: `primary #818AC3` · `primaryStrong #606BB2` · `secondary #ABB1D8` · `surfaceSoft #F3F3F7` · `text #0B1766`. 색상환 위치는 모두 H≈232°(S 35~37%)이고 `text`도 232°(내 계산). 즉 **단색조(monochromatic) 팔레트**라 따뜻한 색은 표지 · 테이프 · 소품 같은 콘텐츠 색에만 있다.

**대비 표**(WCAG 2.2: 일반 글자 4.5:1, 큰 글자 3:1 = 18pt 또는 14pt 굵게 이상, 반올림 금지 [15]; 비텍스트 3:1 [16]) — 모두 **(내 계산)**, 알파는 흰색 또는 `surfaceSoft` 위에 합성해 계산

| 조합 | 대비 | 판정 |
|---|---|---|
| `text` / `surface` · `surfaceSoft` · `surfaceMuted` | 15.81 · 14.28 · 14.04 | 통과 |
| 흰 글자 / `primaryStrong` | 4.95 | 통과 |
| `primaryStrong` 글자 / 흰색 · `surfaceSoft` | 4.95 · **4.47** | 앱 배경 위는 일반 글자 4.5에 **미달** |
| 흰 글자 / `primary` | 3.30 | 큰 글자만 통과(가이드는 이미 글자색으로 쓰지 않음) |
| `text` / `primary` · `secondary` | 4.78 · 7.54 | 통과 |
| `textMuted`(0.68) / 흰색 · `surfaceSoft` | 5.86 · 5.61 | 통과 |
| `danger` 글자 / 흰색 | **3.85** | 일반 글자 **미달**(13px/700은 큰 글자 아님). "n일 후 영구 삭제" 같은 작은 danger 글자 해당 |
| `border`(0.16) / 흰색 · `surfaceSoft` | **1.39 · 1.38** | 입력칸 경계가 유일한 단서이면 비텍스트 3:1 **미달** [16] |
| `primary` 선 / 흰색 · `surfaceSoft` | 3.30 · **2.98** | 앱 배경 위 선택 테두리는 3:1에 **미달**(색 + 테두리 두께로 보완 중) |

**감정 연상 연구**
- Valdez & Mehrabian(1994): 밝기와 채도가 감정에 가장 강하고 일관된 효과. 표준화 회귀식 Pleasure = .69B + .22S, Arousal = −.31B + .60S, Dominance = −.76B + .32S. 파랑 · 청록 · 초록 · 적자 · 보라 · 보라빛 파랑이 가장 유쾌, 노랑 · 황록이 가장 덜 유쾌 [18]. 읽는 법: **밝을수록 유쾌, 채도가 높을수록 각성, 밝을수록 덜 위압적**.
- Wilms & Oberfeld(2018, N=62): 채도 · 밝기가 높을수록 각성 ↑ **그리고** 유쾌 평가도 높음. 파랑의 유쾌 우위는 고채도에서만 나타남 [19]. 두 연구는 밝기와 각성의 방향이 **서로 다르다**(1994는 음, 2018은 양). "파스텔 = 차분"이라고 단정하지 말 것. 둘 다 색 견본 자극이며 UI 화면 연구가 아니다.
- Pantone Very Peri(2022): "periwinkle blue에 violet-red 기운", "용기 있는 창의성과 상상적 표현을 부른다" [20]. 페리윙클 = 창의 · 상상 연상은 **마케팅 진술**이지 실험 결과가 아니다.
- "네이비 글자 + 파스텔 면" 조합을 직접 검증한 연구는 **찾지 못함**. 안전성은 위 대비 계산으로만 확인했다.

**보조 면 색 후보 — 대비 검증만**(미감 판단과 hex 확정은 코덱스. 아래 hex는 이 조사에서 검증용으로 둔 예시값이며 butter만 프로젝트 기존 값)

| 후보(예시) | `text` 대비 | `textMuted` 대비 | 비고 |
|---|---|---|---|
| 버터 `#FEF0BF` | 13.87 | 5.62 | 햇살 책상의 모아 버터 [66] |
| 블러시 `#F6D9DF` | 11.97 | 5.17 | 예시값 |
| 피치 `#F9DCC8` | 12.12 | 5.24 | 예시값 |
| 민트 `#DDEFE6` | 13.22 | 5.40 | 예시값 |
| 크림 `#FBF6EC` | 14.67 | 5.69 | 예시값 |
| 라벤더 `#E8E2F6` | 12.52 | 5.23 | 예시값 |
| 웜 화이트 `#FAF8F5` | 14.91 | 5.71 | 예시값 |

- 판정: 옅은 파스텔 **면** 위의 `text`/`textMuted`는 모두 4.5 이상(내 계산). 위험은 면이 아니라 **그 위에 얹는 `primary` · `danger` · 흰 글자**다.
- 이미 쓸 수 있는 따뜻한 색: 테이프 pink `#FAD3DC` · butter `#FFF1C2` · mint `#E3F4EC`, 표지 rose `#F0B0AA` · mustard `#EBC56F` 등 콘텐츠 팔레트(UI 색으로 쓰지 않는다는 가이드 §2.4와 충돌하므로 UI에 쓰려면 3장 변경 필요) [66].
- 시류 근거: Pantone 2026 = 흰색 계열 Cloud Dancer(2025-12-04 발표) [21]. Apple HIG는 "색이 많으면 압도적이고 컨트롤 라벨이 읽기 어려워진다", 색만으로 의미를 구분하지 말라고 한다 [23].
- **그림자 색**: Comeau는 검정을 배경 위에 올리면 채도가 빠져 탁해지므로 배경 색상(hue)을 유지하고 명도만 낮추라고 한다 [22]. 우리 `shadow.card/float`는 이미 `#0B1766`(네이비) 그림자라 이 원칙을 따른다 [66]. 참고(내 계산): 회색 14% 그림자는 `#F3F3F7` 위에서 `#D1D1D4`(무채), 네이비 14%는 `#D3D4E3`(푸른 기). 새로운 따뜻한 면(버터 등) 위에서는 그 면의 hue를 딴 그림자가 추가 후보. RN 구현: `shadowColor`는 Android API 28+에서만 색이 먹고 `boxShadow`는 신 아키텍처 전제(app.json에 `newArchEnabled` 항목 없음 — 기본값은 **미확인**) [52][53].

### 1-4. 서체 (질문 4)

**라이선스는 배포처 원문(OFL.txt · LICENSE)을 직접 열어 확인한 것만 '확인'으로 표시했다.**

| 서체 | 원문에서 확인한 라이선스 | 예약 이름(RFN) | 파일 크기(바이트) | 앱 현황 | 메모 |
|---|---|---|---|---|---|
| Pretendard | SIL OFL 1.1. README: "글꼴 단독 판매를 제외한 모든 상업적 행위 및 수정, 재배포가 가능" [27][28] | 'Pretendard' 외 Inter · Source · M PLUS 1 유래분 [28] | v1.3.9(2023-11-05) 전체 zip 47,304,526(전 굵기 · 포맷 묶음) [29]. 단일 굵기 파일 크기 **미확인** | 미사용 | 중립 고딕 = 감성보다 정돈. 동적 서브셋 · 가변 폰트 제공 [27] |
| 고운돋움 Gowun Dodum | SIL OFL 1.1, © 2021 The Gowun Dodum Project Authors [30] | 없음 | Regular 7,229,088 [30] | **이미 번들 · 시작 때 preload** [66] | 사용자 글자용으로 쓰는 중. Regular만 있음 |
| 고운바탕 Gowun Batang | SIL OFL 1.1, © 2021 The Gowun Batang Project Authors [31] | 없음 | Regular 8,433,296 / Bold 8,178,712 [31] | **이미 번들 · preload** [66] | Bold 실파일 있음 → 굵은 제목 가능 |
| 동글 Dongle | SIL OFL 1.1, © 2021 The Dongle Project Authors [33] | 없음 | Light 4,389,060 / Regular 4,458,600 / Bold 4,476,536 [33] | 미사용 | 한글 풀세트라 굵기마다 약 4.4MB |
| 하이멜로디 Hi Melody | SIL OFL 1.1, © YoonDesign Inc. [32] | 없음 | Regular 12,623,412 [32] | 미사용 | 제목 한 줄용치고 무겁다 |
| 나눔손글씨 펜 Nanum Pen Script | SIL OFL 1.1, © 2010 NHN Corporation [34] | Nanum · NanumPen · NanumBrush 등 + Naver 변형 [34] | Regular 3,201,664 [34] | **이미 번들**(@expo-google-fonts) [66] | RFN 때문에 수정본에 같은 이름 금지 |
| 마루부리 | **미확인** — 네이버 한글 배포 페이지 접속이 차단됨. 검색으로도 원문 확인 실패 | 미확인 | 미확인 | 미사용 | 사용 전 배포처 라이선스 원문 확인 필요 |
| 온글잎 | **미확인** — 서체마다 조건이 다르다는 2차 설명만 있고 공식 원문을 열지 못함(어떤 서체는 상업적 사용을 폭넓게 제한하는 자체 라이선스라는 산돌구름 소개 글) | 미확인 | 미확인 | 미사용 | 서체별 확인 필수 |

OFL 일반 사항(검색 결과 요약만 확인, 조항 전문은 이 조사에서 읽지 않음): 소프트웨어에 번들해 배포하는 것은 허용, 폰트 단독 판매는 금지, 수정본은 OFL 유지. 원문에서 직접 확인한 것은 각 파일의 라이선스 제목(OFL 1.1) · 저작권 · 예약 이름 유무다 [28][30~34]. 앱에 폰트 파일을 넣을 때 OFL.txt를 함께 두는 현재 방식(`assets/fonts/*/OFL.txt`)은 이 요약과 맞는다 [66].

**"제목 한 군데만 서체 허용"의 득실**(현행: 가이드 §3.1 "UI 글자는 시스템 서체만")

| 항목 | 득 | 실 / 위험 |
|---|---|---|
| 첫인상 | 홈 · 로그인 제목에 손글씨 · 둥근 인상(본능 수준) | 가이드의 "시스템 서체" 일관성이 깨짐 |
| 용량 | 고운돋움 · 고운바탕은 **추가 0**(이미 번들, 세 파일 합계 23,841,096B) [66]. 새 서체는 +3~13MB [30~34] | 한글 풀세트라 굵기마다 큼. 서브셋은 Expo 기본 도구가 없어 별도 작업(**추정**) |
| 로딩 | 현재도 `preloadTextFonts()`가 앱 시작 때 `loadAsync`로 불러옴 [66] | 첫 프레임에 안 불러졌으면 기본 서체로 깜빡임. Expo는 `SplashScreen.preventAutoHideAsync()`로 로드 전 렌더를 막는 패턴을 안내 [36] |
| 굵기 | 고운바탕은 Bold 파일 있음 | 고운돋움은 Regular 한 벌. iOS는 선언한 weight를 무시하고 파일 메타데이터를 읽는다 [35] → 가이드의 800 제목은 합성 굵기 또는 무시될 수 있음(**추정**), 실기기 확인 필요 |
| 플랫폼 | `useFonts`/`loadAsync`는 Expo Go · 웹까지 동작, config plugin은 개발 빌드 필요 · 네이티브 전용 [36] | config plugin을 쓰면 Android는 파일명 = family명, iOS는 글꼴 파일의 이름 [35][36] — 지금은 `loadAsync({ family: file })` 방식이라 영향 적음 |
| 대안 | 서체 없이 자간(-0.6 적용 중) · 굵기 · 크기 대비로 정돈된 인상 | 손글씨 따뜻함은 못 만듦 |

### 1-5. 모션 · 햅틱 · 사운드 (질문 5)

- **길이**: 대부분 100~500ms, 대개 100~400ms. 체크 · 토글 피드백 약 100ms, 모달 등 화면 변화 200~300ms, 400ms는 큰 이동에만, 500ms 이상은 "끌린다". 등장은 퇴장보다 약간 길게(예 300ms vs 200~250ms) [42].
- **이징**: ease-out이 기본(빠르게 시작해 천천히 멈춤), ease-in은 나가는 요소에만 [42]. Material 토큰: 지속시간 short1 50ms ~ long1 450ms ~ extraLong4 1000ms, standard `cubic-bezier(0.2, 0, 0, 1)`, decelerate `(0, 0, 0, 1)`, accelerate `(0.3, 0, 1, 1)`, emphasized decelerate `(0.05, 0.7, 0.1, 1)`. "이동 면적이 커질수록 길게" [44](같은 문서의 표 일부는 토큰 값과 어긋나 있음). 우리 가이드 §10의 260ms · 240ms out-cubic은 이 범위 안.
- **Apple 모션 원칙**: 목적이 있는 모션만, "모션을 위한 모션 금지", 모션 없이도 되게(햅틱 · 오디오 보완), 피드백은 짧고 정확하게, **자주 일어나는 UI 상호작용엔 모션을 피하라**, 취소할 수 있게 [37].
- **Apple 앱 시작**: 런치 화면은 "브랜딩 기회가 아니다", 첫 화면과 거의 같게, 상태를 복원하라 [40] → '앱 열기' 연출은 런치 화면이 아니라 **첫 화면 진입 모션**으로 한다.
- **햅틱 규칙**(Apple): 일관되게, 원인-결과가 분명할 때만, 시스템 패턴의 정의된 의미대로, 다른 피드백을 **보완**, 끌 수 있게, 짧게, 잦으면 "tiresome" [38]. Expo: `impactAsync`/`notificationAsync`/`selectionAsync`; iOS는 저전력 모드 · 설정에서 끔 · 카메라/받아쓰기 중에는 **아무 동작도 하지 않는다** [48].
- **사운드**(Apple): 무음 모드에서는 필수 아닌 효과음을 끈다, 소리만으로 중요한 정보를 전하지 않는다, 시스템 볼륨 존중 [39]. Expo 오디오 라이브러리는 **미조사**.
- **접근성**: WCAG 2.3.3(AAA) "상호작용으로 일어나는 모션은 끌 수 있어야"(필수 기능 제외). 색 · 불투명도만 바뀌는 것은 모션 애니메이션이 아니다(단 blur는 정오표로 포함) [17]. RN: `AccessibilityInfo.isReduceMotionEnabled()`와 `reduceMotionChanged` 이벤트 [45]. Reanimated 4: 모든 애니메이션이 기본 `ReduceMotion.System`이며 켜지면 `withTiming`/`withSpring`이 목표값으로 바로 점프 [46]. 저장소는 `ToolGuideAnimation.js` 한 곳만 reduce-motion을 처리(grep 1개 파일) [66] → 새 모션은 공통 훅이 필요하다.
- **사례(마이크로인터랙션)**: 되돌리기 가능한 찜(Gap의 하트), 생일 풍선(Apple), 시작 멜로디(Xbox)는 NN/g가 든 예 [43]. Mailchimp는 불안한 확인 순간에 브랜드 성격을 얹었다 [6]. 앱 열기 · 스티커 붙이기 · 삭제/복원 · 로딩에 맞춘 구체 설계는 공식 가이드에 **없고**, 아래 수단 카탈로그의 제안은 **추정**이다.
- **구현 · 성능**: 지금은 RN 코어 `Animated`(10개 파일 58곳)이고 `useNativeDriver`·transform/opacity 원칙은 가이드 §10에 있다 [66]. Reanimated(Expo 문서 SDK 58: `react-native-worklets` 동반 설치, Babel 설정 자동, Expo Go 포함) [47]. Lottie는 Expo 번들 버전 7.2.2(검색 결과 발췌) [54]. Callstack 벤치(2023, **Android 구형 한 기기** Sony Xperia Z3): 같은 애니메이션이 Lottie ≈17FPS, Rive ≈60FPS, Rive 총 메모리 276MB > Lottie 246MB — 일반화하지 말고 우리 안드로이드 태블릿에서 직접 측정 [55]. 파일 크기는 Rive가 작다는 벤더 주장이 다수([55]는 예시 24.37KB → 2KB를 인용)이나 검증 안 됨.

### 1-6. 마이크로카피 (질문 6)

| 출처 | 확인한 원칙 | 우리에게 주는 시사 |
|---|---|---|
| 토스 UX Writer 인터뷰(2021-02-18) [56] | 군더더기 제거("잡초 뽑기"), 하나의 보이스, 사용자 효용 우선, 낚시성 과장은 지향하지 않음. 디자인 시스템 규칙으로 보조 버튼은 "취소" 대신 "닫기"·"다음에". 대출 상환 알림에 "갚느라 고생 많으셨다"를 넣어 지표가 오르고 격려로 느낀다는 반응 | 감성은 **노력한 순간의 격려**에 쓴다. 버튼 이름으로 감정 부담을 낮출 수 있다(**추정**) |
| 요즘IT의 배민 분석(2022-01-27) [57] | 브랜드 키워드 "B급 · 키치 · 유머", 대기 화면 "맛있게 만들고 있어요" · "거의 다 왔어요", '싫어요' 대신 '아쉬워요' | 유머는 **브랜드 성격이 유머일 때만**. DIO의 성격은 "차분 · 손글씨 같은 따뜻함"(가이드 §1.1) → 배민식 위트는 맞지 않음. 2차 해석 글 |
| Apple HIG Writing [41] | 상황에 따라 톤을 바꾼다(심각한 낙상 감지는 직접적, 운동 달성은 가볍게). 오류에서 "oops!"·"uh-oh"는 불필요하고 **불성실하게 들릴 수 있음**. "너무 귀엽거나 영리한 라벨을 피하라". 버튼은 동사 | 오글거림 방지의 공식 근거 |
| Mailchimp [58] | "명확한 것이 재미있는 것보다 항상 중요". "억지 유머는 없는 것보다 나쁠 수 있다". "확신이 없으면 straight face". 독자의 감정 상태에 따라 톤을 조절 | 정서 문구는 **독자 상태를 알 때만** |
| 당근 · 카카오 | 공개 원문을 **찾지 못함**(검색 결과에 없음) | — |

**감성 톤 vs 친절한 안내 멘트**

| 구분 | 감성 톤(정서 문구) | 친절한 안내 멘트 |
|---|---|---|
| 목적 | 사용자의 기분에 응답(인사 · 격려 · 공감) | 다음 행동 · 사용법 · 결과를 알림 |
| 예 | "좋은 아침이에요" 같은 인사 한 줄, 빈 상태 사실형 한 줄 | "두 번 누르면 자를 수 있어요", "틀 없이 붙어요" |
| 우리 규칙(가이드 §8) | 규칙이 명시적으로 막지 않음. 범위만 정하면 양립 | **금지** |

**양립하는 정서 문구의 범위(제안 후보, 검증 전)**

| 자리 | 후보 | 위험(근거) |
|---|---|---|
| 홈 인사 / 계절감 | 시간대 · 계절의 짧은 인사 한 줄, 호명 없음 | 반복 노출로 닳음(Kano) [4], 말끝 과장 · 감탄사가 오글거림의 주원인 [41][58] |
| 빈 상태 | **사실형 한 줄**("다이어리가 없어요" 유지) + 캐릭터가 정서 담당 | NN/g도 빈 상태 예시 문구는 평이한 사실형 [59] |
| 완료 토스트 | 현행 사실형 유지가 안전. 정서 꼬리는 '노력 뒤 격려'가 맞는 자리(예: 긴 작업 마무리)에만 | 토스의 "고생 많으셨다"는 상환 같은 노력 맥락 [56] — 내보내기 완료 같은 기계적 완료에는 **부적합 추정** |
| 오류 | 감탄사 · 유머 금지 | [41][58] |
| 삭제 · 휴지통 | 중립 · 정확 유지("n일 후 영구 삭제"). 감정은 버튼 이름("닫기" vs "취소") 수준 | Apple Recently Deleted는 남은 일수를 표시, 영구 삭제 확인은 "되돌릴 수 없다" 경고(검색 결과 요약) [64]. 감성 문구 사례는 **찾지 못함** |

### 1-7. 빈 상태 · 삭제 · 휴지통 (질문 7)

- NN/g 3원칙(Kaplan, 2021-09-19): ① 시스템 상태를 알려라(완전히 빈 화면은 혼란) ② 학습 단서를 줘라 ③ 핵심 작업으로 가는 직접 경로를 줘라. 예시 문구는 평이한 사실형이고 톤 · 일러스트 · 유머는 **다루지 않는다** [59]. ②③은 가이드 §8의 "사용법 안내 금지"와 부딪히므로, 우리는 **문구 대신 버튼 · 배치로** 해결해야 한다(가이드가 이미 "문구를 더하지 말고 배치 · 아이콘 · 동작을 고친다"고 함) [66].
- SAP Fiori 일러스트 지침(검색 결과 발췌만, 본문 열람 403): 일러스트는 장식이나 빈 곳 채우기용이 아니라 의사소통 수단이며 메시지와 함께 쓰고, 작은 UI에는 쓰지 않는다 [60].
- 감정을 일러스트 · 캐릭터 · 질감이 맡고 글은 사실형으로 두는 구성이 우리 규칙과 양립한다(**해석**). 단 캐릭터 일러스트가 빈 상태 만족도를 올린다는 **측정 연구는 찾지 못함**. Mailchimp 확인 화면 사례 정도가 간접 근거 [6].
- 휴지통 보관 기간 관행: Google Photos는 백업된 항목 60일 · 아닌 항목 30일, Apple Recently Deleted 30일 + 남은 일수 표시(검색 결과 요약 · 원문 미열람) [64]. 우리 "n일 후 영구 삭제 + 3일 이하 danger 색"은 이 관행과 같은 방향(단 danger 글자 대비 3.85, 1-3 참고).
- 삭제 모션(휴지통으로 이동 → 되돌리기 토스트, 복원 시 원위치 복귀)은 Apple의 "되돌릴 수 있게 · 짧게" [37]와 정점-끝 규칙 [6]에서 나온 **추정 설계**다.

### 1-8. 로그인 · 가입 폼 감성화의 한계 (질문 8)

- Baymard: 계정 생성을 강제하면 19%가 결제를 포기(연도 · 표본은 페이지에 없음). 모든 사용자에게 게스트 경로를 주고 계정 생성은 마지막 단계로 미루라 [61]. 우리 로그인의 "게스트 시작"과 방향이 같다. 단 결제 맥락 자료다.
- NN/g: 플레이스홀더는 라벨을 대체하면 안 되고(소실 · 저대비 · 점검 곤란), 라벨 · 필수 안내는 입력칸 밖에 둔다(2014, 2018 재검토) [63].
- WCAG 1.4.11: 입력칸이 **경계로만** 식별되면 그 경계가 3:1이어야 한다. 현재 `border` 1.39(내 계산) → 입력칸 모양을 바꾸는 감성 작업은 경계 대비를 **올리는 방향**이어야 한다 [16].
- 일러스트가 가입 전환을 떨어뜨렸다는 사례: Spotify 가입 화면에 배경 일러스트를 넣은 안이 단순한 안에 졌다는 Lazyweb 글(2024-08-02). **수치 · 표본 · 기간 없음, 1차 출처는 열람 불가** → 약한 증거 [62]. 가입 화면 감성화의 전환 효과를 직접 측정한 신뢰할 만한 자료는 **찾지 못함**.
- 안전선(근거 + **추정**): 안전 = 배경색 · 종이결 · 카드 모서리/그림자 · 입력 영역 **밖** 헤더 일러스트(키보드가 열리면 줄이거나 숨김) · 단계 분리 · 완료 체크. 위험 = 입력 영역 뒤 일러스트 · 플레이스홀더로 라벨 대체 · 입력칸 경계 약화 · 입력 중 움직이는 장식 · 오류 문구의 유머. 소셜 로그인 버튼의 제공자 색은 가이드가 이미 허용 [66]. 위 안전선은 **A/B 측정 후 확정**(계획 K 영역).

## 2. 수단 카탈로그

난이도: **기존** = 현재 package.json의 라이브러리로 가능 / **추가** = 새 설치 필요(대부분 Expo Go 포함 표기 [47~51], 최종은 개발 빌드로 확인).

| # | 수단 | 만드는 감성 | 쓸 화면 | RN 구현 난이도 | 접근성 · 성능 주의 | 우리 규칙과 충돌 |
|---|---|---|---|---|---|---|
| 1 | 따뜻한 면 색(웜 뉴트럴 · 파스텔 보조 면) | 포근함 | 홈 · 내 공간 · 휴지통 | 기존(theme.js) | 위 대비 표. 글자는 `text`/`textMuted` 유지 | §2.2 보조값 확장 필요 |
| 2 | 틴트 그림자(네이비 → 면 색 hue) | 부드러운 깊이 | 카드 · 시트 · 소품 | 기존(`shadowColor`; `boxShadow`는 추가 설정 확인) [52][53] | Android 28 미만은 색 무시 | 충돌 없음(이미 네이비) |
| 3 | 큰 곡률 · 알약 형태 | 귀여움(baby schema 연상) [8] | 버튼 · 카드 | 기존 | 터치 영역 44 유지 | §4.3 모서리 값 갱신 |
| 4 | 은은한 그라데이션 면 | 햇살 · 몽환 | 홈 · 로그인 배경 | 추가 `expo-linear-gradient`(Expo Go 포함, Android dither 옵션) [49] 또는 RN `backgroundImage` 문서 [53] | 밴딩 | §2.2 보조값 필요 |
| 5 | 종이결 · 그레인(큰 면, 저불투명도) | 촉각 · 아날로그 [24] | 홈 바탕 · 내 공간 · 휴지통 | 기존(PNG 타일 + expo-image) 또는 추가 Skia [51](웹은 CanvasKit 필요) | 이미지 메모리, 글자 뒤 제외. 질감 자체의 접근성 연구는 못 찾음 | 질감 규정 신설 필요 |
| 6 | 캐릭터(모아 · 디오) · 일러스트 | 귀여움 · 정서 | 빈 상태 · 로그인 헤더 · 완료 · 휴지통 | 기존(react-native-svg · expo-image) | 대체 텍스트, 큰 이미지 메모리 | 빈 화면 문구 규칙과 양립. 일러스트 규정 없음 |
| 7 | 투명 PNG 소품 · 빛(햇살 책상) | 첫인상(본능) | 홈 | 기존(expo-image) | 이미지 용량, "이미지 페이드 없음" 규칙과 별개 | 로고 주변 25% 여백 침범 금지(BI) |
| 8 | 제목 서체 1곳(고운돋움/고운바탕 등) | 손글씨의 따뜻함 | 홈 제목 · 로그인 제목 | 기존(`expo-font` + 번들 서체) | FOUT, 굵기 합성, 웹 로딩 | **§3.1 충돌** → 변경 필요 |
| 9 | 자간 · 굵기 · 크기 대비 | 정돈된 인상 | 전체 | 기존 | — | 충돌 없음 |
| 10 | 눌림 스프링(살짝 줄었다 복귀) | 쫀득한 조작감 | 버튼 · 카드 | 기존 `Animated.spring` / 더 부드럽게는 추가 Reanimated [47] | reduce motion 시 즉시 | §7 눌림 값 확장 |
| 11 | 스티커 붙이는 순간(툭 + 가벼운 햅틱) | 성취감(행동 → 정점) | 편집기 | 기존 가능, 캔버스 성능은 Reanimated 권장(**추정**) | 캔버스 프레임 보호, 햅틱 끄기 | §10 신규 규칙 |
| 12 | 삭제 · 복원 이동 모션 | 안심 · 부드러운 이별 | 휴지통 · 홈 | 기존 / Reanimated | reduce motion 시 점프 [46] | §11 삭제 패턴과 양립 |
| 13 | 홈 진입 연출(다이어리가 책상에 놓임) | 첫 정점 | 홈 | Reanimated 권장 | 500ms 이내 [42], 런치 화면 아님 [40] | §10 값 추가 |
| 14 | 햅틱 | 확실한 손맛 | 스티커 붙이기 · 삭제 · 복원 · 토글 | 추가 `expo-haptics` [48](Expo Go 포함 여부는 문서에 없음) | iOS 저전력 · 설정에서 무동작, 끌 수 있게 [38] | 햅틱 규정 신설 |
| 15 | 효과음 | 감성(선택) | 스티커 붙이기 등 | 추가(라이브러리 **미조사**) | 무음 모드 존중, 소리만으로 전달 금지 [39] | 규정 없음. **보류 권장** |
| 16 | Lottie / Rive 캐릭터 애니 | 살아 있는 캐릭터 | 빈 상태 · 완료 | 추가 `lottie-react-native` [54] 또는 Rive | 저사양 FPS [55], 파일 크기 | 이미지 페이드 없음 규칙과 별개 |
| 17 | 정서 문구(인사 · 계절 · 빈 상태 한 줄) | 다정함 | 홈 · 빈 상태 | 기존(문자열) | 반복 닳음 [4], 오글거림 [41][58] | §8 범위 명문화 필요 |
| 18 | 블러 유리 패널(Liquid Glass풍) | 현대적 | — | 추가 `expo-blur`(Android는 BlurTargetView 필요 · 구형 성능 저하) [50] | 가독성 [11] | **비추천** |
| 19 | 뉴모피즘 | — | — | 기존 | 비텍스트 3:1 미달 가능 [16], 약한 신호 일반 결과 과업 22%↑ [14](뉴모피즘 직접 측정은 아님) | **비추천** |
| 20 | 입력칸 모양 · 배경 변화 | 부드러움 | 로그인 · 가입 | 기존 | 경계 3:1, 플레이스홀더 금지 [16][63] | §9 입력칸 규정 확인 |

## 3. 가이드 변경이 필요한 항목

| # | 위치 | 변경 내용 | 득 | 실 / 위험 | 변경 없이 가는 대안 |
|---|---|---|---|---|---|
| 1 | §3.1 서체 | "UI 글자는 시스템 서체만" → 제목 1종(홈 제목 등)만 번들 서체 허용 | 첫인상 · 손글씨 정체성, 고운돋움/바탕은 용량 0 | 로딩 깜빡임, 굵기 합성, 일관성 약화. (참고) 가이드 §3.1의 사용자 글자 서체 목록에는 고운돋움 · 고운바탕이 없어 코드(`textFonts.js`)와 어긋나 있음 | 자간 · 굵기 대비 |
| 2 | §2.2 보조값 | 웜 면 색 · 그라데이션 색 · 틴트 그림자 색을 보조값 표에 추가(코덱스가 값 확정) | 따뜻함을 토큰 안에서 | 값이 늘수록 일관성 관리 부담 | 콘텐츠 팔레트를 UI에 쓰지 않음(현행) |
| 3 | §2.1 / §2.3 대비 | `danger` 글자(3.85) · `primaryStrong`/`surfaceSoft`(4.47) · `border`(1.38) · 앱 배경 위 `primary` 선(2.98) 보정 | WCAG 2.2 AA 충족(감성과 무관한 부채) | 색 값이 미세하게 바뀜. `text`(네이비) 계열은 BI라 건드리지 않음 | 해당 글자 크기를 큰 글자 기준으로 키우거나 `text`/`textMuted`로 대체 |
| 4 | §4.4 그림자 | 면 색 hue를 딴 그림자 허용 | 따뜻한 면에서도 탁하지 않음 [22] | Android 28 미만 색 미적용 [52] | 현행 네이비 유지 |
| 5 | §10 움직임 | 눌림 스프링 · 진입 연출 ≤500ms · 스티커 붙이기 · 삭제/복원 · **동작 줄이기 필수 대응** · 햅틱 규칙(끌 수 있게, 보완용) 신설 | 조작감 · 정점 | 성능, 구현량. Reanimated 도입 시 의존성 증가 | 현행 Animated + 짧은 값만 |
| 6 | §8 글쓰기 | '정서 문구' 허용 범위 정의(인사 한 줄 · 빈 상태 사실형 + 캐릭터, 감탄사 · 유머 금지) | 금지 규칙과 충돌 없이 다정함 | 모호하면 안내 멘트가 되살아남. 반복 닳음 | 문구는 그대로, 정서는 그림이 담당 |
| 7 | §9 공용 컴포넌트 | 빈 상태(캐릭터 + 한 줄) 컴포넌트 신설 | 빈 화면마다 일관된 정서 | 캐릭터 에셋 의존 | 현행 텍스트만 |
| 8 | 신규 장 | 질감 · 일러스트 규정(그레인 불투명도 상한, 글자 뒤 금지, 캐릭터 허용 자리) | 질감이 크롬으로 번지는 것 방지 | 규정 작성 부담 | 시안 단위로만 관리 |
| 9 | 로그인 · 가입 부록 | 입력칸 경계 3:1 명시, 헤더 일러스트는 입력 영역 밖에서만, 키보드 열림 시 처리 | 폼 신뢰 · 접근성 유지 | 장식 자유도 감소 | 현행 |
| 10 | §1.2 로고 | 소품 · 빛 · 캐릭터가 **로고 높이 25% 여백**과 로고 색(`#242424`/`#ABB1D8`)을 침범하지 않는다는 확인 문구 | BI 보호 | 없음 | — |

BI/CI를 지키는 선(가이드 기준): 로고 색 · 비율 · 여백 · 그림자 금지, `text #0B1766`과 `primary` 계열의 역할, 앱 아이콘/스플래시(`#D4D7ED`) 규칙은 이 조사의 어떤 수단도 건드리지 않는다. `secondary #ABB1D8`은 "넓게 쓰지 않음" 규칙이 있으므로 보조 면을 넓히는 일은 **새 보조 색**으로 하고 `secondary`를 면적으로 키우지 않는다 [66].

## 4. 찾지 못한 것 · 한계

- **마루부리 · 온글잎 라이선스**: 네이버 한글 배포 페이지 접속 차단(WebFetch 불가), 온글잎은 공식 배포처 원문을 열지 못함. 둘 다 사용 전 직접 확인 필요.
- **Pretendard 단일 굵기 파일 크기**: 확인하지 못함(릴리스 zip만 확인). 가변 · 서브셋 파일 크기도 미확인.
- **한국어 서체의 '감성' 효과 연구**: 찾지 못함. 서체 후보는 라이선스 · 용량 · 앱 현황만 확인했고 글자꼴이 주는 인상 판단은 코덱스 몫.
- **당근 · 카카오의 공개 UX 라이팅 원문**: 못 찾음. 토스 · Apple · Mailchimp · 요즘IT의 배민 분석(2차)만 사용. 토스 자료는 2021년 글.
- **삭제 · 이별 순간의 감성 문구 사례, 빈 상태 일러스트의 효과 측정**: 신뢰할 만한 자료를 못 찾음. Google Photos/Apple 보관 기간은 검색 결과 요약만(원문 미열람).
- **가입 폼 감성화의 전환 영향**: 직접 측정 자료 없음. Spotify 사례는 2차 · 수치 없음. Baymard 19%는 결제 맥락이고 연도 · 표본이 페이지에 없음.
- **그레인 · 종이 질감의 접근성 · 효과**, **페리윙클/네이비+파스텔의 감정 효과**: 직접 연구 못 찾음(대비 계산으로 안전성만 확인).
- **Kano 1984 원문, Kahneman 1993 원문, 노먼 책 원문**: 열람하지 못함(2차 요약 · 인용 페이지 기준).
- **10~20대 여성에 한정된 감성 UI 연구**: 못 찾음. 연령은 M3 Expressive의 18~24세(Google 자체 연구) [12]와 20대 다꾸 보도 [26] 정도. 성별 근거는 **없음**. 다꾸 시장 · 타깃은 `속지 에셋 아이디어/01 트렌드 조사`가 이미 다룬다(00 조사 계획).
- **이해관계 출처**: Creative Market [24](판매처), Kano Surveys [4](설문 도구), Google [12](자사 연구), Rive/Lottie 비교 글 [55]은 판매처 · 벤더 · 자사 글. 수치를 일반 법칙으로 쓰지 말 것.
- **RN 환경 미확인**: `boxShadow`의 신 아키텍처 전제와 앱의 실제 설정, `expo-haptics`의 Expo Go 동작, 안드로이드 태블릿 · iPad에서의 폰트 굵기 합성 결과, Lottie/Reanimated 실측 FPS.
- **검색 규모**: WebSearch 39회 + WebFetch 약 60회(차단 · 404 · 403 일부 실패). 제한 사항: 검색 도구가 미국 기준이라 한국어 자료 범위가 좁다.

## 5. 출처표

확인 방식: **열람** = WebFetch로 원문(또는 공식 데이터 JSON)을 열어 해당 내용을 확인 / **검색 발췌** = 검색 결과 요약만 확인(본문 열람 실패) / **PDF 추출** = 내려받은 PDF를 `pdftotext`로 읽음 / **저장소** = 로컬 파일 직접 읽음 / **계산** = 직접 계산.

| 번호 | 제목 | 발행처 | 발행일 | URL | 확인 방식 |
|---|---|---|---|---|---|
| 1 | The 3 Levels of Emotional Processing (영상) | Nielsen Norman Group (Therese Fessenden) | 2022-05-27 | https://www.nngroup.com/videos/3-levels-emotional-processing/ | 열람(수준 이름만, 설명 없음) |
| 2 | Emotional Design | Don Norman, jnd.org | 확인하지 못함 | https://jnd.org/emotional-design/ | 열람 |
| 3 | The Aesthetic-Usability Effect (Kate Moran) | Nielsen Norman Group | 2024-02-03 (최종 검토 2026-09-01) | https://www.nngroup.com/articles/aesthetic-usability-effect/ | 열람 |
| 4 | Delighters in the Kano Model | Kano Surveys (Waypoint Software) | 확인하지 못함 (© 2026) | https://www.kanosurveys.com/articles/delighters-in-the-kano-model | 열람 |
| 5 | Kano model | Wikipedia | 확인하지 못함 | https://en.wikipedia.org/wiki/Kano_model | 검색 발췌 |
| 6 | Peak-End Rule | Laws of UX | 확인하지 못함 | https://lawsofux.com/peak-end-rule/ | 열람 |
| 7 | The Power of Kawaii (Nittono, Fukushima, Yano, Moriya) | PLOS ONE 7(9):e46362 | 2012-09-26 | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0046362 | 열람 |
| 8 | Baby Schema in Infant Faces Induces Cuteness Perception and Motivation for Caretaking in Adults (Glocker 외) | Ethology 115 (수락 2008-10-23, 권호 · 쪽수 257~263은 검색 요약 기준) | 2009 | https://www.cceb.upenn.edu/csa/assets/user-content/documents/BabySchemainInfantFacesInducesCutenessPerceptionandMotivationforCaretakinginAdults.pdf | PDF 추출(초록의 n=122 확인) |
| 9 | Adopting Liquid Glass | Apple Developer Documentation | 확인하지 못함 (© 2026) | https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass | 열람(.md 데이터 경로) |
| 10 | Liquid Glass (Technology Overview) | Apple Developer Documentation | 확인하지 못함 | https://developer.apple.com/documentation/technologyoverviews/liquid-glass | 열람(.md 데이터 경로) |
| 11 | Liquid Glass Is Cracked, and Usability Suffers in iOS 26 (Raluca Budiu) | Nielsen Norman Group | 2025-10-10 | https://www.nngroup.com/articles/liquid-glass/ | 열람 |
| 12 | Better, Easier, Emotional UX (Material 3 Expressive 연구) | Google Design | 페이지에 날짜 없음 (2025-05 발표, 보도일 기준) | https://design.google/library/expressive-material-design-google-research | 열람 |
| 13 | Introducing Material 3 Expressive for Wear OS | Android Developers Blog | 2025-08 | https://android-developers.googleblog.com/2025/08/introducing-material-3-expressive-for-wear-os.html | 검색 발췌 |
| 14 | Flat UI Elements Attract Less Attention and Cause Uncertainty (Kate Moran) | Nielsen Norman Group | 2017-09-03 | https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/ | 열람 |
| 15 | Understanding SC 1.4.3 Contrast (Minimum), WCAG 2.2 | W3C WAI | 확인하지 못함 | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html | 열람 |
| 16 | Understanding SC 1.4.11 Non-text Contrast, WCAG 2.2 | W3C WAI | 확인하지 못함 | https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | 열람 |
| 17 | Understanding SC 2.3.3 Animation from Interactions, WCAG 2.2 | W3C WAI | 확인하지 못함 | https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html | 열람 |
| 18 | Effects of color on emotions (Valdez & Mehrabian), J Exp Psychol Gen 123(4):394-409 | PubMed 7996122 | 1994 | https://pubmed.ncbi.nlm.nih.gov/7996122/ | 열람(초록) |
| 19 | Color and emotion: effects of hue, saturation, and brightness (Wilms & Oberfeld), Psychol Res | PubMed 28612080 | 2018 (온라인 2017) | https://pubmed.ncbi.nlm.nih.gov/28612080/ | 열람(초록) |
| 20 | Pantone announces Very Peri as Color of the Year 2022 | designboom | 2021-12-09 | https://www.designboom.com/design/pantone-very-peri-color-of-the-year-2022-12-09-2021/ | 열람 |
| 21 | Cloud Dancer by Pantone (2026 올해의 색) | Dezeen | 2025-12-04 | https://www.dezeen.com/2025/12/04/lofty-white-cloud-dancer-pantone-colour-of-the-year-2026/ | 열람 |
| 22 | Designing Beautiful Shadows in CSS (Josh W. Comeau) | joshwcomeau.com | 2021-09-13 (갱신 2026-04-27) | https://www.joshwcomeau.com/css/designing-shadows/ | 열람 |
| 23 | Color (Human Interface Guidelines) | Apple Developer | 확인하지 못함 | https://developer.apple.com/tutorials/data/design/human-interface-guidelines/color.json | 열람(앞 100,000자만, 나머지 미열람) |
| 24 | Texture, Haptics, and Clutter: Design Trends for 2026 and Beyond | Creative Market Blog (게스트 필자, 판매처 블로그) | 갱신 2026-01-20 | https://creativemarket.com/blog/texture-haptics-and-clutter-aesthetics | 열람 |
| 25 | Apple unveils winners and finalists of the 2025 Apple Design Awards | Apple Newsroom | 2025-06-03 | https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/ | 열람 |
| 26 | 20대 아날로그 취미(다꾸 · 뜨개 · 필카) 기사 | 파이낸셜뉴스 | 2025-05-21 | https://www.fnnews.com/news/202505211832406752 | 열람 |
| 27 | Pretendard README | GitHub orioncactus/pretendard | 확인하지 못함 (v1.3.9 예시) | https://github.com/orioncactus/pretendard | 열람 |
| 28 | Pretendard LICENSE (SIL OFL 1.1) | GitHub orioncactus/pretendard | 확인하지 못함 | https://raw.githubusercontent.com/orioncactus/pretendard/main/LICENSE | 열람 |
| 29 | Pretendard 릴리스 v1.3.9 자산 목록 | GitHub API | 2023-11-05 | https://api.github.com/repos/orioncactus/pretendard/releases/latest | 열람 |
| 30 | Gowun Dodum OFL.txt · 파일 크기 | google/fonts (GitHub) | 확인하지 못함 | https://raw.githubusercontent.com/google/fonts/main/ofl/gowundodum/OFL.txt · https://api.github.com/repos/google/fonts/contents/ofl/gowundodum | 열람 |
| 31 | Gowun Batang OFL.txt · 파일 크기 | google/fonts (GitHub) | 확인하지 못함 | https://raw.githubusercontent.com/google/fonts/main/ofl/gowunbatang/OFL.txt · https://api.github.com/repos/google/fonts/contents/ofl/gowunbatang | 열람 |
| 32 | Hi Melody OFL.txt · 파일 크기 | google/fonts (GitHub) | 확인하지 못함 | https://raw.githubusercontent.com/google/fonts/main/ofl/himelody/OFL.txt · https://api.github.com/repos/google/fonts/contents/ofl/himelody | 열람 |
| 33 | Dongle OFL.txt · 파일 크기 | google/fonts (GitHub) | 확인하지 못함 | https://raw.githubusercontent.com/google/fonts/main/ofl/dongle/OFL.txt · https://api.github.com/repos/google/fonts/contents/ofl/dongle | 열람 |
| 34 | Nanum Pen Script OFL.txt · 파일 크기 | google/fonts (GitHub) | 확인하지 못함 | https://raw.githubusercontent.com/google/fonts/main/ofl/nanumpenscript/OFL.txt · https://api.github.com/repos/google/fonts/contents/ofl/nanumpenscript | 열람 |
| 35 | Font (SDK 58 레퍼런스) | Expo Docs | 확인하지 못함 | https://docs.expo.dev/versions/latest/sdk/font/ | 열람 |
| 36 | Fonts 가이드 | Expo Docs | 확인하지 못함 | https://docs.expo.dev/develop/user-interface/fonts/ | 열람 |
| 37 | Motion (Human Interface Guidelines) | Apple Developer | 확인하지 못함 | https://developer.apple.com/tutorials/data/design/human-interface-guidelines/motion.json | 열람 |
| 38 | Playing haptics (Human Interface Guidelines) | Apple Developer | 확인하지 못함 | https://developer.apple.com/tutorials/data/design/human-interface-guidelines/playing-haptics.json | 열람 |
| 39 | Playing audio (Human Interface Guidelines) | Apple Developer | 확인하지 못함 | https://developer.apple.com/tutorials/data/design/human-interface-guidelines/playing-audio.json | 열람 |
| 40 | Launching (Human Interface Guidelines) | Apple Developer | 확인하지 못함 | https://developer.apple.com/tutorials/data/design/human-interface-guidelines/launching.json | 열람 |
| 41 | Writing (Human Interface Guidelines) | Apple Developer | 확인하지 못함 | https://developer.apple.com/tutorials/data/design/human-interface-guidelines/writing.json | 열람 |
| 42 | Executing UX Animations: Duration and Motion Characteristics (Page Laubheimer) | Nielsen Norman Group | 2020-02-09 | https://www.nngroup.com/articles/animation-duration/ | 열람 |
| 43 | Microinteractions in User Experience (Alita Kendrick) | Nielsen Norman Group | 2018-10-21 | https://www.nngroup.com/articles/microinteractions/ | 열람 |
| 44 | Motion 테마 문서(지속시간 · 이징 토큰) | material-components-android (GitHub) | 확인하지 못함 | https://raw.githubusercontent.com/material-components/material-components-android/master/docs/theming/Motion.md | 열람 |
| 45 | AccessibilityInfo | React Native 문서 | 확인하지 못함 | https://reactnative.dev/docs/accessibilityinfo | 열람 |
| 46 | Accessibility (Reduce Motion) | React Native Reanimated 4.x 문서 | 확인하지 못함 | https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/ | 열람 |
| 47 | Reanimated (SDK 58) | Expo Docs | 확인하지 못함 | https://docs.expo.dev/versions/latest/sdk/reanimated/ | 열람 |
| 48 | Haptics | Expo Docs | 확인하지 못함 | https://docs.expo.dev/versions/latest/sdk/haptics/ | 열람 |
| 49 | LinearGradient | Expo Docs | 확인하지 못함 | https://docs.expo.dev/versions/latest/sdk/linear-gradient/ | 열람 |
| 50 | BlurView | Expo Docs | 확인하지 못함 | https://docs.expo.dev/versions/latest/sdk/blur-view/ | 열람 |
| 51 | Skia (SDK 58) | Expo Docs | 확인하지 못함 | https://docs.expo.dev/versions/latest/sdk/skia/ | 열람 |
| 52 | Shadow Props | React Native 문서 | 확인하지 못함 | https://reactnative.dev/docs/shadow-props | 열람 |
| 53 | View Style Props (boxShadow · filter · backgroundImage) | React Native 문서(0.88) | 확인하지 못함 | https://reactnative.dev/docs/view-style-props | 열람 |
| 54 | Lottie | Expo Docs | 확인하지 못함 | https://docs.expo.dev/versions/latest/sdk/lottie | 검색 발췌(직접 열람 404, 번들 7.2.2 · Expo Go 포함은 검색 요약) |
| 55 | Lottie vs. Rive: Optimizing Mobile App Animation (Hur Ali) | Callstack | 2023-01-11 | https://callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation | 열람 |
| 56 | 토스가 금융을 더 쉽게 만드는 또 하나의 방법, UX Writing | 토스피드 | 2021-02-18 | https://toss.im/tossfeed/article/uxwriter-interview | 열람 |
| 57 | 마이크로카피 이야기: ③배달의민족 UX Writing (켈리폴리) | 요즘IT(위시켓) | 2022-01-27 | https://yozm.wishket.com/magazine/detail/1304/ | 열람 |
| 58 | Voice and Tone | Mailchimp Content Style Guide | 확인하지 못함 | https://styleguide.mailchimp.com/voice-and-tone/ | 열람 |
| 59 | Designing Empty States in Complex Applications (Kate Kaplan) | Nielsen Norman Group | 2021-09-19 | https://www.nngroup.com/articles/empty-state-interface-design/ | 열람 |
| 60 | Illustrated Message (Fiori Design Guidelines) | SAP | 확인하지 못함 | https://www.sap.com/design-system/fiori-design-web/v1-96/ui-elements/illustrated-message/usage | 검색 발췌(열람 403) |
| 61 | How to Reduce Cart Abandonment | Baymard Institute | 확인하지 못함 | https://baymard.com/blog/reduce-cart-abandonment | 열람(19% 문구, 연도 · 표본 없음) |
| 62 | Can a sign-up illustration reduce logins and registrations? (Ali Abouelatta) | Lazyweb Research | 2024-08-02 | https://www.lazyweb.com/research/spotify-sign-up-illustration-test | 열람(2차 요약, 1차 출처 First 1000 미열람) |
| 63 | Placeholders in Form Fields Are Harmful (Katie Sherwin) | Nielsen Norman Group | 2014-05-11 (재검토 2018-09-10) | https://www.nngroup.com/articles/form-design-placeholders/ | 열람 |
| 64 | Restore recently deleted photos & videos 등 휴지통 보관 기간 안내 | Google Photos 도움말 · Apple 지원 | 확인하지 못함 | https://support.google.com/photos/answer/9343482 | 검색 발췌 |
| 65 | Neumorphism 접근성 비판 요약 | Wikipedia · Built In · Webflow | 확인하지 못함 | https://en.wikipedia.org/wiki/Neumorphism | 검색 발췌(Webflow 열람은 파싱 오류) |
| 66 | 저장소 파일: `docs/디자인 가이드.md`, `frontend/package.json`, `frontend/app.json`, `frontend/src/shared/theme.js`, `frontend/src/editor/services/textFonts.js`, `frontend/assets/fonts/README.md`, `docs/다이어리 홈 햇살 책상/색인.md`, `docs/앱 감성 리뉴얼/00 조사 계획.md` | 이 저장소(S15P31F106) | 가이드 기준일 2026-10-22 | (로컬 파일) | 저장소 직접 읽음. 대비 수치 · 색상환 값은 계산(WCAG 상대 휘도 공식, 스크립트로 계산) |
