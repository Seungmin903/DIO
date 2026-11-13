// 유리펜 잉크 모델 — 순수 계산(RN 의존 없음). PC 하네스(`유리펜 설계/하네스/glassInk.js`)에서 옮겨 왔다.
// 옮기는 건 `유리펜 설계/하네스/앱으로 옮기기.py` 가 한다(손으로 고치지 말 것 — 다음 판에 덮어쓴다).
// 하네스와 다른 점은 좌표계뿐이다: 모든 길이가 **페이지 단위**다(하네스는 화면 px).
//   셰이더는 페이지 좌표 xy 를 받고, 자식 이미지(마스크 · 고임 장)만 q = (xy − org)·ppu 로 픽셀 좌표로 바꿔 읽는다.
// 1판: 잉크 두께 채널 + 염료만. 커피링 · 테 · 글리터 · 잉크 잔량은 다음 판.
//
// 구조(판마다 바꾸지 않음):
//   점(x, y, time) → 곡선 표본 → 표본마다 두께 t · 반지름 r
//   → 마스크 층: 획 하나 안은 Lighten(최대), 획끼리는 Plus(겹치면 두꺼워짐), G = t / T_MAX (premul)
//   → 셰이더 한 번: 두께 → 불투명도 · 색 깊이

export const GLASS_INK = {
  version: 47,
  T_MAX: 4,            // 마스크 G 채널 1.0 = 두께 4
  spacing: 0.12,       // 표본 간격(굵기 배수)
  // 속도 → 두께: 빠르면 얇게, 느리면 두껍게 (page 단위/ms)
  tFast: 0.75,
  tSlow: 1.55,
  v0: 0.18,            // 이 속도에서 두 값의 중간쯤
  // 끝 고임: 시작(찍은 방울) · 끝(뗄 때)
  poolStart: 0,       // 3판: 1.1 → 0 (면봉 머리)
  poolEnd: 0.25,      // 3판: 0.7 → 0.25
  poolLen: 0.8,        // 고임 길이(굵기 배수) 3판: 1.1 → 0.8
  poolWiden: 0,        // 고임에서 반지름 증가(최대) 3판: 0.32 → 0
  rSmooth: 0.7,        // 28판: 필압 떨림을 고르는 창(굵기 배수). 닙은 제 크기보다 빨리 굵기가 안 변한다
  // 염료: 불투명도 = 1 − exp(−k·T), 색 깊이 = exp(−deep·max(T − 1, 0))
  k: 1.9,
  deep: 0.16,
  // 2판: 가장자리 진해짐(커피링). 반지름은 획 굵기와 무관한 종이 위 길이(page 단위)
  edgeRadius: 2.2,     // 4판: 1.6 → 2.2
  edge: 0,             // 4판: 두께 곱하기 방식 폐지(안쪽이 이미 최대라 안 보였음)
  // 4판: 고인 면 = 안쪽은 두께 포화(겹쳐도 끝없이 진해지지 않음), 테두리는 색으로 진하게
  satStart: 1.6,       // 이 두께부터 포화 시작
  satMax: 2.4,         // 포화 상한
  rimDark: 0.38,       // 4판 값(5판 셰이더는 안 씀)
  // 5판: 실측(참고 05) — 진하기는 두께가 아니라 '경계에 가까운 정도'를 따름(커피링)
  //   넓은 면 안쪽 = 밝음(빨강 R 200~235), 경계 안쪽 띠 = 진함(R 120~150, 폭 ≈ 가는 선 4~5배), 가는 선 = 그 중간(R 165~180)
  //   색: 펜 색 C 를 '진하기 1' 의 투과율로 보고 C^f (베르-람베르트). 흰 종이 위에서 f = 1 이면 정확히 C.
  rimR: 7,             // 경계 감지 반지름(굵기 배수) 7판: 2.5 → 7 (실물 띠 폭 ≈ 선폭 4~5배)
  // 24판: 커피링 · 안쪽 밝아짐을 **실제로 고인 만큼만** 적용한다(사용자: 굵기 16 획이 윤곽선 있는
  //   마커처럼 보인다). fIn · fRim 은 참고 05 의 넓은 붓 스와치에서 잰 값이라, 그냥 굵은 펜 획에
  //   그대로 걸면 진한 테두리 + 밝은 속이 되어 잉크가 아니라 윤곽선으로 읽힌다.
  //   고임도 pool01 = smoothstep(ringStart, ringFull, Tb0): 굵기 16 한 획 0.8 · 칠 1.05 · 웅덩이 2.0
  ringStart: 0.5,      // 이 고임부터 커피링이 보이기 시작
  ringFull: 1.9,       // 이 고임에서 참고 05 와 같은 세기
  fIn: 0.55,           // 넓은 면 안쪽 진하기
  fRim: 3,             // 면 경계 안쪽 띠 진하기 7판: 1.3 → 3 (실물 띠 R 120~150 맞춤)
  // 34c: **뭉친 쪽과 아닌 쪽이 구분이 안 된다**(사용자 2026-11-12). 재 보니 두께가 진하기에
  //   거의 영향을 못 주고 있었다 — f ∝ T^0.3 이라 두께가 0.5→2.4 로 5배 변해도 진하기는 1.6배다.
  //   실물에서 진하고 연한 구조는 무작위가 아니라 **잉크가 얼마나 있느냐**를 따라간다(셰이딩).
  //   노이즈를 키우는 것으로는 절대 안 나온다 — 노이즈는 눈금을 바꿔도 노이즈다.
  // 36판: 발색 테스트 사진을 재현하려면 **고인 자리에 색이 뭉쳐야** 한다(사용자 2026-11-13:
  //   "꼭 펜이라는 말에 갇히지 말고"). 여태 염료 진하기가 국소 두께 T 만 봤는데, T 는 획 안에서
  //   속도로만 정해져 1.3배밖에 안 변한다 — 그래서 농담이 안 나왔다(실측 변동 0.035, 실물 0.19~0.28).
  //   고임 장 Tb0 는 같은 그림에서 **얇은 끝 0.2 ~ 겹친 자리 2.0 으로 10배** 변한다.
  //   물이 모인 자리에 염료도 모인다 — 진하기를 Tb0 에 물리면 **이어진 넓은 영역**이 진해지고
  //   얇은 자락이 연해진다. 노이즈로는 절대 안 나오던 구조다(노이즈는 눈금을 바꿔도 노이즈다).
  // 49판: 되살린다. 11시 되돌리기 때 36판이 같이 날아가 **농담의 유일한 출처가 값 노이즈**였고,
  //   그래서 모양이 노이즈로 보였다(사용자 2026-11-13 "잉크 농담 모양 노이즈 같은 거").
  dyePool: 0.6,        // 진하기가 고임 장을 따르는 정도(0 = 35판까지, 국소 두께만)
  dyeRef: 1,           // 고임 장의 기준값 — 이 값에서 배수 1 (칠 1.05 · 웅덩이 2.0 · 가는 획 0.2)
  tGamma: 0.3,         // 두께(느림 · 겹침)가 진하기에 주는 영향 f × (T/1)^γ  34c: 0.3 → 0.9
  alphaK: 2.3,         // (6판부터 미사용 — 염료는 알파 혼합이 아니라 투과로 그림. 잉크 잔량에서 재검토)
  // 6판: 채도 유지 — 실측(참고 05 전체 픽셀): 잉크가 밝아져도 G·B 는 0~20 에 고정(채도 1.0 유지),
  //   R 만 114→240 으로 변함. 즉 흡수 대역은 얇아져도 계속 흡수한다.
  //   채널별 밀도 D_c = −ln(C_c^2.2) 를 역산하고, f 의 반응을 채널별로 f^(1/(1+satK·D_c)) 로.
  //   D 가 큰(어두운) 채널일수록 얇아져도 안 밝아짐. satK = 0 이면 5판(C^f)과 동일.
  satK: 2,
  // 35판: **진한 잉크에 농담이 안 생기던 것**의 범인. 6판의 채도 유지 항
  //   fc = max(f, f^(1/(1+satK·dens))) 은 dens 가 크면 지수가 0 에 붙어 f 를 통째로 삼킨다.
  //   남색 #23266B 은 R채널 dens 4.45 → 지수 0.101 → 두께가 20% 얇아져도(f=0.8) fc=0.98 이다.
  //   분홍 #F3CADB 은 dens 0.107 → 지수 0.824 → 거의 그대로 전달된다.
  //   실측이 정확히 그랬다(같은 변경에 분홍 변동 0.115 vs 남색 0.033, 3.5배).
  //   두께 · 종이 · 커피링이 전부 이 항 뒤에서 곱해지니 뭘 바꿔도 안 보였다.
  //   → **밝기는 f 를 따라가고 색조만 채널별로 지키게** 가른다. 얇은 쪽(f<1)에만 건다 —
  //   두꺼운 쪽은 6판대로 f 그대로(겹쳐도 끝없이 진해지지 않는 것은 T 포화가 맡는다).
  satThin: 0,          // 얇은 쪽에서 밝기가 f 를 따라가는 정도(0 = 6판 그대로, 1 = 채도 유지 끔)
  // 8판: 넓은 면 안 농담 흐름(실물 04 · 05 의 얼룩). 결정적 값 노이즈로 f 변조, 넓은 면에만.
  // 27판: 얼룩 한 덩이가 너무 컸다. 하네스를 1단위 = 1.75px 로 보며 고른 값인데,
  //   실기기는 1단위 = 3.2px 라 같은 무늬가 1.8배로 확대돼 보인다. 굵기 16 획(화면 51px)에
  //   얼룩 한 덩이(58px)가 통째로 올라앉아, 부드러운 명암 덩어리만 남고 세부가 사라졌다
  //   — 사용자가 "화질이 낮다" 고 한 것이 이것이다(끄고 렌더하면 또렷해지는 것으로 확인).
  //   덩이를 잘게 쪼개고 세기를 낮춘다.
  // 34판: 농담을 **종이 장 하나**로 합친다(사용자 2026-11-12: "어디서든 종이가 있는 것처럼").
  //   여태 같은 것을 두 번 흉내 냈다 — flow(넓은 면 전용) 와 thinFlow(가는 획 전용). 28판이
  //   thinFlow 를 따로 만든 것 자체가 "종이는 어디에나 있다" 는 사실의 증거였다.
  //   종이는 획의 성질이 아니라 **페이지의 성질**이라 가는 획 · 굵은 획 · 고인 곳을 가리지 않는다.
  //   실측(상대 농담, 획 폭을 1 로 본 눈금에서의 표준편차):
  //     실물 유리펜 선화 0.194(1/20) → 0.083(1/2)   · 실물 확대 0.280 → 0.276
  //     우리(고치기 전) 0.037 → 0.023               — 3~7배 모자랐다
  //   눈금이 커질수록 변동이 **줄어드는** 것이 매끈한 만년필 종이의 특징이다(선화 지수 ≈ -0.37).
  //   거친 수채 종이면 반대로 커진다 — 그쪽을 가정하지 않는다(사용자 2026-11-12).
  //   그래서 옥타브를 **잔결이 세고 큰 얼룩이 약하도록** 쌓는다(배 늘 때마다 약 0.75배).
  //   34c: 종이 장은 **잔결**만 맡는다. 진하고 연한 구조의 본체는 두께(tGamma)가 만든다 —
  //   종이로 그걸 대신하려 하면 그냥 노이즈로 보인다(사용자 2026-11-12 "그냥 더 넓은 노이즈잖아").
  //   36b: **끈다**(사용자 2026-11-13 "구름결 너무 노이즈 같아진 건 언제 고쳐져?").
  //   34판의 종이 장은 농담을 만들려고 넣었는데, 재 보니 변동을 0.033 → 0.035 로 **0.002** 올릴 뿐
  //   눈에는 노이즈로만 보였다. 농담은 36판(고임 장이 진하기를 주도)이 맡는다 — 그쪽은 같은 측정에서
  //   0.035 → 0.052 로 실제로 움직였다. 제 몫을 못 하는 항은 둔다고 공짜가 아니다.
  //   식은 남겨 둔다(0 이면 꺼진다) — 종이를 다시 다룰 때 눈금부터 다시 잡는다.
  paperAmp: 0,         // 종이가 잉크 농도를 흔드는 폭 36b: 0.18 → 0 (끔)
  //   34b: 0.35 은 **너무 잘았다**(사용자 2026-11-12 "지금은 너무 노이즈인데"). 0.35 page 단위는
  //   화면에서 약 0.7 기기 픽셀이라 픽셀 격자보다 잔 구조다 — 종이결이 아니라 필름 그레인이 된다.
  //   섬유 눈금(약 25µm = 0.1 page 단위)은 실제로 **눈이 분해하지 못하고 평균으로** 본다. 그리는
  //   것은 분해되는 눈금(기기 픽셀 두세 개 이상)이어야 하고, 그보다 잔 것은 평균에 녹는 게 맞다.
  //   측정했던 '획 폭의 1/20'(굵기 26 기준 약 1.3 단위)이 그 눈금이다 — 거기서부터 쌓는다.
  paperScale: 1.8,     // 가장 잔 결의 크기(page 단위) 34b: 0.35 → 1.8
  flowAmp: 0.25,       // 변조 폭(fc 곱 비율) 27판: 0.8 → 0.5 · 49판: 0.5 → 0.25
                       //   49판: 농담의 **본체**는 고임 장(dyePool)이 맡는다 — 노이즈는 그 위의 잔결이다.
                       //   0.35 로 올려 봤지만 사용자가 **약한 쪽**을 골랐다(2026-11-13
                       //   "농담 약해진 채가 좋았어"). 세게 걸면 흩어 놔도 무늬가 다시 도드라진다.
  flowScale: 11,       // 얼룩 한 덩이 크기(page px) 27판: 18 → 7 → 11 (사용자: 구름결 좀 더 넓게)
  // 28판: **가는 획이 밋밋하다**(사용자 2026-11-10). 재 보니 가는 획에는 농담(flow)도 운모 막(veil)도
  //   아예 닿지 않는다 — 둘 다 `1 − smoothstep(0.25, 0.6, x)` 로 **넓은 면에만** 걸려 있고,
  //   가는 획은 x ≈ 0.8 이라 0 이 된다(세기를 5배로 올려 렌더해도 변화 없음을 확인).
  //   남는 건 테(lineRim) 하나인데 그건 획 전체를 고르게 덮어 "다른 색 펜" 처럼 보인다(22판 메모와 같은 증상).
  //   그래서 가는 획 전용 항을 둔다. 근거(얇은 획 조사.md, FPN LizEF EF 닙 현미경 25~33):
  //     ① 구간마다 편차가 크다 — 같은 잉크 같은 획인데 30 은 자글자글, 32 는 거의 없다
  //     ② 쉰은 **띠가 아니라 획 전체의 색 변화**로, 구간마다 떴다 안 떴다 한다(26 vs 27)
  //     ③ 획 끝(잉크가 고인 곳)이 조금 더 진하다(27)
  //   → 가는 획에서는 농담 · 테를 **잘게 · 들쭉날쭉하게** 넣는다. 덩이 크기는 획 굵기에 맞춰 줄인다.
  // 44판: 얼룩은 **글리터와 무관하게** 있어야 한다(사용자 2026-11-13). 28c 가 고임으로 묶어 둔
  //   탓에 글리터를 끄면(막도 같이 꺼진다) 얼룩까지 옅어졌다. 고임 의존을 거의 푼다.
  flowFloor: 0.8,      // 안 고인 곳에 남기는 얼룩 비율 44판: 0.3 -> 0.8
  // 44판: 얼룩진 자리는 **잉크가 얇다** — 색만 옅어질 게 아니라 종이가 비쳐야 한다(사용자).
  //   얼룩의 밝은 쪽에서만 덮임을 연다. 어두운 쪽은 그대로 둬야 획이 빈약해지지 않는다.
  flowClear: 0.28,     // 얼룩의 밝은 쪽이 덮임을 여는 정도(0 = 불투명)
  thinFlow: 1.2,       // 가는 획의 농담 폭(0 = 끔). 가는 선은 속이 없어(2px 중 대부분이 안티에일리어스)
                       //   넓은 면의 flowAmp 0.5 로는 눈에 안 띈다 — 실측 비교로 올렸다
  thinFlowScale: 0.42, // 가는 획 농담 덩이 크기(flowScale 배수)
  // (28판) 가는 획의 **테 끊김** — 농담과 달리 이건 쉰 쪽 값이라 종이 장과 별개다
  thinPatch: 0.85,     // 가는 획 테가 끊기는 정도(넓은 면 sheenPatch 0.42 보다 훨씬 들쭉날쭉)
  thinPatchScale: 0.3, // 가는 획 테 끊김 크기(sheenWScale 배수)
  // 9판: 테(쉰) — 고임 장 등고선. 14판: 기하 재설계 — 사용자 '테가 윤곽처럼 안 뜨네' 피드백.
  //   테 = ① 덮임 윤곽 띠: 블러 장 알파의 0.5 등고선(영역 외곽선에 정확히 붙음. 가는 선은
  //      블러 후 알파 피크 ~0.16 이라 0.5 등고선이 아예 없음 → 자동 배제)
  //      × 고임량 게이트: 윤곽 위 고임(실측: 가는 선 0.17~0.31 / 칠 가장자리 0.5 / 웅덩이 가장자리 1.0)
  //   ② 깊은 웅덩이 내부 패치(참고 20 · 21 · 24 — 강한 쉰은 고인 몸통도 덮음)
  sheenAmp: 0.9,       // 테 세기(0 = 끔). 앱에서는 "테 켜기 + 세기" 설정
  sheenRimA: 0.65,     // 윤곽 띠 중심(블러 장 알파) — 0.5 = 외곽선 자체(절반이 잉크 밖), 0.65 = 약 4px 안쪽
  sheenRimBand: 0.12,  // 윤곽 띠 폭(알파 단위)
  sheenGate0: 0.3,     // 고임 게이트 시작(이하 테 없음) — 가는 선 · 글자(알파 피크 <0.4)는 띠 자체가 없음
  sheenGate1: 0.8,          // 고임 게이트 끝(이상 테 최대) — 칠 윤곽 ~0.7(은은 ~0.5), 웅덩이 윤곽 ~1.3(최대) 41판: 1.1 → 0.8 — 이 값이 높아 **끝과 겹친 자리에만** 테가 남았다(사용자 2026-11-13) 41판: 1.1 -> 0.8 — 이 값이 높아 **끝과 겹친 자리에만** 테가 남았다
  sheenInT: 1.7,       // 내부 패치 문턱(고임 장 두께) — 웅덩이 내부 2.0, 칠 내부 1.05
  sheenInAmp: 0.4,     // 내부 패치 세기(0 = 윤곽 띠만)
  // 19판: 가는 획의 테. 넓은 면은 블러 덮임 Ab 가 1 까지 가지만 가는 선은 0.16 이 최대라 등고선이 아예 없었다.
  //   선 하나의 블러 덮임 최대값(abLine, 23판부터 굵기에 따라 달라진다)으로 정규화한 An 에
  //   같은 등고선을 걸면 가는 획의 **양 가장자리**에 테가 돈다(실물 20: 강한 쉰 잉크는 글씨에도 테가 돈다).
  //   넓은 면에서는 꺼서(Ab 로 게이트) 기존 윤곽 테와 겹치지 않게 한다.
  sheenEdge: 0.9,      // 가는 획의 테 세기(0 = 끔) 20판: 0.55 는 티가 안 났다
  // 28판: 테는 잉크 **위에 앉는 반사**지 잉크를 갈아치우는 게 아니다. 상한이 없어서 필압으로
  //   얇아진 구간이 테 색으로 통째로 덮여 **회색으로 끊겨 보였다**(사용자 2026-11-10).
  //   원인은 An = Ab / abLine 이 획의 **기준 굵기**로 재는 값이라, 가늘어진 구간은 "전부 가장자리"로
  //   읽혀 lineRim 이 1.0 까지 올라간 것이다(sh 0.81 → 잉크색이 거의 사라짐).
  //   실물도 정면에서는 획 전체가 색이 **조금 변할** 뿐이다(참고 26 vs 27). 그래서 상한을 둔다.
  // 30판: 테 100 이 약하다(사용자 2026-11-12). 28판이 상한 0.45 를 건 이유는 **가는 획 전용 테**
  //   (lineRim)가 필압으로 얇아진 구간에서 1.0 까지 올라 회색으로 끊겨 보였기 때문이다. 그 상한을
  //   lineRim 에만 남기고, 넓은 면의 윤곽 띠 · 웅덩이 패치는 더 올라갈 수 있게 상한을 가른다.
  sheenMax: 0.72,      // 테가 잉크를 덮을 수 있는 최대 비율(전체)
  // 31판: 테를 세게(30판) 하니 **뿌옇게 · 화질 낮아** 보였다(사용자 2026-11-12). 범인은 띠가 아니라
  //   획 전체를 고르게 덮는 몫(lineRim)이다 — 그게 커지면 잉크가 뿌연 막으로 덮인 것처럼 읽힌다.
  //   근거: 쉰은 마르면서 **표면에 모인 염료가 결정화**해 생기는 표면 반사다(염료가 종이에 스며들지
  //   않고 표면에 남아야 한다). 결정막은 '일정 두께를 넘으면 뜬다' 는 **문턱**을 가지므로 경계가
  //   또렷하고 군데군데 끊긴다 — 고르게 깔린 부드러운 그라데이션이 아니다.
  //   → 띠 몫은 그대로 세게 두고, ① 획 전체 몫의 상한을 더 내리고 ② 띠 옆면을 가파르게 한다.
  sheenThinMax: 0.42,         // 그 중 **가는 획 전용 테** 몫의 상한 31판: 0.45 → 0.3 41판: 0.3 → 0.42 (31판이 과하게 깎아 테가 거의 사라졌다) 41판: 0.3 -> 0.42 (31판이 과하게 깎아 테가 거의 사라졌다)
  sheenSharp: 2.3,          // 띠 옆면의 가파르기(클수록 또렷) 31판: 1.7 → 3.2 41판: 3.2 → 2.3 (너무 가늘어 안 보였다) 41판: 3.2 -> 2.3 (너무 가늘어 안 보였다)
  //   상한만으로는 모자랐다(실측: 굵기 24 획의 얇아진 끝 채도 0.42 → 0.14, 상한 0.45 를 걸어도 0.14).
  //   근본 원인은 '가는 획의 테'가 **픽셀의 굵기**로 켜진다는 것이다 — 굵은 펜이 잠깐 얇아진 자리도
  //   가는 획으로 읽힌다. 하지만 그건 여전히 굵은 펜이고, 그 획의 테는 윤곽 띠(rim)가 맡아야 한다.
  //   그래서 **펜 굵기**로 켠다: 아래 굵기까지만 가는 획 테를 쓰고 위로 갈수록 끈다.
  thinRimW0: 5,        // 이 굵기 이하 = 가는 획 테 최대
  thinRimW1: 12,       // 이 굵기 이상 = 가는 획 테 없음(윤곽 띠만)

  // 22판: 테가 "화면 그래픽처럼" 보이던 것(사용자). 실물(참고 02 · 14 · 24)과 견주면 우리 띠는
  //   ① 윤곽을 **빠짐없이** 두르고 ② 폭이 고르고 ③ 중간 스케일(1.5~5px) 변동이 실물의 2~8배라
  //   에어브러시 테두리처럼 보였다. 실물은 접촉선이 고르게 고정되지 않아 **군데군데 끊기고 몰린다**.
  sheenPatch: 0.42,    // 띠가 끊기는 정도(0 = 빠짐없이 두름, 1 = 많이 끊김)
  sheenGrain: 0.4,     // 띠 안의 결(고운 알갱이) — 매끈한 그라데이션을 깬다
  // 23판: 고임 장 블러를 **굵기 배수가 아니라 절대 길이**로(사용자: "획 하나가 1이든 16이든 테가
  //   안 뜨고 같은 모양인 건 이상하다"). 22판까지는 sigma = poolBlur × 굵기라 기하가 자기닮음이 되어
  //   굵기를 바꿔도 Ab · Tu · 테 · 글리터가 전부 같았다. 실제로 잉크가 퍼지는 거리는 잉크 · 종이의
  //   성질이지 닙 굵기가 아니다. 절대 길이로 두면 굵은 획일수록 고이고(Ab 커짐) 테 · 글리터가 살아난다.
  //   선 하나의 블러 덮임 최대값 abLine = erf(굵기 / (2·poolSpread·√2)):
  //     굵기 1 → 0.07 · 2.5 → 0.16 · 6 → 0.37 · 10 → 0.58 · 16 → 0.81
  // 32판: 획 **밖**으로 번진 연한 고리(사용자 2026-11-12, 글입다 스와치 넷 — 진한 본체 → 어두운
  //   테 → 그 바깥의 연한 띠). 근거 둘이 겹친다:
  //   ① 헤일로 — 방울이 다공성 기판에서 마르면 본체 둘레에 **젖은 고리**가 생기고, 금방 자라기를
  //      멈춰 보통 밀리미터 이하 폭에 머문다(흡수-증발 결합 연구 2025).
  //   ② 염료 전선 지연 — 염료는 섬유에 붙어 **용매보다 느리게** 간다(코팅지 · 비코팅지 모두에서
  //      염료 전선이 비히클 전선보다 뒤처지는 것이 측정됐다). 그래서 바깥 고리는 **염료가 적다 = 연하다**.
  //   그리는 쪽(glassPooled.js)이 획 바깥만 잘라 잉크색을 낮은 알파로 번지게 올린다. 필터는 건드리지
  //   않는다 — 고임 장 · 테 · 커피링이 흔들리지 않게.
  // 33판: **잉크와 종이의 경계가 그래픽 같다**(사용자 2026-11-12). 재 보니 원인이 분명했다 —
  //   실물은 경계의 **위치 자체가 들쭉날쭉**한데 우리는 매끈한 벡터 곡선에 안티에일리어스만 걸려 있다.
  //   실측(참고 자료/크롭 01 vs 우리 렌더, 같은 방식으로 잰 값):
  //     실물  획폭 35.6px · raggedness 1.39px = 획 폭의 **3.9%**
  //     우리  획폭 21.8px · raggedness 0.04px = 획 폭의 **0.2%**  (약 20배 차이)
  //   raggedness 는 인쇄 품질 표준 지표다(ISO/IEC 13660 → 현행 24790): 실제 경계 위치와 맞춘
  //   직선의 차이를 여러 곳에서 재 표준편차를 낸 값. 짝이 되는 지표가 blurriness(잉크와 맨 종이
  //   사이 전이 띠의 폭)인데, 우리는 blurriness 는 있고(안티에일리어스) raggedness 가 0 이다.
  //   왜 들쭉날쭉한가: 접촉선이 종이 섬유 · 기공에 **걸려 멈춘다**(pinning). 무질서한 바닥 위의
  //   접촉선은 '무작위 매질 속 탄성선' 으로 다뤄지고 **자기닮음(self-affine)** 거칠기를 갖는다 —
  //   거칠기 지수 ζ 는 실험이 0.5 안팎, 선형 탄성 이론이 1/3(한 고리) · 0.388(수치),
  //   비선형 항을 넣은 FRG 가 0.45. 그래서 노이즈를 ζ ≈ 0.45 로 옥타브를 쌓는다.
  haloSpread: 2.5,     // 번짐 반지름(page 단위, 블러 시그마). 밀리미터 이하 = 대략 2~5 단위
  haloAlpha: 0.22,     // 번진 고리의 최대 진하기(염료가 적어 본체보다 훨씬 연하다)
  poolSpread: 6.25,    // 고임 장 블러 시그마(페이지 단위) — 22판까지의 굵기 2.5 와 같은 값
  // 16판: 염료 두께 평탄화 — 액체는 주변 평균 높이로 퍼진다. 도장 격자(와플) · 지그재그 빗살 제거.
  //   평탄 두께 = 블러 두께 / 블러 덮임 = 주변 평균 두께(가는 선은 값이 거의 안 변해 영향 없음)
  poolMix: 0.55,       // 평탄 두께를 섞는 비율(0 = 16판 이전)
  //   21판: 덮임 메움은 **뺐다**(사용자 2026-11-09: "내가 그린 획 영역 넘어가는 보정은 넣으면 안 된다").
  //   16판에는 촘촘한 지그재그의 빗살을 메우려고 블러 덮임으로 획 밖까지 잉크를 채우는 항이 있었다.
  //   두께 평탄화(poolMix)는 그대로 둔다 — 그건 획 안에서 두께만 고르게 할 뿐 넓이를 늘리지 않는다.
  // 10판: 테 물결 — 등고선 판정 장에 노이즈를 더해 실물 02 처럼 테가 불규칙하게 굽이치게
  sheenWiggle: 0.45,   // Tb 에 더하는 노이즈 폭(T 단위) 10판 채택
  sheenWScale: 9,      // 물결 한 굽이 크기(page px)
  // 11판: 글리터 쉬머 — 셀 해시 입자(실측 6-1: 지름 1~2px 은빛 점, 1000px²당 19~26개,
  //   고인 곳 1.3~1.7배, 밝기 +15~65L 꼬리 긴 분포, 순백 없음, 잉크보다 회색 쪽, 구름 얼룩)
  // 15판: 글리터 2층 — 사용자 '글리터가 굉장히 어색해' 피드백 + 참고 22 · 23 실측.
  //   실물 쉬머는 이산 점이 아니라 ① 고인 면 전체를 덮는 연속 은빛 막(운모 결) 위에
  //   ② 가끔 또렷한 점. 11판은 ②만 있어서 소금 뿌린 것처럼 보였다.
  //   실측(세밀 std / 채도): 실물02 18.5 / 0.28, 실물22 16.7 / 0.12 vs 14판 31.5 / 0.62
  // 18판: 쉬머 입자 색을 물리식으로 — 운모판 + TiO2 코팅의 2빔 간섭(Airy).
  //   코팅 두께 d 하나가 색을 정한다: 은 40~60 · 금 60~80 · 빨강 80~100 · 파랑 100~130 · 초록 130~160 nm
  //   (계산한 색 순서가 안료 업계 두께표와 일치 — 잉크 물리 수식 조사.md 5절 + 안료 TDS)
  glFilm: 55,          // TiO2 코팅 두께(nm). 55 = 은빛(참고 02 · 22 의 실물 은색 쉬머)
  glFilmTilt: 30,      // 입자 기울기 산포 최대 각(도) — 판마다 색이 조금씩 다른 이유(각도 색 변이)
  // 30c: 막이 테와 **같은 색**이 되자(30b) 둘이 한 덩어리로 뭉쳐 보였다 — 막을 더 비치게 하고,
  //   테가 뜬 자리는 아예 비켜 준다(사용자 2026-11-12: "구름결은 좀 더 투명하게 해야 테랑 분리된다").
  //   36c: 구름결이 **통째로 사라졌다**(사용자 2026-11-13). 셋이 곱해진 탓이다 —
  //   30판에서 테를 세게(sheenMax 0.45→0.72), 30c 에서 막을 0.45→0.26 으로 낮추고 테가 뜬 자리는
  //   완전히 비키게(glVeilAvoid 1.0) 했다. 0.26/0.45 x (1-sh) 면 sh 0.6 에서 막이 23% 만 남는다.
  //   분리는 **비키는 정도**로 충분하고, 세기까지 같이 내릴 일은 아니었다.
  glVeil: 0.204,  // 운모 막 세기(고인 곳 최대 혼합 비율) 47판: 0.34 -> 0.204 (지금의 0.6배, 사용자 2026-11-13)
  glVeilAvoid: 0.6,    // 테가 뜬 자리에서 막을 비키는 정도 36c: 1 → 0.6 (분리는 되되 지워지진 않게)
  // 46판: 막이 채도를 너무 끌어 **탁해졌다**(사용자 2026-11-13). 43판에서 막을 잉크의 공용
  //   구름에 묶으면서 잉크 몸통을 덮게 됐는데, 회색화가 0.8 이면 색이 통째로 빠진다.
  glVeilDesat: 0.45,   // 막의 회색화(막은 잉크 채도를 덮는다) 46판: 0.8 -> 0.45
  glVeilLift: 0.3,     // 막의 밝힘량
  glVeilScale: 12,     // 막 결 크기(page px) 27판: 20 → 8 → 12 (사용자: 구름결 좀 더 넓게)
  // 40판: 구름결을 **획 방향**으로 늘인다(사용자 2026-11-13).
  //   근거 ① 물리: 진주광택의 세기는 판상 입자가 표면과 얼마나 나란한가에 달렸고, 흐름에 끌려
  //   방향이 흐트러지면 **밝고 어두운 줄무늬**가 생긴다(도료 업계의 flow line · flake disorientation).
  //   근거 ② 기법: 흐름 방향으로 노이즈를 뭉개는 것이 LIC(Cabral & Leedom 1993)이고,
  //   Kyprianidis & Kang(2011)은 **구조 텐서에서 뽑은 흐름장**으로 그것을 이끈다. 방향이 없는
  //   평평한 자리는 되돌릴 기준이 필요하다고 못 박아 두었다 — 여기선 고정 축으로 되돌린다.
  //   진짜 LIC 는 픽셀마다 유선을 적분해야 해서 비싸다. 표준 근사인 **좌표 늘이기**를 쓴다.
  //   방향은 공짜로 얻는다: 고임 장의 기울기는 획을 **가로지르는** 쪽이라 90도 돌리면 획을 따라간다.
  glVeilAlign: 1,      // 결이 획 방향을 따르는 정도(0 = 39판까지처럼 고정 축)
  glVeilLong: 1.7,     // 획을 따라 늘이는 정도(클수록 길게)
  glVeilCross: 0.65,   // 획을 가로질러 늘이는 정도(작을수록 가늘게)
  glAmp: 1,            // 글리터 양(0 = 끔). 앱 "글리터 켜기 + 양"
  // 28판: 직접 고른 글리터 색이 거의 안 보이던 것(사용자 2026-11-10). 입자색 식은
  //   mix(잉크, 휘도×운모색, glDesat) + boost×운모색 인데, 운모 간섭색은 가장 밝은 채널이 1 이라
  //   입자가 잉크보다 밝게 뜬다. 팔레트에서 고른 보통 색(예 #4A6FB5)을 그대로 넣으면
  //   입자 휘도 0.376 < 잉크 0.388 — **잉크보다 어두워** 반짝이로 안 읽힌다(실측).
  //   → 고른 색은 **반사 색조**로 바꿔 쓴다: 색조는 그대로 두고 가장 밝은 채널을 1 로 올린 뒤
  //     흰 쪽으로 조금 끌어올린다(실물 입자는 채도 0.26 으로 꽤 옅다 — 참고 6-1).
  //   ③ 끌어올리는 양은 **모자란 만큼만**이다. 고정 비율로 흰 쪽에 섞으면 이미 옅은 색
  //      (예 연분홍)이 흰색이 돼 "고른 색이 안 먹는다"가 된다 — 목표 휘도까지만 올린다.
  glPickLum: 0.7,      // 고른 글리터 색이 가져야 할 최소 휘도(잉크보다 확실히 밝아야 반짝이로 읽힌다)
  // 15판 배율 환산 실측(참고 02, 사진 선폭 6px = 우리 4.4 screen px 기준):
  //   입자 반지름 0.59~0.93 screen px · 밀도 58.6/1000 screen px² — 즉 "작고 많이".
  //   14판까지는 반지름 0.7~1.4 에 밀도 부족 → 점이 크고 성겨 '소금 뿌린' 느낌이었다.
  glCell: 1.7,         // 입자 셀 크기(page px) — S=1.75 에서 2.98 screen px
  // 28판: 가는 획에 입자가 거의 안 떨어진다. 입자는 셀 하나에 많아야 하나인데 셀(1.7)이 획보다 넓으면
  //   그 하나가 획 밖에 떨어져 버려, 면적당 밀도가 아니라 **셀 폭에 눌려** 수가 준다.
  //   실물은 잉크 안 운모 농도가 같으니 가는 획이라고 면적당 수가 줄 이유가 없다(얇은 획 조사.md:
  //   획 폭 한 줄 길이당 15~30개 — 오히려 촘촘하다). → 셀을 획 굵기 아래로 내린다.
  glCellW: 1.0,        // 가는 획의 셀 크기 = min(glCell, max(glCellMin, 굵기 × 이 값))
  glCellMin: 0.6,      // 셀 크기 바닥(page px) — 더 내리면 화면 픽셀보다 촘촘해진다
  glP: 0.52,           // 셀당 입자 확률 → 1000·P/cell² = 58.5/1000 screen px² (실물 58.6)
  // 20판: 가는 획과 고인 면의 입자 크기를 나눈다. 두 레퍼런스가 배율이 달라 서로 다른 값을 가리킨다 —
  //   참고 02(유리펜 고인 면, 보통 배율): 점 지름 ≈ 선폭의 1/4 → 지금 값이 맞다.
  //   참고 25 · 28 · 29(EF 닙 현미경, 얇은 획 조사.md): 입자가 **획 폭의 1~4%** 로 훨씬 작고 많다.
  //   → 고인 곳은 크게, 얇게 쓴 획은 작게(Tu 로 보간). 얇은 획에서는 개별 점이 아니라 반짝임 질감이 된다.
  glRThin: 0.08,       // 얇은 획의 입자 반지름(페이지 단위) — 하네스 화면 0.14px ÷ 1.75
  glThinP: 3.2,        // 얇은 획의 입자 수 배수(작아진 만큼 많이 — 현미경 사진은 훨씬 조밀하다)
  glRMin: 0.29,        // 입자 반지름 최소(페이지 단위) — 하네스 화면 0.5px ÷ 1.75
  glRMax: 0.54,        //            최대          — 하네스 화면 0.95px ÷ 1.75
  glBMin: 0.22,        // 밝기 끌어올림 최소(0~1 L) 18판 스윕: 세밀 std 17.9 (실물 18.5)
  glBMax: 0.62,        //            최대          — 검출 밀도 54.1 (실물 58.6)
  glTail: 3,           // 밝기 꼬리 지수(클수록 소수만 밝음)
  glDesat: 0.85,       // 입자의 회색화(0 = 잉크색, 1 = 완전 무채색) — 실물 점 채도 0.26
  glCloud: 0.5,        // 구름 얼룩이 확률에 주는 변조(±비율)
  glCloudScale: 14,
  // 41판에서 글리터 셀도 획 방향으로 늘여 봤지만 **되돌렸다**(사용자 2026-11-13 "글리터 모양은
  //   돌려놔"). 구름결(운모 막)만 방향을 따른다 — glVeilAlign.
  // 29판: 글리터가 넓은 면에 **고르게** 깔리던 것(사용자 2026-11-12). 27a 에서 입자를 필터 밖으로
  //   빼면서 11판의 '밀도 ∝ 고임 장' 이 같이 빠져 있었다 — 입자 셰이더에는 고임 장이 없다.
  //   근거: 커피링(Deegan 1997)은 분자가 아니라 **입자**에 걸리는 효과다. 접촉선이 고정된 채
  //   마르면 가장자리 증발을 채우려는 모세관 흐름이 입자를 바깥으로 쓸어 모으고, 운모 플레이크처럼
  //   크고 무거운 알갱이일수록 더 세게 쏠린다. 다만 Marangoni 흐름 · 입자 모양 때문에 안쪽이
  //   완전히 비지는 않으므로 바닥값을 남긴다.
  //   고임 장은 필터 **안**의 값이라 입자 쪽으로 들고 올 수 없다 → 기하로 근사한다:
  //   경계 안쪽 띠에 더, 안쪽에 덜. 가는 획은 접촉선이 고정되지 않아 띠가 없으므로(20판: 입자가
  //   가운데로 모인다) abLine(획 하나의 블러 덮임 최대값)으로 게이트해 굵은 획에만 건다.
  //   실물 판정(참고 01 · 03 · 04, 유리 딥펜): **가는 선에는 글리터가 거의 없고 고인 덩어리는
  //   통째로** 금속색이 된다(03 의 둥근 덩이는 거의 전부 구릿빛, 04 의 가는 선들은 맨 빨강).
  //   즉 경계 띠가 아니라 **두께 그 자체**가 글리터를 부르고 대비가 매우 크다.
  //   입자는 필터 **밖**에서 그려야 한다 — 획을 종이에 얹는 Darken 이 잉크보다 밝은 입자를 먹어
  //   덧칠한 자리의 글리터가 오히려 사라진다(29판 첫 시도에서 확인, 사용자 2026-11-12).
  //   그래서 고임을 셰이더가 아니라 **도장 두께로 만든 마스크**로 넘긴다(그리는 쪽 glassPooled.js).
  //   기준값(도장 두께 t): 빠름 0.75 · 느림 1.55 · 끝 고임은 그 위
  glPoolFloor: 0.08,   // 안 고인 곳에 남는 비율 — 실물은 '거의 없음' 이다(사용자 2026-11-12)
  glPoolGain: 3,       // 웅덩이에서의 배수
  glPoolLo: 0.6,       // 이 고임부터 늘기 시작
  glPoolHi: 2,         // 이 고임에서 최대
  // 49판: 고임(= 손놀림 속도)**만으로** 정하면 같은 손놀림을 되풀이할 때 **같은 무늬**가 나온다.
  //   발색 기록 속지의 병 여섯 개를 같은 식으로 칠하니 여섯 다 같은 자리가 비어 찍어낸 것처럼
  //   보였다(사용자 2026-11-13 "공병 세로 부분만 글리터 없는 게 6개 다 똑같아서 패턴 찍어낸 것 같고").
  //   실물에서 운모가 어디 가라앉는지는 손놀림이 아니라 **그 자리의 운**이다 — 종이에 붙은
  //   노이즈로 고임을 흔들어, 같은 손놀림이라도 자리가 다르면 다른 무늬가 되게 한다.
  glPoolVary: 0.5,     // 고임을 흔드는 폭(0 = 손놀림만, 0.5 = ±50%)
  glPoolVaryScale: 26, // 흔드는 덩이 크기(page 단위) — 덩이 노이즈(30.8)와 어긋나게 둔다
  // 29c: 실물 스와치(글입다 Glistening — 피노키오 · 행인 · 드라큘라 · 검은 튤립)는 글리터가
  //   **덩어리째** 몰린다. 몰린 곳은 거의 포화, 아닌 곳은 맨 잉크다(사용자 2026-11-12:
  //   "확 몰리는 곳은 확 몰리고 없는 곳은 진짜 거의 없다"). 지금 구름 변조(±50%)로는 그 대비가
  //   절대 안 나온다 — 노이즈를 **가파르게** 밟아 거의 이진으로 만든다.
  //   물리: 플레이크는 염료와 달리 확산으로 고르게 퍼지지 않는다(Pe 가 1e4 배 크다). 건조 중
  //   계면에서 뗏목처럼 뭉치고 Marangoni 재순환이 그 덩이를 쓸어 모아 얼룩진 증착이 된다.
  glPatchLo: 0.06,     // 덩이 밖에 남는 비율
  glPatchHi: 2.6,      // 덩이 안의 배수
  glPatchA: 0.40,      // 노이즈가 이 값부터 덩이로
  glPatchB: 0.60,      //            이 값에서 최대 (A~B 가 좁을수록 경계가 또렷)
  //   42판: 덩이가 **구름결보다 잘아서** 결을 잘게 썰어 놓았다(사용자 2026-11-13:
  //   "구름결 딱 글리터 껐을 때가 예쁜데 글리터 켜면 너무 잘게 뭉쳐보여").
  //   같은 자리를 두 무늬가 다른 눈금으로 덮으면 서로를 깨뜨린다 — 결과 같은 눈금으로 맞춘다.
  glPatchScale: 2.2,   // 덩이 크기(glCloudScale 배수)
  // 12판: 반짝임 세기 — 0 = 실물 같은 은은한 쉬머(기본). 올리면 ① 입자 소수가 흰색 가까이
  //   ② 성긴 십자 글린트. 왜도를 올려 "반짝인다"로 읽히게(정지 반짝임 조사 · Motoyoshi 2007).
  sparkAmp: 0,         // 반짝임 세기(0~1). 앱 슬라이더
  glintCell: 26,       // 글린트 셀 크기(page px) — 셀당 최대 1개
  glintLen: 6,         // 십자 팔 길이(page px)
  // 13판: 마르는 과정(사용자 요청 2026-11-09). dry 0 = 방금 씀 → 1 = 다 마름.
  //   픽셀별 마름 = dry 에서 고임 장(Tb)만큼 지연(가는 선 먼저, 웅덩이 나중 — 건조 조사).
  //   테 · 커피링 띠는 마르면서 나타나고(쉰은 마른 뒤에만 — 조사), 젖은 동안은 약간 진하고 번들거림(추정).
  dry: 1,              // 건조 진행(0~1). 애니메이션은 이 값만 올리면 됨
  dryLag: 0.45,        // 두꺼운 곳이 늦게 마르는 정도
  wetDark: 0.18,       // 젖었을 때 추가 진하기(fc 배율)
  wetGloss: 0.10,      // 젖었을 때 번들거림(저주파 밝은 띠)
}

// 18판: 간섭 안료(운모 + TiO2 코팅) 색. d = 코팅 두께(nm), cosT = 보는 각도의 cos.
//   박막 2빔 간섭(Airy): R(λ) = (r1² + r2² + 2r1r2cosδ) / (1 + r1²r2² + 2r1r2cosδ), δ = 4π·n·d·cosθ_f / λ
//   r1 = (n_out−n_f)/(n_out+n_f), r2 = (n_f−n_sub)/(n_f+n_sub). n: TiO2 2.6 · 운모 1.58 · 잉크 1.33
//   스펙트럼 R(λ)을 CIE 1931 등색함수(Wyman 2013 가우시안 근사)로 적분 → sRGB.
//   쉰(17판)과 달리 쉬머는 **간섭**이다: 각도를 바꾸면 색이 변한다(파장 쪽으로 청색 편이).
const cieG = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t) }
const cieCmf = l => [
  1.056 * cieG(l, 599.8, 37.9, 31.0) + 0.362 * cieG(l, 442.0, 16.0, 26.7) - 0.065 * cieG(l, 501.1, 20.4, 26.2),
  0.821 * cieG(l, 568.8, 46.9, 40.5) + 0.286 * cieG(l, 530.9, 16.3, 31.1),
  1.217 * cieG(l, 437.0, 11.8, 36.0) + 0.681 * cieG(l, 459.0, 26.0, 13.8)]
export function micaColor(d = GLASS_INK.glFilm, cosT = 1, nF = 2.6, nSub = 1.58, nOut = 1.33) {
  const r1 = (nOut - nF) / (nOut + nF), r2 = (nF - nSub) / (nF + nSub), rr = r1 * r2
  const sinF = Math.sqrt(Math.max(0, 1 - cosT * cosT)) * nOut / nF        // 스넬 — 막 안 각도
  const cosF = Math.sqrt(Math.max(0, 1 - sinF * sinF))
  let X = 0, Y = 0, Z = 0, Xw = 0, Yw = 0, Zw = 0
  for (let l = 380; l <= 730; l += 5) {
    const c = Math.cos(4 * Math.PI * nF * d * cosF / l)
    const R = (r1 * r1 + r2 * r2 + 2 * rr * c) / (1 + rr * rr + 2 * rr * c)
    const [x, y, z] = cieCmf(l)
    X += R * x; Y += R * y; Z += R * z; Xw += x; Yw += y; Zw += z
  }
  const xn = X / Xw, yn = Y / Yw, zn = Z / Zw                              // 백색 정규화(평평한 R → 무채색)
  const lin = [3.2406 * xn - 1.5372 * yn - 0.4986 * zn,
              -0.9689 * xn + 1.8758 * yn + 0.0415 * zn,
               0.0557 * xn - 0.2040 * yn + 1.0570 * zn]
  const mx = Math.max(...lin, 1e-6)
  return lin.map(v => Math.pow(Math.max(0, v) / mx, 1 / 2.2))
}

// 17판: 테 자동색을 물리식으로 — 쉰은 염료 표면의 '선택 반사'(박막 간섭 아님. 잉크 물리 수식 조사.md 4절).
//   복소 굴절률 ñ = n + ik 의 수직입사 프레넬: R = ((n−1)² + k²) / ((n+1)² + k²)
//   소광계수 k 는 그 채널의 흡수에 비례하므로 k_c = kScale · D_c (D_c = 이미 쓰는 채널별 광학밀도).
//   → 흡수가 큰(어두운) 채널이 가장 많이 반사 → 보색 금속광이 **자동으로** 나온다.
//   (16판까지는 HSL 보색 회전이라는 임시방편이었다. 남색 → 구리금, 빨강 → 초록으로 실물과 같은 방향.)
export function sheenAutoColor(ink, { n = 1.55, kScale = 0.25, lightness = 0.62 } = {}) {
  const n1 = (n - 1) ** 2, n2 = (n + 1) ** 2
  const R = inkDensity(ink).map(d => { const k = kScale * d, k2 = k * k; return (n1 + k2) / (n2 + k2) })
  const mx = Math.max(...R, 1e-6)
  return R.map(r => Math.pow(Math.min(1, r / mx * lightness), 1 / 2.2))  // 선형 반사율 → sRGB
}

// 선 하나를 가우시안 블러했을 때의 덮임 최대값 = erf(굵기 / (2·poolSpread·√2)).
// 23판부터 블러가 절대 길이라 **굵기에 따라 달라진다**(굵기 1 → 0.07 · 2.5 → 0.16 · 16 → 0.81).
// 가는 획의 "획 가운데 ↔ 가장자리"를 재는 기준(An = Ab / abLine)으로 쓴다.
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y }
export const abLineOf = (width, spread = GLASS_INK.poolSpread) => erf(width / (2 * spread * Math.SQRT2))

// 쓰는 중에 쓰는 가벼운 셰이더: 마스크 · 고임 장 없이 잉크색 + 운모 막 + 입자만.
// 손을 뗀 뒤 그림과 완전히 같지는 않지만(테 · 커피링 없음) 쓰는 동안 밋밋하지 않게 한다.
// 오프스크린 표면을 전혀 만들지 않는다 — 프레임마다 만들면 기기에서 죽는다(glassStroke.js 주석).
export const GLASS_LIVE_SKSL = `
uniform float3 ink;
uniform float3 micaA;
uniform float aa;
uniform float glAmp;
uniform float glCellPx;
uniform float glP;
uniform float glRMin;
uniform float glRMax;
uniform float glBMin;
uniform float glBMax;
uniform float glTail;
uniform float glDesat;
uniform float glCloud;
uniform float glCloudScl;
uniform float glVeil;
uniform float glVeilDesat;
uniform float glVeilLift;
uniform float glVeilScl;
float vhash(float2 q) { return fract(sin(dot(q, float2(127.1, 311.7))) * 43758.5453); }
float vnoise(float2 q) {
  float2 i = floor(q), f = fract(q);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + float2(1, 0)), u.x),
             mix(vhash(i + float2(0, 1)), vhash(i + float2(1, 1)), u.x), u.y);
}
half4 main(float2 p) {
  float3 col = ink;
  if (glAmp > 0.001) {
    float2 q0 = float2(p.x / (glVeilScl * 2.0), p.y / (glVeilScl * 0.7));
    float2 wrp = float2(vnoise(q0 * 0.8), vnoise(q0 * 0.8 + 5.7)) - 0.5;
    float2 q = q0 + wrp * 1.6;
    float vn = vnoise(q) * 0.5 + vnoise(q * 2.1 + 3.3) * 0.3 + vnoise(q * 4.7 + 7.1) * 0.2;
    float veil = glVeil * glAmp * 0.22 * (0.12 + 0.88 * smoothstep(0.28, 0.72, vn));
    float lum0 = dot(col, float3(0.299, 0.587, 0.114));
    col = mix(col, clamp(mix(col, float3(lum0) * micaA, glVeilDesat) + glVeilLift * micaA, 0.0, 1.0), veil);
    float2 cell = floor(p / glCellPx);
    float u0 = vhash(cell * 1.013 + 0.37);
    float gdens = glP * glAmp * 0.3 * (1.0 + glCloud * (vnoise(p / glCloudScl) - 0.5) * 2.0);
    if (u0 < gdens) {
      float u1 = vhash(cell * 2.117 + 1.11), u2 = vhash(cell * 3.721 + 2.53);
      float u3 = vhash(cell * 5.313 + 4.19), u4 = vhash(cell * 7.919 + 5.87);
      float2 pos = (cell + 0.18 + 0.64 * float2(u1, u2)) * glCellPx;
      float r = mix(glRMin, glRMax, u3);
      float w = 1.0 - smoothstep(r - aa, r + aa, length(p - pos));
      float boost = mix(glBMin, glBMax, pow(u4, glTail));
      float lum = dot(col, float3(0.299, 0.587, 0.114));
      col = mix(col, clamp(mix(col, float3(lum) * micaA, glDesat) + boost * micaA, 0.0, 1.0), w);
    }
  }
  return half4(half3(col), 1.0);
}
`

// ── 앱 전용: 표면 없이 그리기 위한 CPU 고임 계산 ──────────────────────────────
// 지금까지는 마스크를 가우시안 블러해서 "고임 장"을 만들었지만, 그 오프스크린 표면이
// 이 기기에서 librnskia 를 죽인다. 블러가 하던 일은 결국 **표본마다 이웃이 얼마나 겹쳤나**
// 를 재는 것이므로, 표본을 이미 CPU 에서 만드는 김에 여기서 직접 센다(격자 해시로 O(n)).
//   pool_i = Σ_j  t_j · (간격 × 굵기) · G2(거리)   ← 가우시안 블러의 이산합과 같다
//   cov_i  = 같은 식에서 t_j = 1
// 곧은 선 하나면 pool ≈ t · 굵기 / (σ√2π) 로, 블러로 재던 값(굵기 2.5 · σ 6.25 에서 0.16·t)과 같다.
export function glassPool(dabs, width, spread = GLASS_INK.poolSpread, step = Math.max(0.02, width * GLASS_INK.pathSpacing)) {
  const n = dabs.length, pool = new Float32Array(n), cov = new Float32Array(n)
  if (!n) return { pool, cov }
  const area = step * width
  const k = 1 / (2 * Math.PI * spread * spread), inv2s2 = 1 / (2 * spread * spread)
  const reach = spread * 2.5, cell = reach
  // 획을 따라 이어진 이웃(|i−j| ≤ gap)은 곧은 선이면 늘 같은 값이므로 식으로 바로 구한다.
  // 격자로는 **멀리 떨어진 부분이 되돌아와 겹친 것**(스크리블 · 덧칠)만 센다 → 보통 획은 O(n).
  const gap = Math.ceil(reach / step)
  const line = width / (spread * Math.sqrt(2 * Math.PI))
  const grid = new Map(), key = (cx, cy) => cx * 73856093 ^ cy * 19349663
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(dabs[i].x / cell), cy = Math.floor(dabs[i].y / cell), h = key(cx, cy)
    let list = grid.get(h); if (!list) grid.set(h, list = []); list.push(i)
  }
  for (let i = 0; i < n; i++) {
    const a = dabs[i], cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell)
    let sp = a.t * line, sc = line
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const list = grid.get(key(gx, gy)); if (!list) continue
      for (const j of list) {
        if (j > i - gap && j < i + gap) continue        // 이어진 이웃은 위 식에 이미 들어 있다
        const b = dabs[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy
        if (d2 > reach * reach) continue
        const g = k * Math.exp(-d2 * inv2s2) * area
        sp += b.t * g; sc += g
      }
    }
    pool[i] = sp; cov[i] = sc
  }
  return { pool, cov }
}

// 테 띠: 표면 없이 그리므로 **띠의 폭**으로 고임을 표현한다(기하가 거리를 들고 있게 한다).
//   고임이 없으면 폭 0 → 몸통이 전부 덮어 테가 안 보이고, 고일수록 띠가 넓어진다.
//   가는 획도 가장자리에 얇은 띠는 둔다(참고 20 · 25: 강한 쉰은 글씨에도 돈다).
const smooth01 = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }
export function glassBand(poolValue, width, sheenEdge = GLASS_INK.sheenEdge) {
  const P = GLASS_INK
  const pooled = Math.min(width * 0.38, P.poolSpread * 0.3)
    * smooth01((poolValue - P.sheenGate0) / (P.sheenGate1 - P.sheenGate0))
  const thin = width * 0.17 * Math.min(1, sheenEdge)
  return Math.min(width * 0.42, Math.max(thin, pooled))
}

// 글리터 "맞춤" 색: 펜 색에서 자동 계산한 테 색과 가장 가까운 운모 코팅 두께를 고른다.
// 테(염료 표면의 프레넬 반사)와 글리터(입자 박막 간섭)는 원래 다른 물리라 색이 따로 놀 수 있는데,
// 맞춤을 고르면 둘이 같은 계열로 맞는다. 코팅 두께는 실제 펄 안료의 값 범위를 쓴다.
export const MICA_FILMS = [55, 72, 88, 103, 125, 145]
export function micaAutoFilm(rgb) {
  const target = sheenAutoColor(rgb)
  const chroma = c => { const sum = c[0] + c[1] + c[2] || 1e-6; return [c[0] / sum, c[1] / sum] }
  const [tx, ty] = chroma(target)
  let best = MICA_FILMS[0], bestD = Infinity
  for (const nm of MICA_FILMS) {
    const [x, y] = chroma(micaColor(nm, 1))
    const d = (x - tx) ** 2 + (y - ty) ** 2
    if (d < bestD) { bestD = d; best = nm }
  }
  return best
}
// 직접 고른 글리터 색 → **반사 색조**. 운모 간섭색(micaColor)은 가장 밝은 채널이 1 이라 입자가
// 잉크보다 밝게 뜨지만, 팔레트에서 고른 보통 색을 그대로 쓰면 입자가 잉크만큼 어두워 반짝이로
// 안 읽힌다(실측: 고른 파랑 0.376 < 잉크 0.388). 색조는 그대로 두고 밝기만 올린다.
export function glitterTint(rgb, target = GLASS_INK.glPickLum) {
  const mx = Math.max(rgb[0], rgb[1], rgb[2], 1e-6)
  const t = rgb.map(c => c / mx)                                  // 색조 유지: 가장 밝은 채널을 1 로
  const lum = 0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2]
  if (lum >= target) return t                                     // 이미 밝으면 고른 색 그대로
  const w = (target - lum) / (1 - lum)                            // 모자란 만큼만 흰 쪽으로
  return t.map(c => c + (1 - c) * w)
}
// 글리터 색 결정: 직접 고른 색 > 고른 코팅 두께 > 맞춤(테에 맞춘 두께). **늘 0~1 배열을 돌려준다** —
// 예전에는 고른 색일 때만 '#RRGGBB' 문자열이 나와 SVG 그림(미리보기 · 웹 · 썸네일 · 내보내기)이
// rgb(NaN, NaN, NaN) 을 칠했다(2026-11-10).
export function glitterColorOf(rgb, { glitterColor, film } = {}) {
  if (glitterColor) return glitterTint(typeof glitterColor === 'string'
    ? [1, 3, 5].map(i => parseInt(glitterColor.slice(i, i + 2), 16) / 255) : glitterColor)
  return micaColor(film ?? micaAutoFilm(rgb), 1)
}

// 테 페인트용 셰이더: 띠를 고르게 칠하면 화면 그래픽처럼 보인다 → 구간마다 끊고(patch) 결을 넣는다(grain).
export const GLASS_RIM_SKSL = `
uniform float3 rimCol;
uniform float patch;
uniform float grain;
uniform float scl;
float vhash(float2 q) {
  float3 p3 = fract(float3(mod(q.x, 256.0), mod(q.y, 256.0), mod(q.x, 256.0)) * float3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(float2 q) {
  float2 i = floor(q), f = fract(q);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + float2(1, 0)), u.x),
             mix(vhash(i + float2(0, 1)), vhash(i + float2(1, 1)), u.x), u.y);
}
half4 main(float2 p) {
  float n = vnoise(p / scl) * 0.62 + vnoise(p / (scl * 0.32) + 13.7) * 0.38;
  float a = mix(1.0, smoothstep(0.30, 0.74, n), patch);
  a *= mix(1.0, 0.45 + 0.55 * vnoise(p * 0.75 + 31.1), grain);
  return half4(half3(rimCol * a), half(a));
}
`

// 글리터 입자만 따로 — **전체 해상도**로 획 위에 덧그린다.
// 고임 필터 층은 이 기기에서 절반 해상도로 계산된다(가장자리가 네모로 끊기고 입자가 사각형이 된다).
// 그래서 눈에 띄는 고주파 — 가장자리와 입자 — 는 필터 밖에서 그리고, 필터 안에는 저주파만 남긴다.
// 색은 하네스와 같은 식이다: col = mix(잉크, 회색화한 잉크 + 밝힘 × 운모색, w) — 알파 w 로 덧칠하면 같다.
export const GLASS_SPARK_SKSL = `
uniform float3 base;   // 잉크색(휘도 계산용)
uniform float3 mica;   // 운모 간섭색
uniform float cell;
uniform float dens;
uniform float rmin;
uniform float rmax;
uniform float bmin;
uniform float bmax;
uniform float tail;
uniform float desat;
uniform float cloud;
uniform float cloudScl;
uniform float aa;
uniform float patchLo;   // 29c: 덩이 밖 / 안의 밀도 배수
uniform float patchHi;
uniform float patchA;    // 노이즈를 밟는 구간(좁을수록 경계가 또렷)
uniform float patchB;
uniform float patchScl;
// 49판: 입자 격자 · 뭉침 덩이를 **페이지**에 붙이는 밀어주기(잉크 셰이더의 noiseOrg 와 같은 뜻).
//   없으면 획마다 제 상자가 원점이라 어디에 긋든 같은 자리에 같은 입자가 찍힌다.
uniform float2 noiseOrg;
float vhash(float2 q) {
  float3 p3 = fract(float3(mod(q.x, 256.0), mod(q.y, 256.0), mod(q.x, 256.0)) * float3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(float2 q) {
  float2 i = floor(q), f = fract(q);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + float2(1, 0)), u.x),
             mix(vhash(i + float2(0, 1)), vhash(i + float2(1, 1)), u.x), u.y);
}
half4 main(float2 p) {
  p += noiseOrg;   // 획 자기 좌표 → 페이지 좌표
  float lum = dot(base, float3(0.299, 0.587, 0.114));
  // 29c: 실물은 글리터가 **덩어리째** 몰린다 — 몰린 곳은 거의 포화, 아닌 곳은 맨 잉크다.
  //   ±50% 선형 변조로는 그 대비가 안 나온다. 두 옥타브 노이즈를 가파르게 밟아 거의 이진으로.
  // 49판: 뭉침이 **노이즈 모양**으로 보이던 것(사용자 2026-11-13 "글리터 뭉침 더 자연스럽게").
  //   값 노이즈는 정수 격자에서 떠서 같은 크기 동그란 덩이가 줄 맞춰 깔린다 — 밟아서 이진으로
  //   만들수록 그 동그람이 **윤곽으로** 드러난다. 좌표를 한 번 휘고(domain warp) 둘째 옥타브의
  //   축을 돌려, 덩이가 늘어지고 갈라지게 한다(농담에 쓴 것과 같은 처방).
  float2 pq = p / patchScl;
  pq += (float2(vnoise(pq * 0.5 + 5.3), vnoise(pq * 0.5 + 9.1)) - 0.5) * 1.5;
  float pn = vnoise(pq) * 0.62
           + vnoise(float2(pq.x * 0.8 - pq.y * 0.6, pq.x * 0.6 + pq.y * 0.8) * 2.63 + 13.1) * 0.38;
  float cl = mix(patchLo, patchHi, smoothstep(patchA, patchB, pn))
           * (1.0 + cloud * (vnoise(p / cloudScl) - 0.5) * 2.0);   // 덩이 안에서도 결이 산다
  float3 acc = float3(0.0);
  float aw = 0.0;
  // 25판: 한 겹이면 격자가 보인다 → 간격비가 무리수인 두 겹을 겹쳐 격자를 깬다
  // 49판: 간격비만 다르면 **각 겹의 격자는 그대로 남는다**. 뭉친 자리는 두 겹이 다 포화라
  //   그 격자가 바둑판으로 드러났다(확대 사진에서 줄 맞춘 점열). 겹마다 **축을 돌려** 둔다 —
  //   돌려도 거리는 그대로라 알갱이는 여전히 동그랗고, 두 격자가 무리수 각으로 어긋나 겹치지 않는다.
  for (int layer = 0; layer < 2; layer++) {
    float lay = float(layer);
    float cs = cell * mix(1.0, 1.37, lay);
    // 31.7도 — 격자 주기와 공약수가 없는 각
    float2 pl = lay > 0.5 ? float2(p.x * 0.851 - p.y * 0.526, p.x * 0.526 + p.y * 0.851) : p;
    float2 cc = floor(pl / cs);
    float2 c = cc + lay * 7.31;
    if (vhash(c * 1.013 + 0.37) >= 0.5 * dens * cl) continue;
    float u1 = vhash(c * 2.117 + 1.11), u2 = vhash(c * 3.721 + 2.53);
    float u3 = vhash(c * 5.313 + 4.19), u4 = vhash(c * 7.919 + 5.87);
    float2 pos = (cc + 0.18 + 0.64 * float2(u1, u2)) * cs;
    float r = mix(rmin, rmax, u3);
    float w = 1.0 - smoothstep(r - aa, r + aa, length(pl - pos));
    if (w <= 0.0) continue;
    float boost = mix(bmin, bmax, pow(u4, tail));
    acc += clamp(mix(base, float3(lum) * mica, desat) + boost * mica, 0.0, 1.0) * w;
    aw += w;
  }
  if (aw <= 0.0) return half4(0.0);
  float a = min(1.0, aw);
  return half4(half3(acc / aw * a), half(a));
}
`

// 펜 색(sRGB 0~1) → 채널별 광학 밀도(감마 2.2 선형 기준). 셰이더 uniform 으로 전달.
export function inkDensity(ink) {
  return ink.map(c => -Math.log(Math.max(Math.pow(c, 2.2), 1e-4)))
}

// Catmull-Rom 으로 점을 이어 고른 간격 표본을 만든다. time 도 보간.
export function sampleCurve(points, step) {
  const out = []
  if (points.length === 1) return [{ ...points[0], d: 0 }]
  let carry = 0, d = 0
  const quarter = step / 4
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)]
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const n = Math.max(2, Math.ceil(seg / quarter))
    // 안쪽 고리는 **내는 간격의 네 배로 잘게** 돈다(버리는 표본이 네 개 중 셋이다). 그래서 여기서
    // 표본마다 클로저(cr)와 객체(q)를 만들면 긴 획에서 그게 프레임을 먹는다 — 도장 1500개짜리 획에서
    // 도장 찍기만 16ms 였다(실측 2026-11-10, 실기). 카트멀-롬 계수는 **구간마다 한 번만** 구하고,
    // 버릴 표본은 숫자로만 다루다가 **남길 때만** 객체를 만든다. 식은 그대로라 값은 한 자리도 안 바뀐다.
    const ax = -p0.x + p2.x, bx = 2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x, cx = -p0.x + 3 * p1.x - 3 * p2.x + p3.x
    const ay = -p0.y + p2.y, by = 2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y, cy = -p0.y + 3 * p1.y - 3 * p2.y + p3.y
    const t1 = p1.time, dt = p2.time - p1.time
    const r1 = p1.pressure ?? 1, dr = (p2.pressure ?? 1) - r1
    const x1 = p1.x, y1 = p1.y
    let px = x1, py = y1
    for (let j = i === 0 ? 0 : 1; j <= n; j++) {
      const u = j / n, u2 = u * u, u3 = u2 * u
      const x = 0.5 * (2 * x1 + ax * u + bx * u2 + cx * u3)
      const y = 0.5 * (2 * y1 + ay * u + by * u2 + cy * u3)
      const L = Math.hypot(x - px, y - py)
      px = x; py = y
      if (out.length === 0) { out.push({ x, y, time: t1 + dt * u, pressure: r1 + dr * u, d: 0 }); continue }
      carry += L; d += L
      if (carry >= step) { out.push({ x, y, time: t1 + dt * u, pressure: r1 + dr * u, d }); carry = 0 }
    }
  }
  const last = points[points.length - 1], tail = out[out.length - 1]
  const extra = Math.hypot(last.x - tail.x, last.y - tail.y)
  if (extra > step * 0.2) out.push({ x: last.x, y: last.y, time: last.time, pressure: last.pressure ?? 1, d: tail.d + extra })
  return out
}

// 창 평균(박스 필터). 그대로 더하면 O(n x r) 이라 도장 1500개 - 창 13칸이면 한 획에 2만 번을 더한다.
// 누적합을 한 번 만들어 두면 칸마다 뺄셈 한 번이다(O(n)). 같은 창의 평균이라 결과는 같다.
const smooth = (arr, r) => {
  const n = arr.length
  if (!n) return []
  const pre = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i]
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const j0 = i - r < 0 ? 0 : i - r, j1 = i + r > n - 1 ? n - 1 : i + r
    out[i] = (pre[j1 + 1] - pre[j0]) / (j1 - j0 + 1)
  }
  return out
}

// 획 하나 → 도장 목록 { x, y, r, t }
export function glassDabs(points, width, P = GLASS_INK) {
  const step = Math.max(0.25, width * P.spacing)
  const s = sampleCurve(points, step)
  const total = s.length ? s[s.length - 1].d : 0
  const rawV = s.map((q, i) => {
    const a = s[Math.max(0, i - 2)], b = s[Math.min(s.length - 1, i + 2)]
    const dt = Math.max(1, b.time - a.time)
    return (b.d - a.d) / dt
  })
  const v = smooth(rawV, Math.max(1, Math.round(width / step)))
  const L = P.poolLen * width
  // 필압 · 기울기(점의 pressure 에 들어 있다)로 굵기를 조절한다 — 볼펜과 같은 폭.
  // 28판: 힘 센서는 잘게 떨린다. 그 떨림을 그대로 반지름에 넣으면 외곽선이 표본마다 들락거려
  //   **구슬을 꿴 것처럼 울퉁불퉁**해진다(사용자 2026-11-10 "필압 주는 부분이 끊긴다").
  //   27판까지는 굵기를 6단계로 뭉개서 이게 안 보였는데, 그 대신 단계마다 계단이 생겼다(28i).
  //   닙은 제 크기보다 빠르게 굵어졌다 얇아졌다 할 수 없다 → **닙 크기만큼의 창**으로 고른다.
  const rawR = s.map(q => (width / 2) * (q.pressure ?? 1))
  const rr = smooth(rawR, Math.max(1, Math.round(P.rSmooth * width / step)))
  return s.map((q, i) => {
    const speedT = P.tFast + (P.tSlow - P.tFast) * Math.exp(-v[i] / P.v0)
    const fromStart = q.d, fromEnd = total - q.d
    const pool = P.poolStart * Math.exp(-((fromStart / L) ** 2)) + P.poolEnd * Math.exp(-((fromEnd / L) ** 2))
    const t = speedT + pool
    const r = rr[i] * (1 + P.poolWiden * Math.min(1, pool))
    return { x: q.x, y: q.y, r, t }
  })
}

// 마스크 → 색. uniform: ink(펜 색 0~1), k, deep, tMax
export const GLASS_INK_SKSL = `
uniform shader mask;
uniform shader pool;   // 마스크를 가우시안 블러한 고임 장(테 판정용)
uniform float2 org;    // 표면 상자의 페이지 좌표 원점
uniform float ppu;     // 페이지 1단위 = 몇 픽셀
uniform float aa;      // 입자 가장자리 부드럽게(페이지 단위 = 약 0.5px 화면)
uniform float3 ink;
uniform float3 dens;   // 채널별 광학 밀도(inkDensity)
uniform float satK;
uniform float satThin;    // 채도 유지 세기(0 = C^f 와 동일)
uniform float tMax;
uniform float rad;     // 경계 감지 반지름(화면 px)
uniform float ringStart;
uniform float ringFull;
uniform float fIn;
uniform float fRim;
uniform float tGamma;
uniform float dyePool;
uniform float dyeRef;
uniform float alphaK;
uniform float satStart;
uniform float satMax;
uniform float paperAmp;
uniform float paperScl;  // 화면 px
uniform float flowAmp;
uniform float flowScl;  // 화면 px
uniform float flowFloor;
uniform float flowClear;  // 안 고인 곳에 남기는 얼룩 비율
uniform float thinFlow;
uniform float thinFlowScl;   // flowScl 배수
uniform float thinPatch;
uniform float thinPatchScl;  // sheenWScl 배수
uniform float3 sheenCol;
// 30b: 운모 막(구름결)의 색. 테를 켰으면 **테 색**, 껐으면 운모 간섭색(micaA)을 받는다
//   — 넓은 면에서 구름결과 테가 따로 놀던 것을 하나로 묶는다(사용자 2026-11-12).
uniform float3 veilCol;
uniform float sheenAmp;
uniform float sheenRimA;
uniform float sheenRimBand;
uniform float sheenGate0;
uniform float sheenGate1;
uniform float sheenInT;
uniform float sheenInAmp;
uniform float sheenEdge;
uniform float sheenMax;
uniform float sheenThinMax;
uniform float sheenSharp;
uniform float sheenPatch;
uniform float sheenGrain;
uniform float abLine;   // 선 하나의 블러 덮임 최대값(정규화 기준)
uniform float poolMix;
uniform float sheenWiggle;
uniform float sheenWScl;  // 화면 px
uniform float3 micaA;   // 정면으로 누운 판의 간섭색
uniform float3 micaB;   // 조금 기운 판
uniform float3 micaC;   // 많이 기운 판
uniform float glVeil;
uniform float glVeilAvoid;
uniform float glVeilDesat;
uniform float glVeilLift;
uniform float glVeilScl;
uniform float glVeilAlign;
uniform float glVeilLong;
uniform float glVeilCross;  // 화면 px
uniform float glAmp;
uniform float veilAmp;    // 운모 막(구름결)의 양 — **입자와 따로**. 앱은 입자를 필터 밖에서
                          //   그리느라 glAmp = 0 을 넣는데, 그러면 막까지 같이 꺼져 버렸다(27판 회귀)
uniform float glCellPx;   // 화면 px
uniform float glP;
uniform float glRThin;
uniform float glThinP;
uniform float glRMin;
uniform float glRMax;     // 화면 px
uniform float glBMin;
uniform float glBMax;
uniform float glTail;
uniform float glDesat;
uniform float glCloud;
uniform float glCloudScl; // 화면 px
uniform float sparkAmp;
uniform float glintCellPx;
uniform float glintLenPx;
uniform float dry;
uniform float dryLag;
uniform float wetDark;
uniform float wetGloss;
// 49판: 무늬(농담 · 운모 막 · 테 물결 · 글리터)를 **페이지**에 붙이기 위한 밀어주기.
//   여태 셰이더가 받는 p 는 **획 자기 좌표**였다(획마다 제 상자 왼쪽 위가 원점) — 그래서 어디에
//   긋든 같은 무늬가 나왔다. 떨어뜨려 그은 같은 손놀림 두 획의 글리터 2162개 중 2158개가
//   **같은 자리**였다(실기 측정 2026-11-13). 사용자: "6개 다 똑같아서 패턴 찍어낸 것 같다".
//   여기에 그 획이 놓인 페이지 자리를 넣어 더하면, 자리가 다르면 무늬도 다르고 겹쳐 그은 획끼리는
//   무늬가 맞는다(연필이 grainOrigin 으로 종이 이빨을 페이지에 붙이는 것과 같은 방식).
uniform float2 noiseOrg;
// 25판: sin 기반 해시는 좌표가 커지면 32비트 부동소수점에서 정밀도가 깨져 무늬가 뭉친다(모바일 GPU).
// sin 을 쓰지 않는 해시로 바꾸고, 좌표도 256 으로 접어 큰 값이 들어오지 않게 한다.
float vhash(float2 q) {
  float3 p3 = fract(float3(mod(q.x, 256.0), mod(q.y, 256.0), mod(q.x, 256.0)) * float3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(float2 q) {
  float2 i = floor(q), f = fract(q);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + float2(1, 0)), u.x),
             mix(vhash(i + float2(0, 1)), vhash(i + float2(1, 1)), u.x), u.y);
}
half4 main(float2 p) {
  float2 q = (p - org) * ppu;        // 자식 이미지는 픽셀 좌표로 읽는다
  half4 m = mask.eval(q);
  half4 pl = pool.eval(q);
  p += noiseOrg;        // 여기부터 p 는 **페이지 좌표**다(자식 이미지는 위에서 다 읽었다)
  float Tb0 = pl.g * tMax;
  float Ab = pl.a;       // 블러 장 알파(덮임) — 0.5 등고선 = 영역 외곽선

  // 19판: Tu = 잉크가 있는 자리의 두께(블러 장 기준). 실측 — 가는 획 0.14(빠름) · 0.17(보통) · 0.24(느림),
  //   칠 1.05, 웅덩이 2.0. Tb0(= 두께 × 덮임)는 넓은 면에서만 커져서 가는 획 판정에는 못 쓴다.
  float Tu = Tb0 / max(Ab, 0.02);
  float A = float(m.a);   // 21판: 그린 획 그대로 — 획 밖으로 번지게 하지 않는다(사용자 결정)
  if (A < 0.002) return half4(0);
  float T = (m.g / m.a) * tMax;
  // 16판: 액체 평탄화 — 넓은 면에서만 주변 평균 두께로 끌어당긴다(도장 격자 · 와플 제거).
  //   가는 선(Ab ~0.16)은 제외: 안 그러면 속도 → 두께 차이가 평균에 지워진다.
  T = mix(T, Tb0 / max(Ab, 0.02), poolMix * smoothstep(0.35, 0.75, Ab));
  if (T > satStart) { float r = satMax - satStart; T = satStart + r * (1.0 - exp(-(T - satStart) / r)); }
  // 16판: 경계까지의 거리 = 블러 덮임에서 바로(이전 18탭 링 샘플 대체 — 탭 0개, 손가락 윤곽이 하나로 합쳐짐)
  //   Ab 1.0 = 넓은 면 안쪽 → x 0 / Ab ~0.5 = 외곽선 / 가는 선 피크 ~0.16 → x ~0.84 (이전 의미와 동일)
  float x = clamp(1.0 - Ab, 0.0, 1.0);
  // 13판: 픽셀별 건조 진행 — 고임(Tb0)이 클수록 늦게 마름
  float dq = smoothstep(0.0, 1.0, dry * (1.0 + dryLag) - dryLag * (Tb0 / satMax));
  // 24판: 고인 만큼만 — 그냥 굵은 획은 거의 고르게, 진짜 웅덩이는 참고 05 처럼
  float pool01 = smoothstep(ringStart, ringFull, Tb0);
  float base = mix(1.0, mix(fIn, 1.0, smoothstep(0.0, 0.6, x)), pool01); // 안쪽 밝게(고였을 때만)
  float bump = smoothstep(0.08, 0.3, x) * (1.0 - smoothstep(0.45, 0.7, x)); // 경계 안쪽 띠
  bump *= dq * pool01;                               // 커피링은 마르면서 · 고인 만큼만
  // 36판: 국소 두께에 **고임 장**을 곱해 쓴다 — 물이 모인 자리에 염료도 모인다
  float Teff = T * pow(clamp(Tb0 / dyeRef, 0.15, 3.0), dyePool);
  float f = (base + (fRim - 1.0) * bump) * pow(max(Teff, 0.05), tGamma);
  // 6판: 베르-람베르트(감마 2.2 선형) + 채널별 f 반응 — 어두운 채널은 얇아져도 안 밝아짐(채도 유지)
  // f < 1(얇음): 채도 유지 쪽이 f 보다 큼 → 선택됨. f > 1(두꺼움): f 그대로 → 밝은 채널도 어두워짐.
  // 35판: 채널별 반응(진한 채널일수록 0 에 가깝다)을 **밝기와 색조로 가른다**
  float3 eSat = 1.0 / (1.0 + satK * dens);
  float3 fc = pow(float3(f), f < 1.0 ? mix(eSat, float3(1.0), satThin) : float3(1.0));
  // 34판: **종이 장** — 잉크를 붙드는 양이 자리마다 다르다. 8판(flow, 넓은 면)과 28판(thinFlow,
  //   가는 획)으로 나뉘어 있던 농담을 하나로 합쳤다. 종이는 획의 성질이 아니라 페이지의 성질이라
  //   가는 획 · 굵은 획 · 고인 곳을 **가리지 않는다**(사용자 2026-11-12).
  //   옥타브는 잔결이 세고 큰 얼룩이 약하도록 쌓는다(배 늘 때마다 0.75배) — 매끈한 만년필 종이의
  //   실측(눈금이 커질수록 변동이 줄어든다, 지수 ≈ -0.37)에 맞춘 것이다. 거친 종이면 반대가 된다.
  //   같은 좌표를 쓰므로 **겹쳐 그은 획끼리 잔결이 맞아** 종이로 읽힌다(획마다 다른 무늬면 노이즈다).
  float2 pp = p / paperScl;
  float paper = vnoise(pp) * 0.40
              + vnoise(pp * 0.5 + 11.7) * 0.30
              + vnoise(pp * 0.25 + 23.1) * 0.19
              + vnoise(pp * 0.125 + 41.3) * 0.11;
  fc *= 1.0 + paperAmp * (paper - 0.5) * 2.0 * dq;
  // 8판: 농담 흐름 — satK 압축을 피해 fc 에 직접 곱(넓은 면에만)
  // 49판: **모양이 노이즈로 보이던 것**(사용자 2026-11-13). 값 노이즈는 정수 격자에서 떠서
  //   같은 크기 동그란 덩이가 **줄을 맞춰** 깔린다 — 확대하면 격자가 그대로 보였다. 옥타브를
  //   두 개 쓰되 눈금 차가 2.3 배뿐이라 덩이 크기도 사실상 하나다. 실물 잉크의 농담은 종이 결
  //   (0.1mm)부터 젖은 면 전체(cm)까지 **눈금 없이 이어지는** 변동이라, 한 눈금에만 힘이 몰린
  //   무늬는 눈이 "무늬"로 읽는다.
  //   ① 좌표를 한 번 휘어(domain warp) 격자를 흩는다 ② 옥타브마다 축을 돌려 격자가 포개지지
  //   않게 한다 ③ 눈금 차를 2.3 → 3.1 로 벌린다. 노이즈 호출은 2 → 4 개.
  float2 fq = p / flowScl;
  fq += (float2(vnoise(fq * 0.45 + 3.1), vnoise(fq * 0.45 + 8.7)) - 0.5) * 1.7;
  float fl = vnoise(fq) * 0.68
           + vnoise(float2(fq.x * 0.8 - fq.y * 0.6, fq.x * 0.6 + fq.y * 0.8) * 3.1 + 19.3) * 0.32;
  // 28판: 얼룩을 **고인 만큼만** 건다(24판이 커피링에 쓴 규칙과 같다). 그냥 굵게 그은 획은
  //   고인 게 아니라 그냥 두꺼운 잉크라 고르게 마른다. 전까지는 고임과 무관하게 걸려서,
  //   글리터를 끄면 운모 막도 없어 **큰 명암 덩어리만 남아 수채 얼룩처럼** 보였다(사용자 2026-11-10).
  fc *= 1.0 + flowAmp * (fl - 0.5) * (1.0 - smoothstep(0.25, 0.6, x)) * dq
             * mix(flowFloor, 1.0, pool01);
  // 28판: 가는 획의 농담 — 위와 **반대 게이트**(넓은 면 0, 가는 획 1)에 덩이는 더 잘게.
  //   유리 닙은 홈에 담긴 잉크가 줄면서 선이 옅어졌다 진해졌다 한다(참고 27 · 30 vs 32).
  float thinScl = max(flowScl * thinFlowScl, 1.0);
  float flT = vnoise(p / thinScl + 17.3) * 0.65 + vnoise(p * 2.7 / thinScl + 41.9) * 0.35;
  fc *= 1.0 + thinFlow * (flT - 0.5) * smoothstep(0.25, 0.6, x) * dq;
  fc *= 1.0 + wetDark * (1.0 - dq);                  // 젖은 동안 약간 진함(추정)
  float3 col = pow(exp(-dens * fc), float3(1.0 / 2.2)); // 흰 종이 위 목표색 (f=1 이면 정확히 ink)
  // 19판: 테(쉰) 세기를 먼저 구해 둔다 — 테가 뜬 자리에서는 운모 막을 비킨다(표면 염료막이 판을 덮는다)
  float wig = sheenWiggle * (vnoise(p / sheenWScl) * 0.65 + vnoise(p * 2.7 / sheenWScl) * 0.35 - 0.5);
  float dA = (Ab + wig * 0.45 - sheenRimA) / sheenRimBand;
  // 22판: 띠를 군데군데 끊고(patch) 안에 결을 넣는다(grain). 프로파일도 가우시안보다 조금 날카롭게.
  float patchN = vnoise(p / (sheenWScl * 1.9) + 5.1) * 0.62 + vnoise(p / (sheenWScl * 0.6) + 13.7) * 0.38;
  float patch = mix(1.0, smoothstep(0.32, 0.72, patchN), sheenPatch);
  float grain = mix(1.0, 0.45 + 0.55 * vnoise(p * 0.75 + 31.1), sheenGrain);
  float rim = exp(-dA * dA * sheenSharp) * smoothstep(sheenGate0, sheenGate1, Tb0 + wig) * patch * grain;
  float An = min(1.0, Ab / max(abLine, 0.02));
  // 20판: 얇은 획의 테는 가장자리 띠가 아니라 획 전체의 색 변화다(참고 25 · 26, 얇은 획 조사.md).
  // 22판: 다만 **고르게 덮으면 그냥 다른 색 펜으로 쓴 것처럼 뿌옇다**(사용자). 실물은 구간마다 뜨고
  //   안 뜬다 — 띠와 같은 patch · grain 을 걸어 획을 따라 들쭉날쭉하게 한다.
  // 28판: 가는 획의 끊김은 **획 굵기에 맞게 잘아야** 한다. 넓은 면과 같은 크기(sheenWScl×1.9)로 두면
  //   가는 획 하나에 덩이 하나가 통째로 올라앉아 획 전체가 고르게 다른 색이 된다(사용자: 밋밋 · 22판 메모).
  float tpScl = max(sheenWScl * thinPatchScl, 1.0);
  float patchTn = vnoise(p / (tpScl * 1.9) + 5.1) * 0.62 + vnoise(p / (tpScl * 0.6) + 13.7) * 0.38;
  float patchThin = mix(1.0, smoothstep(0.30, 0.74, patchTn), thinPatch);
  float lineRim = (0.45 + 0.55 * (1.0 - smoothstep(0.2, 0.9, An + wig * 0.5)))
                * (1.0 - smoothstep(0.4, 0.8, Ab)) * smoothstep(0.08, 0.35, Tu) * sheenEdge
                * patchThin * grain;
  float inp = smoothstep(sheenInT, sheenInT + 0.4, Tb0)
            * smoothstep(0.35, 0.75, vnoise(p / (sheenWScl * 2.3) + 11.3));
  float sh = min(sheenMax, rim + sheenInAmp * inp + min(sheenThinMax, lineRim)) * sheenAmp * dq;
  // 15판 ①: 연속 운모 막 — 고인 면 전체를 덮는 은빛 결(참고 22 · 23). 점이 아니라 결로 읽혀야 한다.
  if (veilAmp > 0.001) {
    // 결 = 도메인 워프 노이즈(흐르는 구름 결) + 길게 늘인 좌표(쓸린 자국). 고임이 평평한 안쪽에서도 결이 산다.
    // 40판: 결의 방향을 **획을 따라** 잡는다. 고임 장의 기울기는 획을 가로지르는 쪽을 가리키므로
    //   90도 돌리면 획 방향이다(구조 텐서 대신 스칼라 장이라 기울기 하나로 충분하다).
    //   기울기가 약한 평평한 안쪽은 방향이 없으니 고정 축으로 되돌린다(LIC 선례가 말하는 안정화).
    float2 e1 = float2(1.5, 0.0), e2 = float2(0.0, 1.5);
    float gx = pool.eval(q + e1).g - pool.eval(q - e1).g;
    float gy = pool.eval(q + e2).g - pool.eval(q - e2).g;
    float gl = length(float2(gx, gy));
    float2 tdir = gl > 1e-6 ? float2(-gy, gx) / gl : float2(1.0, 0.0);
    // 49c: 결의 방향은 **축**이지 화살표가 아니다(θ 와 θ+180 도가 같은 뜻). 그런데 고임 기울기는
    //   획 중심선을 넘으면 부호가 뒤집혀 tdir 도 뒤집히고, 그대로 섞으면 ① 중심선에서 무늬가
    //   점대칭으로 뒤집혀 이음선이 생기고 ② 고정 축과 상쇄되어 **영벡터**가 될 수 있다.
    //   반평면으로 몰면(x >= 0) 세로 획에서 같은 일이 생기므로, **각도를 두 배로** 두고 섞는다 —
    //   2θ 는 θ 와 θ+180 도가 같은 값이라 부호가 아예 없다. 섞은 뒤 반으로 되돌린다
    //   (cosθ = √((1+C)/2), sinθ = S / 2cosθ). 코드리뷰 2026-11-13.
    float2 t2 = float2(tdir.x * tdir.x - tdir.y * tdir.y, 2.0 * tdir.x * tdir.y);
    float align = glVeilAlign * smoothstep(0.0, 0.003, gl);
    float2 m2 = mix(float2(1.0, 0.0), t2, align);
    float ml = length(m2);
    // 가로 축과 세로 축을 꼭 반씩 섞는 자리(align 0.5 · 세로 획)는 45 도와 135 도가 똑같이 맞아
    //   답이 없다 — 고정 축으로 되돌린다. 기울기가 거의 0 인 얇은 띠에서만 스친다.
    float2 n2 = ml > 1e-6 ? m2 / ml : float2(1.0, 0.0);
    float cx = sqrt(max(0.0, (1.0 + n2.x) * 0.5));
    float2 ax = cx > 1e-6 ? float2(cx, n2.y / (2.0 * cx)) : float2(0.0, 1.0);
    float2 ay = float2(-ax.y, ax.x);
    float2 pr = float2(dot(p, ax), dot(p, ay));
    float2 q0 = float2(pr.x / (glVeilScl * glVeilLong), pr.y / (glVeilScl * glVeilCross)) + float2(Tb0 * 0.5, Tb0 * 0.35);
    // 43판: 막도 **공용 구름**(염료 농담과 같은 fl)을 탄다. 제 노이즈를 따로 쓰면 같은 자리를
    //   서로 다른 무늬가 덮어 둘이 깨진다(사용자 2026-11-13: 글리터를 켜면 결이 잘게 뭉쳐 보였다).
    //   흐르는 느낌을 주던 도메인 워프는 남기되, **공용 구름 위에** 얹는다.
    float2 wrp = float2(vnoise(q0 * 0.8), vnoise(q0 * 0.8 + 5.7)) - 0.5;
    float2 q = q0 + wrp * 1.6;
    float vn = fl * 0.65 + (vnoise(q) * 0.5 + vnoise(q * 2.1 + 3.3) * 0.3 + vnoise(q * 4.7 + 7.1) * 0.2) * 0.35;
    float veil = glVeil * veilAmp * smoothstep(0.08, 0.6, Tu) * (0.4 + 0.6 * smoothstep(0.15, 1.0, Tb0))  // 가는 획은 옅게(19판), 넓은 면은 18판과 같게
               * (0.10 + 0.90 * smoothstep(0.38, 0.86, vn)) * mix(0.5, 1.0, dq) * (1.0 - glVeilAvoid * sh);
    float lum0 = dot(col, float3(0.299, 0.587, 0.114));
    // 45판: 밝힘을 **바탕이 어두운 만큼만** 준다(사용자 2026-11-13 "분홍에서 얼룩이 너무 형광이야").
    //   더하는 방식이라 이미 밝은 잉크 위에서는 값이 천장에 부딪혀 형광처럼 떴다. 43판에서 막을
    //   공용 구름에 묶어 얼룩의 밝은 쪽과 겹치게 해 둔 탓에 두 배로 밝아졌다.
    //   물리로도 맞다 — 막은 **반사**라 바탕이 이미 흰 곳에서는 더 밝힐 것이 없다.
    float3 mica = clamp(mix(col, float3(lum0) * veilCol, glVeilDesat)
                        + glVeilLift * (1.0 - lum0) * veilCol, 0.0, 1.0);
    col = mix(col, mica, veil);
  }
  col = mix(col, sheenCol, sh);   // 테(쉰) — 세기는 위에서 구해 뒀다(막보다 위에 앉는다)
  // 13판: 젖은 동안 번들거림 — 저주파 밝은 얼룩(추정)
  col += wetGloss * (1.0 - dq) * smoothstep(0.5, 0.95, vnoise(p / (glCloudScl * 1.6) + 31.7));
  // 11판: 글리터 쉬머 — 셀 해시 입자. 비용은 입자 수와 무관.
  if (glAmp > 0.001) {
    // 25판: 셀마다 입자 하나면 양을 올렸을 때 바둑판으로 보인다(사용자: "격자판 같다").
    //   간격이 무리수 비율로 다른 두 겹을 겹쳐 규칙성을 깬다. 비용은 해시 몇 개뿐.
    for (int layer = 0; layer < 2; layer++) {
    float lay = float(layer);
    float cellPx = glCellPx * mix(1.0, 1.37, lay);
    float2 cell = floor(p / cellPx + lay * 0.41);
    float u0 = vhash(cell * (1.013 + lay * 0.73) + 0.37 + lay * 5.9);   // 존재
    float pooled = smoothstep(0.25, 1.0, Tu);                       // 0 = 얇게 쓴 획, 1 = 고인 면
    float centre = mix(smoothstep(0.25, 0.75, An), 1.0, pooled);    // 얇은 획은 가운데로(현미경 사진)
    float gdens = 0.5 * glP * glAmp * smoothstep(0.06, 0.5, Tu)
               * mix(glThinP, 1.0, pooled)                           // 작아진 만큼 많이
               * centre
               * mix(1.0, 1.6, smoothstep(1.0, 2.0, Tb0))      // 고인 곳 밀집
               * (1.0 + glCloud * (vnoise(p / glCloudScl) - 0.5) * 2.0); // 구름 얼룩
    if (u0 < gdens) {
      float u1 = vhash(cell * (2.117 + lay * 1.3) + 1.11), u2 = vhash(cell * (3.721 + lay * 0.9) + 2.53);
      float u3 = vhash(cell * (5.313 + lay * 1.7) + 4.19), u4 = vhash(cell * (7.919 + lay * 2.1) + 5.87);
      float2 pos = (cell - lay * 0.41 + 0.18 + 0.64 * float2(u1, u2)) * cellPx;  // 셀 안쪽 여백 → 이웃 셀 탐색 불필요
      float r = mix(glRThin, mix(glRMin, glRMax, u3), pooled);
      float w = 1.0 - smoothstep(r - aa, r + aa, length(p - pos)); // 점(1px 이하 — AA 폭만)
      float boost = mix(glBMin, glBMax, pow(u4, glTail)) * mix(0.6, 1.0, dq); // 마르면 또렷(추정)
      float lum = dot(col, float3(0.299, 0.587, 0.114));
      float u6 = vhash(cell * 11.317 + 9.13);                       // 이 판의 기울기 → 간섭색
      float3 mc = u6 < 0.5 ? micaA : (u6 < 0.82 ? micaB : micaC);
      float3 spark = clamp(mix(col, float3(lum) * mc, glDesat) + boost * mc, 0.0, 1.0);
      // 12판: 반짝임 세기 — 입자 소수(세기 × 7%)를 흰색 가까이 + 조금 크게
      float u5 = vhash(cell * 9.173 + 7.41);
      if (u5 < sparkAmp * 0.07) { spark = float3(0.96); w = 1.0 - smoothstep(r - aa, r + 2.4 * aa, length(p - pos)); }
      col = mix(col, spark, w * A);
    }
    }
  }
  // 12판: 십자 글린트 — 성긴 큰 셀, 셀당 최대 1개, 팔은 셀 안에서만
  if (sparkAmp > 0.001) {
    float2 gc = floor(p / glintCellPx);
    float v0 = vhash(gc * 1.531 + 3.07);
    if (v0 < sparkAmp * 0.22) {
      float2 gpos = (gc + 0.3 + 0.4 * float2(vhash(gc * 2.367 + 1.93), vhash(gc * 4.129 + 6.71))) * glintCellPx;
      float2 dxy = p - gpos;
      float L2 = glintLenPx * (0.5 + 0.5 * vhash(gc * 6.733 + 0.59));
      float core = exp(-dot(dxy, dxy) / 1.8);
      float armX = exp(-dxy.y * dxy.y / 0.55) * pow(max(0.0, 1.0 - abs(dxy.x) / L2), 3.0);
      float armY = exp(-dxy.x * dxy.x / 0.55) * pow(max(0.0, 1.0 - abs(dxy.y) / L2), 3.0);
      float gi = min(1.0, core + 0.8 * (armX + armY)) * A;
      col = mix(col, float3(0.99), gi);
    }
  }
  // 6판: 염료는 흰색 혼합(알파)이 아니라 투과 — col 자체가 흰 종이 위 최종색. 알파는 덮임(AA)만.
  // 44판: 얼룩진(옅은) 자리는 잉크가 얇으니 **덮임도 연다** — 종이가 비친다
  float a = A * (1.0 - flowClear * max(0.0, 0.5 - fl) * 2.0
                 * (1.0 - smoothstep(0.25, 0.6, x)) * dq * mix(flowFloor, 1.0, pool01));
  return half4(half3(col * a), half(a));
}
`
