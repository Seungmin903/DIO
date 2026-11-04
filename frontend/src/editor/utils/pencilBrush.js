// 연필 브러시(앱 Skia, 2026-11-02 사용자: 그리기 앱처럼). 곡선을 따라 작은 원(도장)을 촘촘히 찍어 '묻은 양'(덮임)을 쌓고,
// 획 하나를 다 쌓은 뒤 종이 높낮이(paper)와 견준다: 종이 돌기는 조금만 묻어도 칠해지고 골은 많이 묻어야(세게 · 겹쳐) 메워진다.
// 결은 종이에 붙어 있어(도장마다 돌지 않는다) 겹쳐도 뭉개지지 않고 또렷한 흰 결로 남는다 — 도장마다 결을 돌리던 2판은 결이 섞여 솜처럼 흐려졌다.
// 가장자리는 원이 덜 겹쳐 덮임이 낮아 저절로 성기다(일정한 테두리 띠가 없다). 도장마다 진하기 · 크기 · 위치가 조금씩 다르다.
// 도장 위치는 진행 거리(inkDistance)의 일정 간격 번호로 정해, 쓰는 중 · 뗀 뒤 · 지우개 조각이 같은 도장을 찍는다(다시 계산해도 그대로).
// 이 파일은 계산과 종이 셰이더 원문만 갖는다(노드 테스트 · PC 렌더에서도 쓴다). 그리기는 skia/strokeSkia.js.
// 수치: 코덱스 브러시 리뷰 3판 · 기기 배율 보정(PC 렌더 + 사용자 참고 이미지 'Combined 1' · Taxe 흑색연필 · 실제 굵은 연필 스크리블).
import { curveOfPart, withDistances } from './nibStroke.js'
import { penPressure } from './penSettings.js'
import { brushSeed, seedHash } from './pencilSeed.js'

export const PENCIL_BRUSH = {
  // 28판 F1 리본 메시 결: 종이 결을 페이지 좌표 사각형 대신 획을 따라 늘인 리본 메시(drawVertices)로 입힌다 — 결 좌표가 (획 첫 점 + 진행 거리 / E, ±M) 라
  // 결이 획 방향으로 E 배 늘어난다(참고 연필의 획 방향 섬유 결). 굵기 <= minWidth 는 쓰지 않는다(얇은 약한 선 구멍 악화). 굵기 5 에서 e5, 10 이상에서 e10, 사이는 선형.
  ribbon: { on: false, minWidth: 3.5, e5: 2, e10: 2.5 },  // 30판 실기(사용자): 획 방향 줄무늬만 있는 결 = '다 쓴 사인펜' → 끔(태블릿 A/B 중)
  // 27판 되짚기: 같은 도장 그림을 한 번 더(Plus) 그려 B 채널에 '도장이 쌓인 양'(kk·v^γ)을 퇴적한다. R(덮임 합집합)은 첫 번째 그리기가 그대로 맡고,
  // 포화한 덮임 대신 퇴적량이 L2 를 올려(L2 b 계수 −0.35 · c0 +0.4 로 단일 획 p50 .77 유지(e2' — 처음 e2 −0.5 / +0.3 은 단일 코어가 회색으로 옅어져 보정)) 같은 자리를 다시 지나가면 진해진다. 꺼짐 = on:false(+ L2 값 되돌림)
  // 30판(사용자 2026-11-03 "너무 사인펜 같다"): 쌓임을 켜면 B 채널이 필압 깊이 v 대신 퇴적량 kk·v^γ(kk .14 면 거의 0)가 되어 손힘이 굵기만 바꾸고 진하기는 상수 c0 가 된다 — 톤이 평평한 선 = 사인펜.
  // 되짚기 누적은 사용자 결정 항목이 아니므로 끄고(B = v 복귀), 아래 L2 를 필압 → 톤 폭이 넓게(약하게 .3 · 보통 .6 · 세게 .95) 다시 잡았다. 켜려면 on:true + L2 c0 +0.7 · b −0.5
  accum: { on: false, kk: 0.14, gam: 0.7, cap: 0.8 },
  // 30판 흑연 퇴적 모델(사용자 2026-11-03 "참고 브러시와 뭐가 다른지 오래 생각": 참고 연필은 획 단면이 돔 — 가운데가 꽉 차고 옆 · 끝으로 갈수록 묻은 양이 줄어 종이 결에 걸러진다.
  // 우리 10~29판은 알갱이 도장의 합집합(덮임)이라 단면이 평평한 판 → 결이 폭 전체에 고르게 뿌려져 '사인펜 · 모래 · 물 얼룩'으로 읽혔다).
  // on 이면 알갱이 판 대신 부드러운 돔 판(PENCIL_DOME)을 Plus 로 쌓아 R = 묻은 양(가운데 ≈ flow·v·3.9 겹침 ≈ 1, 옆 · 끝 · 약한 필압은 작다),
  // 진하기 = clamp(c0 + c1·R − c3·결): 묻은 양이 결 깊이를 못 넘는 곳은 종이가 비친다. 세게 누르면 R 이 1 로 포화해 구멍이 메워지고(불투명), 되짚으면 더 쌓인다.
  // flow: 도장 하나가 묻히는 양(필압 깊이 v 를 곱함), radius: 돔 반지름 / 도장 반지름, l: 굵기별 [c0, c1(R), 0, c3(결)] (얇은 선은 결을 덜 깎아 Combined 1 처럼 꽉 차게)
  // 31판(사용자 글씨 vs 참고 Combined 1 · 노트 필기 · Procreate: 우리는 회색 안개, 참고는 검은 코어 + 또렷한 가장자리 + 가장자리에만 결):
  // 돔 경도 0.5(가운데 반지름 절반까지 평평 → 겹침 합 3.9 → 5.3, flow .29 → .22 로 보통 필압 가운데 ≈ 1 유지), l1: 'same' = L1 과 L2 에 같은 식 → 진하기 = L²(중간 회색을 눌러 검은 알갱이 · 흰 구멍으로 양극화, 가운데 1 은 그대로).
  // 조사 담당 30판 채점: 2.5 약한 선 구멍 97.8% · 램프 끝폭비 .08 → 경도 올림으로 약한 필압 R .5 → .8
  // fiber: 돔에 획 방향 줄무늬를 곱한 판(PENCIL_DOME_FIBER)을 쓴다 — 참고 연필의 획 방향 긁힘. 평균 묻는 양이 0.78 배라 flow 를 그만큼 올린다(.22 → .28)
  // 경도 0.7 돔(겹침 합 5.8 · 섬유 평균 .78 → flow .22): 폭 절반 자리까지 R ≈ 1 로 단면이 참고처럼 평평(가운데/중간 1.0~1.35), 가장자리 15% 만 가루
  // 섬유 돔은 끔(딥 리서치 8차 · 태블릿 눈: 돔이 겹치며 줄이 평균돼 방향성이 안 생기고 구멍만 는다). 방향성은 결 문턱 완화로 살린다(grainStep)
  // 31k 채점(조사 담당): 몸통이 너무 깔끔 · 진함(마커 · 소시지, p10 .44 > 참고 .24~.38), 굵은 약한 선 구멍 24% → l1Mix .6 → .8(옅은 알갱이 복구), radius 1.15(가장자리 가루 띠), vFloor 굵기별(굵을수록 ↑ — 굵은 약한 선의 결 구멍 메움)
  // 32판(사용자: 사람이 브러시를 만들면 기본 모양부터 — 참고 그림이 추구미라면 뭘 살릴까): 필압 고정 획을 참고와 같은 픽셀로 놓고 다시 잡았다. 참고 실측: 보통 필압 몸통 중앙값 .5~.65(앱 .97, 까만 막대), 상관 길이 획 방향 8~10px · 법선 1.6px(앱 2.7 · .9).
  // 진하기 = clamp(l1·R) × clamp(c0 + c1·R + c3·G) — 묻은 양 × 결(문턱식은 약한 곳이 끊긴 점이 된다). fComp: 필압으로 도장이 좁아져도 겹침 손실이 없게 묻는 양을 지름에 반비례. 얇은 선은 c3 를 줄여 꽉 찬 선
  // 36판(디자이너 기준 — 참고가 살리는 것: 어느 굵기든 윤곽이 또렷 · 몸통은 빽빽하고 밝은 점은 드묾 · 힘 따라 진하기 폭 · 겹치면 진해짐). 34~35판은 굵을수록 안개 띠 + 고른 소금후추(털 뭉치).
  // L1 = −1.5 + 7R − 1.4G(−1 은 굵은 획 둘레에 옅은 고리가 남았다): 윤곽을 결이 가른다. L2 = 톤: 보통 필압 R ≈ .7 → 대부분 진하기 .6~.8, 드문 결 자리만 옅다. 세게 · 되짚으면 R 1 → 1 에 닿아 불투명도 100 은 불투명. 38판(사용자: 이번엔 얇을수록 이상하다, 얇은 참고를 다시 봐라): 37판 얇은 행은 c0 .4 · 가파른 L1 로 진하기가 상한에 붙어 톤이 납작한 펜 선이었다. 얇을수록 L1 을 완만하게(옆이 부드럽게 빠짐) · c0 0 으로 힘 따라 톤이 움직이게, 굵을수록 가파르게
  // 40판 끝 가늘어짐(사용자): 힘이 약한 자리 · 획 시작을 지름과 진하기 양쪽으로 줄인다. low: 필압 배율 f 가 [a, b] 아래로 내려가면 지름 × (floor ~ 1). start: 시작에서 굵기 × length 동안 floor → 1(진행 거리만 써서 쓰는 중 = 뗀 뒤). minD: 끝 지름 하한(페이지 단위)
  taper: { on: true, low: [0.6, 1], lowFloor: 0.22, start: { length: 1, floor: 0.6 }, minD: 0.9 },   // 48판: S펜은 대는 순간 힘이 .02~.05 라 시작도 low 로 가늘어진다. start 는 힘이 없는 입력(손가락 · 마우스)을 위한 것
  // 40판 구슬 원인: 펜이 닿을 때의 작은 갈고리 · 짧은 되돌림에 도장이 평소의 2~3 배 겹쳐 묻은 양이 차 버린다. 앞쪽 짧은 거리(지름 × window) 안의 도장과 겹치는 만큼 이번 도장 양을 줄인다. 긴 되짚기는 그대로 진해진다
  retrace: { on: true, window: 3 },
  // 48판 완성 구조(사용자: 완성형을 충분히 생각하고 최종본을. 검수판 — 굵기 1~16 을 손힘 약 → 세 → 약 낙서로 — 에서 드러난 뿌리): 묻은 양 하나(R)가 윤곽 · 진하기를 함께 정해서, 진하게 하면 힘을 빼도 같은 진하기 · 약한 선 끊김, 힘을 따르게 하면 굵은 획 둘레에 털 띠가 생기고 굵기 3~5 에서 다른 펜처럼 바뀌었다.
  // 셋으로 나눈다(같은 도장 한 번에 채널만 나누므로 그리기 비용은 그대로): R = 윤곽(gain 배로 빨리 차서 힘과 무관한 또렷한 테두리, 약한 선도 안 끊긴다) · B = 묻은 양(힘 비례, 몸통 톤. 차지 않아 힘이 끝까지 보인다) · G = 결. L1 = 윤곽을 결로 가르기, L2 = 톤(도장 합은 가장자리로 갈수록 줄어드는 타원 단면이라 B 만 쓰면 둘레가 흐린 띠가 된다 → R 을 조금 섞어 윤곽 안쪽에 바닥을 둔다). 행 [c0, R, B, G]. 결 세기는 굵기 따라 고르게 커진다
  // 62판 겹침(2026-11-04, 21쪽 낙서 실측: 지나간 횟수 2 · 3 · 4~5 · 6~9 겹의 α 중앙값 .64 · .65 · .65 · .64, 최대 .799): B 가 두 번째 지남에서 1 로 잘리고 불투명도가 획 전체 알파라 그 뒤로 하나도 안 진해졌다.
  // 도장을 Screen 으로 쌓는다(b + d − b·d): 묻을수록 덜 묻어 B = 1 − e^(−지난 양) — 실제 흑연처럼 겹칠수록 천천히 진해진다. 덧셈은 지날 때마다 같은 양씩 올라 4 겹이면 까맣게 막혔다(62a). bGain: 행의 B 계수 배율, 한 번 지난 톤을 덧셈 때와 같게 맞춘다
  // accumulate: 불투명도를 '한 번 지난 알파'로 보고 L2 행에 곱한다(획 전체 알파를 걸지 않는다) — 겹치면 1 까지 올라간다
  deposit: { on: true, fiber: false, fComp: true, fMax: 8, flow: 0.16, bGain: 1.38, accumulate: true, vFloor: 0, vFloorWide: 0, radius: 1.1, l: [{ width: 2.5, gain: 2.4, l2: [-0.12, 0.3, 0.95, -0.55], l1: [-0.1, 3, 0, -0.5] }, { width: 5, gain: 2.6, l2: [-0.17, 0.45, 0.9, -1.05], l1: [-0.6, 5, 0, -1.1] }, { width: 10, gain: 2.8, l2: [-0.15, 0.45, 0.9, -1.15], l1: [-1, 6.5, 0, -1.8] }, { width: 16, gain: 3, l2: [-0.15, 0.45, 0.9, -1.2], l1: [-1.2, 7, 0, -2.2] }] },
  // 결 G = tooth · 종이 이빨(페이지 고정 — 겹쳐 그려도 같은 자리가 비어 종이처럼 보인다) + strand · 가닥(획 좌표 리본 — 획을 따라 이어지는 흑연 줄). 합 1
  // step: 가닥 값 재배치(대부분 진한 쪽, 드물게 옅음). wide: 굵기 [from, to] 사이에서 가닥 칸을 scale 배로(줄은 굵기 따라 넓어져도 획 방향이라 얼룩이 안 된다. 종이 이빨까지 키우면 표범 무늬가 돼 기각)
  strand: { on: true, tooth: 0.7, strand: 0.3, step: [0, 1], wide: [5, 14, 1], toothWide: [5, 16, 1] },   // 46판: 참고의 결은 크기별 세기가 고르고 가장 고운 칸이 가장 세다 → 어느 굵기든 같은 칸 크기, 고운 종이 이빨을 주로, 가닥은 짧게(획 방향 8px 까지. 길게 늘이면 빗질 자국 = 사인펜). 45판 .55 · .45, wide .8
  // 확대 연동 결 크기(테스트 담당 35): 결 칸 = grainScale · 1.75^(1 − a) · zoom^a — a 1 은 화면 px 고정(확대 5 에서 가루 7 배 · 약한 선 소실), a .25 는 확대 3 에서 결 1.3 배. 기기 기본 배율 1.75 에선 같다
  grainZoomPow: 0.25,
  // 25판 'shader' 엔진: 도장은 덮임 이미지(오프스크린 표면, 화면 해상도)에만 쌓고 — R 대신 알파 채널에 합집합(SrcOver, 도장당 알파 flow × 필압 → 겹칠수록 진해짐 = 되짚기 누적),
  // 별도 표면에 필압(Lighten 최댓값) — 최종 색은 런타임 셰이더(PENCIL_SHADER_SKSL)가 두 이미지 + 종이 결을 읽어 비선형 식으로 계산한다(색 행렬 1차식 제약 없음).
  // 식: cc = c^gam × (pw + (1 − pw)·p), a = clamp(cc·gain − th·depth·(1 − 결)·(1 − cc)^g2, 0, 1), a = max(a, fl·cc). 덮임이 적을수록 결이 강하게 파고들고 겹쳐 쌓이면 검게 채워진다.
  shader: { flow: 0.35, gain: 1.2, th: 1.0, g2: 1.0, pw: 0.9, af: 0.85, fl: 0.45, gam: 0.6, depth: 1, maxOpacity: 1, capAlpha: 0.35, capDab: 0.5, capAlphaWide: 0.2, capDabWide: 0.3, sizeK: 1, thThin: 0.7, live: false, maxEdge: 4096 },
  // 22판: 'own' = 지금까지의 자체 식(알갱이 붓 끝 + 종이 결 색 행렬), 'copy' = 시중 프로크리에이트 연필(_Kim Graphite 6B) 엔진 구조를 그대로 따르는 새 경로(copyDabs · strokeSkia copyLayer)
  engine: 'own',  // 2026-11-03 shader 경로: 쓰는 중 프레임마다 GPU 이미지 · 표면이 쌓여 메모리 부족(SIGTRAP) — 해결 전까지 own. 켜려면 'shader'  // 2026-11-03 실기(SM-X510 가로 2304×1440)에서 shader 경로가 필기 시작 직후 MakeOffscreen 에서 SIGTRAP — 원인 확정 전까지 own. 켜려면 'shader'
  // 'copy' 엔진 설정(원본 6B 설정값 → 우리 값): 모양 군집 폭 / 한 변 .955(측정), 필압 → 크기 .508 · 불투명도 1.0(필압 하한 .1 — 8비트), 기울기 → 크기 .183, 간격 0.0(연속) → 한 변의 6%,
  // 23판 보정(참고 Taxe · 6B 스와치에 맞춤, 원값과 다름): 층 최대 불투명도 .668 → .85, 도장 알파 p → .12 + .88·p^.7(약필압 소실 방지), 군집 폭 하한 1.6, 결 깊이 1 → .85(결 구멍이 완전 투명이 되지 않고 15% 남음).
  // 원값: 층 최대 불투명도 .668(획 단위 상한), 도장끼리 합성 'max'(Lighten = 최댓값 — 합집합이면 필압이 불투명도에 거의 안 보임, 실험), 결 극성 g(밝음 = 칠함, 스와치 구멍 27% 에 가까움), 결 한 칸 = 화면 0.5px(24판: 1px 는 획 폭(4~17px)에 비해 알갱이가 커 끊긴 점선 · 마른 크레용, 0.5 는 연속선 + 고운 알갱이).
  // 16~21판의 부가 효과(가장자리 물결 · 캡 · 필압 깊이 v · 지터 · 각도 흔들림)는 이 경로에 없다(6B 에 없음)
  copy: { shapeFrac: 0.955, pressureSize: 0.508, minPressure: 0.1, tiltSize: 0.183, spacing: 0.06, minStep: 0.35, maxOpacity: 0.85, grainScale: 0.5, blend: 'max', alphaFloor: 0.12, alphaPow: 0.7, minWidth: 1.6, grainDepth: 0.85, grainContrast: 1, angleOffset: -Math.PI / 2 },
  // 2026-11-02 코덱스 10판: 결은 붓 끝에서 — 듬성듬성한 흑연 알갱이 묶음 붓 끝(PENCIL_TIPS, 가로로 길쭉한 알갱이)을 획 접선 방향으로 정렬해
  // 촘촘히 찍으면 알갱이가 획을 따라 끌려 짧은 긁힘이 된다(참고 연필 결은 획 방향으로 1.75~5.5배 길쭉, 2026-11-02 측정).
  // 종이 결(h)은 방향 없이 미세 농담과 가장자리 흔들기만. 진하기 = clamp(L1) × clamp(L2) (포토샵 Height 식).
  // 지난 판: 3판 두 값 결(픽셀) · 6px 띠(에어브러시), 4판 볼펜, 5판 마커, 6판 TV 잡음, 7 · 9판 방향 없는 점박이(스펀지 · 콘크리트),
  // 8판 붓 끝을 황금각으로 마구 돌려 줄무늬가 지워짐. 2판(부드러운 결 그림 자체를 돌려 쌓음)은 솜처럼 흐렸다 — 이번엔 투명 바탕 낱알갱이 + 문턱.
  // 간격 · 진하기는 코덱스 명세(0.14D · 0.78)로는 덮임이 모자라 몸통 구멍 30% · 얇은 약필압 선이 사라져, 측정으로 맞춘 값
  // (굵은 선 몸통 구멍 1.7% · 중간 톤 63% · 중앙값 0.67, 얇은 약필압 선 유지 — 2026-11-02 PC 렌더)
  minSpacing: 0.3,   // 도장 간격 = max(0.3, 0.15 × 지름) × 간격 배수. 13판: 붓 끝 판이 도장 3개를 미리 쓸어 둔 것이라 예전(0.1 · 0.05)의 3배로 찍는다 — 도장 수 1/3
  spacing: 0.15,
  // 성능 시험(11판, 지금은 꺼 둠): 굵기 <= thinWidth 는 간격 2배 + 붓 끝 알파 1 - (1 - α)² 판(PENCIL_TIPS_K2)으로 도장 수를 절반으로 줄인다.
  // 켜면 얇은 약필압 선이 끊긴다(확대 1 굵기 2.5 약하게 구멍 0% → 21%, 간격 1.5배는 7%). 0 이면 꺼짐. 켜 보려면 3.5.
  thinWidth: 0,
  // 12판 시험: 미리 쓸어 둔 가로 붓 끝(길이 length·D)을 간격 step·length·굵기 로 찍는다(on 이면 위 spacing 대신). 꺼짐.
  sweep: { on: false, length: 1.6, step: 0.32 },  // 0.5 는 약필압 얇은 선이 격자로 끊겼다(구멍 19.8%)
  // 12판: 끝 캡 도장은 필압 깊이 출렁임 없이 기준값(f × 0.80)으로 / 도장별 진하기 지터 [최소, 최대](진행 거리 번호 해시, 무작위 아님, 꺼짐)
  // 18판: 필압 → 크기 배율 f 의 하한(0.62 = 12판까지) · 지름 하한(페이지 단위, 굵기 2.5 약한 선이 점선이 되지 않게). 끝 가늘어짐을 위해 하한을 낮춘다
  fMin: 0.55,   // 0.62 → 0.55(0.45 · 0.5 는 굵기 5 이상 약한 선이 끊기고 굵기 10 약하게 구멍 13~20%). 램프 끝 폭 / 최대 폭 .51 → .50 · .37 · .32
  minD: 1.6,   // 굵기 2.5 약한 선(f 하한 지름 1.4)이 점선이 되지 않게 지름 하한 1.6(페이지 단위, 약 2.8px)
  // 19판: 획마다 다른 시드(brushSeed)로 파형 · 가장자리 잡음 위치를 어긋나게 한다(꺼짐 = 모든 획이 같은 모양)
  seedOn: true,
  edgeThin: 0.3,
  capFlatV: true,
  // 17판: 끝 캡 도장의 필압 깊이에 곱하는 값(1 = 12판) — 약한 필압에서 끝 구슬이 몸통의 1.4~2.1배로 진해지던 것을 낮춘다
  capVScale: { thin: 0.9, wide: 1, from: 7, to: 10 },  // 굵기 <= from 은 thin, >= to 는 wide, 사이는 선형. 0.6 은 굵기 7 · 10 캡이 몸통의 0.45~0.57배로 빠져 기각, 0.8 은 굵기 2.5 가 −0.15
  // 13판 시험(0 = 꺼짐): 도장 반지름을 번호 해시로 ±rJitter 비율 흔든다(가장자리 거칠기). 캡 도장은 제외
  rJitter: 0,
  // 13판 시험(꺼짐): 굵기 <= width 는 알갱이 5개짜리 작은 붓 끝 판(PENCIL_SMALL)으로 — 켜면 경계 굵기(3.4 / 3.6)에서 약한 선 무게가 .78 → .69 로 튄다
  smallTip: { on: false, width: 3.5 },
  jitter: null,
  dabAlpha: 1.0,     // 도장 진하기 배율(붓 끝 그림 알파와 곱)
  // 둥근 끝(11판): 획 첫 도장(진행 거리 0)과 끝점 도장 자리에 거친 원판을 지름 D × diameter, 진하기 alpha 로 덧찍는다(0.95 / 0.65 는 몸통 옆에 어깨 턱이 졌다. 0.88 / 0.7 이 매끈하게 이어짐)(획 끝이 털 난 네모가 되지 않게)
  cap: { diameter: 0.88, alpha: 0.7 },
  // 굵기 2.5 / 5 / 10 기준(사이는 보간): 기울기 넓어짐, 종이 결 L1(윤곽 · 구멍) · L2(흑연 농담) [c0, a, b, h]
  // 15판: L2 의 b(필압 깊이) 계수 +0.32, c0 −0.135 — 보통 필압 코어를 어둡게(p50 .68 → .74, p90 1.0)하되 약한 필압(b 가 작다)은 거의 그대로. 결(h) 계수는 그대로라 밝은 긁힘 줄이 남는다.
  // 11판: L2 의 결(h) 계수를 절반으로(평균 유지: c0 += 0.5·|c3|/2 ... 10판 -0.72 · -1.00 · -1.03 → -0.36 · -0.50 · -0.515). 방향 없는 1px 결 잡음이 붓 끝 줄무늬(획 방향)를
  // 덮던 것을 줄여 결 길쭉함 1.3 → 2.0~3.1 (조사 담당 실험: h 를 상수로 고정하면 3.2).
  c0opSpan: 0.2,   // c0 를 올리는 불투명도 내림 폭 상한(0.8 보다 낮은 불투명도에선 +0.10 으로 고정 — 더 올리면 코어가 불투명도 한도에 붙어 결이 평평해짐)
  byWidth: [
    // 30판: 쌓임 끔(B = v) + 필압 기울기 b +0.5 · c0 −0.65 (PC 스윕 L2B=0.5,-0.7 기준, 약한 선 소실을 막으려 c0 는 +0.05 되돌림 — 불투명도 1 에서 10n p50 .61 · p90 .92, 10w p50 .18 · p90 .34, 고주파 σ .12 ↔ 29판 .10 · 채움 96 → 77)
    // 29판(쌓임 켬) 값: [0.685, 0.08, 0.75, -0.60] · [0.455, 0.10, 0.87, -0.50] · [0.3975, 0.10, 0.92, -0.515]
    // 태블릿 변형 C: 결(h) 계수 1.5 배(평균 유지: c0 += 0.5·(h_old − h_new)) — 1.0 배 값: l1 h −.30/−.60/−.70 · c0 −2.795/−2.420/−2.242, l2 h −.60/−.50/−.515 · c0 .035/−.195/−.2525
    // 30판 실기(사용자 "뒤에 옅은 바탕 층이 깔린 느낌"): 결 구멍(h = 1)에서도 L2 = c0 + 1.42·b − .515 ≈ .47 이라 잉크 47% 가 남아 옅은 막이 된다 →
    // 결 계수를 −1.1 로 키워 보통 필압에서 구멍이 종이색(0)까지 비고, 세게 누르면(b ↑) 구멍이 메워진다. c0 는 평균 유지분(+0.5·Δh)만 올림. 1.0 배 값: h −.60/−.50/−.515 · c0 .035/−.195/−.2525
    { width: 2.5, alpha: 1, tilt: 0.4, l1: [-2.795, 9.5, 0, -0.30], l2: [0.185, 0.08, 1.25, -0.90], c0op: [0, 0] },
    { width: 5, alpha: 1, tilt: 0.6, l1: [-2.420, 8.0, 0, -0.60], l2: [0.005, 0.10, 1.37, -0.90], c0op: [0, 0] },
    { width: 10, alpha: 1, tilt: 0.8, l1: [-2.242, 7.2, 0, -0.70], l2: [-0.06, 0.10, 1.42, -0.90], c0op: [0, 0] },
  ],
  // 진행 거리(× 굵기)를 따라: 붓 끝 각도 흔들림(도, 주기 수) · 필압 깊이 출렁임(세기, 주기 수). 도장별 무작위 회전 · ±20° 넘는 회전 금지
  angleWaves: [[3.5, 0.137], [1.5, 0.311]],
  depthWaves: [[0.03, 0.173], [0.015, 0.419]],   // 32판: ±25% 는 필압 고정에서도 획 한쪽이 까매졌다(가짜 필압)
  pressureBase: 0.85,
  tilt: [40, 55],    // 평소 쓰는 30~40° 는 효과 없음, 55° 에서 최대
  // 종이 결 칸 크기: 화면 px 당 타일 칸(확대 배율을 곱해 확대해도 화면에서 같은 크기 — 페이지 고정 결은 확대할수록 덩어리가 커졌다)
  grainScale: 1.0,
  // 결 양극화 문턱(smoothstep 구간, 결 값 0~1). [0, 1] 이면 예전 그대로(선형). [.42, .58] 은 2값 점박이(TV 잡음 · 크레용)라 회색 단계가 남게 넓힘
  grainStep: [0, 1.5],   // 46판: 아래 문턱을 없애 결 값이 톤으로 이어지고(.3 아래가 모두 0 이면 평평한 회색 칸이 된다), 위를 1.5 로 둬 진한 쪽에 몰린다(몸통이 빽빽하고 밝은 점은 드묾). 44판 [.3, .95] ·   // 딥 리서치 8차: [.3, .7] 양극화가 돔 옆 띠를 '진한 알갱이 + 흰 구멍' 후추로 만들고 획 방향 결(길쭉 1.4)을 지움 → 완화([0, 1] 은 길쭉 2.6 · 구멍 10%, 안전안 [.15, .85])
  // 결 칸 읽기: 'cubic'(29판까지 — 칸 경계가 번져 물 얼룩) · 'nearest'(칸이 네모로 보여 픽셀 아트) · 'linear'
  grainFilter: 'linear',
  // 16판(사용자: 윤곽이 너무 일직선 — 3판 SVG 연필(pencilStroke.js)의 가장자리 방식을 도장에 옮김): 좌우 가장자리를 따로, 진행 거리의 값 잡음으로
  // 저주파 물결(amplitude, 파장 wave) + 짧은 잔결(fine, fineWave)만큼 밀고 — 도장 중심을 법선으로 (왼쪽 − 오른쪽)/2 옮기고 지름을 그만큼 바꾼다 —
  // 안쪽으로만 군데군데 갉는다(bite: 0 아래를 잘라 안 갉는 구간이 길게 남는다, 좌우 따로). 비율은 굵기 D 기준, 파장은 설정 굵기 기준(필압으로 바뀌지 않게).
  // SVG 때는 진폭이 절대 단위(0.1~0.16)라 굵은 선에서 1~2% 뿐이었고 굵은 선은 outerBite 0.055W 로 갉았다. 시드는 상수라 쓰는 중 = 뗀 뒤.
  edge: null,   // 32판: 끔(참고 폭 변동 .02~.1, 윤곽 거칠기는 결이 만든다). 19판 값 { amplitude: 0.05, wave: 1.0, fine: 0.04, fineWave: 0.25, bite: 0.14, biteWave: [1.8, 1.0] }  // 19판: 16판 .14 / .06 / .22 는 획마다 같은 모양이라 벌레처럼 울퉁불퉁 → 획마다 시드 + 진폭 줄임(.07 / .04 / .22 는 폭 CV .12~.14, .04 / .03 / .10 은 확대 3 거칠기 3.08)
}
const B = PENCIL_BRUSH
// 리본 늘임 배율 E(굵기별, 1 이하면 리본을 쓰지 않는다)
export const ribbonStretch = width => !B.ribbon.on || width <= B.ribbon.minWidth ? 1 : B.ribbon.e5 + (B.ribbon.e10 - B.ribbon.e5) * clamp((width - 5) / 5, 0, 1)
// 미리보기 구간 길이(점 수): 연필은 쓰는 중 진행 중 구간만 매 프레임 다시 그리므로 짧게(16), 다른 펜은 96(strokePreview 기본). 쓰는 중 · 뗀 뒤가 같은 값을 쓴다
export const PENCIL_SHADER_SEGMENT = 16
export const previewSegmentFor = kind => kind === 'pencil' ? PENCIL_SHADER_SEGMENT : undefined
// 25판 최종 셰이더(CanvasKit · RN Skia 공용). cov: 알파 = 덮임, prs: R = 필압, grain: 종이 결 타일(칸 좌표)
export const PENCIL_SHADER_SKSL = `
uniform shader cov; uniform shader prs; uniform shader dcov; uniform shader dprs; uniform shader grain;
uniform float2 org; uniform float ipx; uniform float gs; uniform float2 gorg; uniform float3 ink;
uniform float maxop; uniform float th; uniform float gain; uniform float gam; uniform float pw; uniform float depth; uniform float g2; uniform float fl;
uniform float2 dorg; uniform float2 dsize;
half4 main(float2 xy) {
  float2 q = (xy - org) * ipx;
  float c = cov.eval(q).a, p = prs.eval(q).r;
  // 쓰는 중: 진행 중 구간만 작은 보조 표면(dorg 기준)에 따로 찍어 합친다(합집합 · 최댓값)
  float2 q2 = (xy - dorg) * ipx;
  float inD = step(0.0, q2.x) * step(0.0, q2.y) * step(q2.x, dsize.x) * step(q2.y, dsize.y);
  c = 1.0 - (1.0 - c) * (1.0 - inD * dcov.eval(q2).a);
  p = max(p, inD * dprs.eval(q2).r);
  float g = grain.eval((xy - gorg) * gs).r;
  float cc = clamp(pow(c, gam) * mix(pw, 1.0, p), 0.0, 1.0);
  float a = clamp(cc * gain - th * depth * (1.0 - g) * pow(1.0 - cc, g2), 0.0, 1.0);
  a = max(a, fl * cc);
  float al = maxop * a;
  return half4(half3(ink) * half(al), half(al));
}`
// 최종 셰이더 uniform 배열(순서 = 위 선언). ipx: 덮임 이미지 px / 페이지 단위, zoom: 화면 px / 페이지 단위(결 크기), origin: 결 좌표 원점(획 첫 점)
export const shaderUniforms = (box, ipx, zoom, origin, ink, delta = null, width = 10) => {
  const c = B.shader, th = c.th * (c.thThin + (1 - c.thThin) * clamp((width - 2.5) / 7.5, 0, 1))   // 얇은 선은 결 깎기를 줄여 꽉 차게
  return [box.x, box.y, ipx, B.grainScale * zoom, origin?.x ?? 0, origin?.y ?? 0, ink[0], ink[1], ink[2], c.maxOpacity, th, c.gain, c.gam, c.pw, c.depth, c.g2, c.fl,
    delta?.x ?? 0, delta?.y ?? 0, delta ? delta.pw : 0, delta ? delta.ph : 0]
}
// 끝 캡(둥근 끝) 기여: 굵기 3.5 이하는 capDab · capAlpha, 5 이상은 Wide 값(캡 − 몸통 차 ±0.1 안: 굵기 5 · 10 에서 구슬이 몸통보다 진하게 남던 것을 낮춤), 사이는 선형
export const shaderCap = width => { const c = B.shader, t = clamp((width - 3.5) / 1.5, 0, 1); return { dab: c.capDab + (c.capDabWide - c.capDab) * t, alpha: c.capAlpha + (c.capAlphaWide - c.capAlpha) * t } }
// 덮임 표면에 찍을 도장 알파 = flow × (af + (1 − af)·필압), 캡 도장은 shaderCap(width).dab 배
export const shaderDabAlpha = (one, width = 6) => Math.min(1, B.shader.flow * (B.shader.af + (1 - B.shader.af) * (one.v ?? 0.8)) * (one.cap ? shaderCap(width).dab : 1))

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const mix = (a, b, t) => Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t
// 도장마다 불리므로 굵기당 한 번만 계산한다
const lookCache = new Map()
export function brushLook(width) {
  const rows = B.byWidth, first = rows[0], last = rows.at(-1)
  if (width <= first.width) return first
  if (width >= last.width) return last
  let look = lookCache.get(width)
  if (!look) {
    const i = rows.findIndex(row => row.width >= width), a = rows[i - 1], b = rows[i], t = (width - a.width) / (b.width - a.width)
    look = Object.fromEntries(Object.keys(a).map(key => [key, mix(a[key], b[key], t)]))
    lookCache.set(width, look)
  }
  return look
}
export const brushTipPower = width => width <= B.thinWidth ? 2 : 1
export const brushSpacing = width => B.sweep.on ? B.sweep.length * B.sweep.step * width : Math.max(B.minSpacing, width * B.spacing) * brushTipPower(width)
const tiltOf = p => Number.isFinite(p.tiltX) && Number.isFinite(p.tiltY)
  ? clamp((Math.min(90, Math.hypot(p.tiltX, p.tiltY)) - B.tilt[0]) / (B.tilt[1] - B.tilt[0]), 0, 1) : 0
const waves = (list, s) => list.reduce((sum, [amount, cycles]) => sum + amount * Math.sin(2 * Math.PI * cycles * s), 0)
// 가장자리 값 잡음(pencilStroke.js 와 같은 식): 진행 거리를 파장으로 나눈 칸마다 해시 값을 부드럽게 이어 −1~1
const hash = seedHash
const noise = (distance, wave, seed) => {
  const x = distance / wave, i = Math.floor(x), t = x - i, s = t * t * (3 - 2 * t)
  return (hash(i + seed * 1013) + (hash(i + 1 + seed * 1013) - hash(i + seed * 1013)) * s) * 2 - 1
}
// 한쪽 가장자리의 밀림(+ 밖, − 안): 물결 + 잔결 − 갉기. seed 는 좌우가 다르다
function edgeOf(d, width, D, seed) {
  // d 는 호출하는 쪽이 획 시드만큼 어긋나게 넘긴다(19판)
  const e = B.edge
  if (!e) return 0
  // 굵기 2.5 의 얇은 선은 가장자리 밀림 · 갉기를 줄인다(19판 측정: 그대로면 2.5 약하게 구멍 4 → 17%)
  const k = B.edgeThin + (1 - B.edgeThin) * clamp((width - 2.5) / 2.5, 0, 1)
  const bite = clamp(0.65 * noise(d, e.biteWave[0] * width, seed + 80) + 0.35 * noise(d, e.biteWave[1] * width, seed + 89), 0, 1)
  return D * k * (e.amplitude * noise(d, e.wave * width, seed) + e.fine * noise(d, e.fineWave * width, seed + 7) - e.bite * bite)
}

const capVScale = width => { const c = B.capVScale; return typeof c === 'number' ? c : c.thin + (c.wide - c.thin) * clamp((width - c.from) / (c.to - c.from), 0, 1) }
// 도장 하나: 점(곡선 위치 · 필압 · 기울기), 획 접선 방향(tx, ty), 진행 거리 d → { x, y, r, a, v, angle }
// v: 필압 깊이(채널 b) — 약하게 쓰면 끊기지 않고(덮임은 그대로) 옅어진다. angle: 붓 끝 가로축을 접선에 맞추고 ±5° 만 흔든다.
// 획마다 다른 시드(19판): 획 첫 점(요소 좌표, 쓰는 중 = 뗀 뒤 = 지우개 조각 모두 같은 값)의 해시 0~1. 파형 위상과 가장자리 잡음 위치를 어긋나게 해 획마다 다르게 보이게 한다(무작위 아님)
export { brushSeed }
const smooth01 = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t) }
function taperOf(p, d, width) {
  const t = B.taper
  if (!t?.on || d >= 1e6) return 1
  const f = (p.pressure ?? B.pressureBase) / B.pressureBase
  const low = t.lowFloor + (1 - t.lowFloor) * smooth01((f - t.low[0]) / (t.low[1] - t.low[0]))
  const start = t.start.floor + (1 - t.start.floor) * smooth01(d / (t.start.length * width))
  return Math.min(low, start)
}
// 이 힘에서 지름이 간격의 2 배 아래로 내려갈 수 있는가
function mayThin(pressure, width, step) {
  const t = B.taper
  if (!B.deposit?.on || B.sweep.on || !t?.on) return false
  const f = clamp(pressure / B.pressureBase, B.fMin, 1.48), low = t.lowFloor + (1 - t.lowFloor) * smooth01((f - t.low[0]) / (t.low[1] - t.low[0]))
  return Math.max(t.minD, width * f * Math.min(low, t.start.floor)) < 2 * step
}
// 앞 도장만 보므로 획이 길어져도 앞부분 도장은 그대로다(쓰는 중 = 뗀 뒤)
function easeRetrace(dabs, step) {
  if (!B.retrace?.on) return dabs
  for (let i = 1; i < dabs.length; i++) {
    const a = dabs[i], local = step / (a.dense ?? 1), reach = a.r * 0.5, expect = Math.max(1, reach / local), from = Math.max(0, i - Math.ceil(B.retrace.window * 2 * a.r / local))
    let near = 0
    for (let j = from; j < i; j++) if (Math.hypot(a.x - dabs[j].x, a.y - dabs[j].y) < reach) near++
    if (near > expect) a.a *= (expect + 1) / (near + 1)
  }
  return dabs
}
function dab(p, tx, ty, width, d, cap, index, seed = 0) {
  const f = clamp((p.pressure ?? B.pressureBase) / B.pressureBase, B.fMin, 1.48), s = d / width + (B.seedOn ? seed * 13.7 : 0), dEdge = d + (B.seedOn ? seed * 977 : 0)
  const taper = taperOf(p, d, width)
  let D = Math.max(B.taper?.on ? B.taper.minD : B.minD, width * f * taper * (1 + brushLook(width).tilt * tiltOf(p)))
  // 48판: 힘 전 구간(f .62 ~ 1.48)이 진하기로 보이게 비례(예전 f × .8 은 force .3 위가 모두 1 이었다). 눕혀 쓰면 넓고 옅다(참고 7 · 8)
  const v = (B.deposit?.on ? clamp(f / 1.48 * (1 + waves(B.depthWaves, s)), 0.2, 1) * (1 - 0.5 * tiltOf(p)) : clamp(f * (0.80 + waves(B.depthWaves, s)), 0.38, 1)) * (0.5 + 0.5 * taper)
  const angle = Math.atan2(ty, tx) + waves(B.angleWaves, s) * Math.PI / 180
  const hash = index == null ? 0.5 : ((Math.imul(index | 0, 2654435761) >>> 8) & 0xffff) / 0xffff
  const jit = B.jitter && index != null && !cap ? B.jitter[0] + (B.jitter[1] - B.jitter[0]) * hash : 1
  // 좌우 가장자리를 따로 민다(16판): 중심을 법선 (−ty, tx) 방향으로 (왼쪽 − 오른쪽)/2, 지름을 왼쪽 + 오른쪽 만큼
  const left = edgeOf(dEdge, width, D, 11), right = edgeOf(dEdge, width, D, 14), shift = (left - right) / 2
  D = Math.max(D * 0.5, D + left + right)
  const one = { x: p.x - ty * shift, y: p.y + tx * shift, r: D / 2 * (B.rJitter && index != null && !cap ? 1 + B.rJitter * (2 * ((((Math.imul((index | 0) + 7919, 2246822519) >>> 8) & 0xffff) / 0xffff) - 0.5)) : 1), a: B.dabAlpha * brushLook(width).alpha * jit, v: cap && B.capFlatV && !B.deposit?.on ? clamp(f * 0.80, 0.38, 1) * capVScale(width) : v, angle }
  if (cap) one.cap = cap
  if (index != null) one.i = index
  return one
}

// samples: 진행 거리(inkDistance)를 가진 곡선 표본. [from, to) 에 드는 번호의 자리만 찍는다(구간끼리 겹쳐 찍지 않게).
// 접선은 그 자리 곡선 표본 구간의 방향(구간 경계 너머 점을 쓰지 않아 쓰는 중 · 뗀 뒤가 같다).
// 획의 마지막 구간(to 가 끝없음)은 끝점에 한 번 더 찍어 둥근 끝을 맞춘다.
export function pencilDabs(samples, width, from = -Infinity, to = Infinity, total = Infinity, seed = 0) {
  const dabs = [], step = brushSpacing(width)
  if (!samples.length) return dabs
  if (samples.length === 1) {
    // 탭: 한 자리에 도장 여러 개 — 선 한 줄이 한 자리에 쌓는 만큼(지름 / 간격, 예전 4개는 덮임이 문턱에 못 미쳐 점이 거의 안 찍혔다) + 둥근 캡
    const count = B.sweep.on ? 3 : Math.max(4, Math.round(width / step))
    for (let k = 0; k < count; k++) dabs.push(dab(samples[0], 1, 0, width, 1e6 + k * step, k === 0 ? 'start' : undefined, 1e6 + k, seed))
    return dabs
  }
  let tangent = [1, 0]
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], d0 = a.inkDistance, d1 = b.inkDistance
    if (!(d1 > d0)) continue
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
    tangent = [dx / length, dy / length]
    const last = i === samples.length - 1
    // 48판: 끝으로 가늘어져 지름이 간격보다 작아지면 끊기므로 그 자리만 간격을 2 · 4 분의 1 로 찍고 양도 그만큼 나눈다. 칸 번호 · 그 자리 값으로만 정해 쓰는 중 = 뗀 뒤
    // 촘촘한 칸은 그 구간 힘이 약할 때만 살핀다(모든 구간에서 칸마다 도장을 계산하면 쓰는 중 비용이 4 배)
    const fine = step / 4, stride = mayThin(Math.min(a.pressure ?? B.pressureBase, b.pressure ?? B.pressureBase), width, step) ? 1 : 4
    for (let k = stride * Math.max(Math.ceil(d0 / (fine * stride)), Math.ceil(from / (fine * stride))); k * fine < Math.min(to, last ? d1 + 1e-9 : d1); k += stride) {
      const t = (k * fine - d0) / (d1 - d0), lerp = key => a[key] != null && b[key] != null ? a[key] + (b[key] - a[key]) * t : b[key] ?? a[key]
      const one = dab({ x: a.x + dx * t, y: a.y + dy * t, pressure: lerp('pressure'), tiltX: lerp('tiltX'), tiltY: lerp('tiltY') }, tangent[0], tangent[1], width, k * fine, k === 0 ? 'start' : undefined, k / 4, seed)
      const dense = !B.deposit?.on || B.sweep.on ? 1 : one.r * 2 < step ? 4 : one.r < step ? 2 : 1
      if (k % (4 / dense)) continue
      if (dense > 1) { one.a /= dense; one.dense = dense }
      dabs.push(one)
    }
  }
  const end = samples.at(-1)
  if (to === Infinity && end.inkDistance > samples[0].inkDistance) {
    const one = dab(end, tangent[0], tangent[1], width, end.inkDistance, 'end', undefined, seed), last = dabs.at(-1)
    // 끝점 도장은 앞 도장과 떨어진 만큼만 묻힌다(그대로 찍으면 꼬리 끝에 진한 점이 남는다)
    if (B.retrace?.on && last) one.a *= clamp(Math.hypot(one.x - last.x, one.y - last.y) / step, 0, 1)
    dabs.push(one)
    // 48판 점 · 아주 짧은 획: 도장이 몇 개 안 쌓여 흐려지므로 탭처럼 그 자리에 채운다. 길이가 지름의 3/4 을 넘으면 사라진다(끝 구간은 늘 다시 그려서 뗀 순간의 모양이 그대로 남는다)
    if (B.deposit?.on) {
      const full = dab(end, tangent[0], tangent[1], width, 1e6, undefined, undefined, seed), fill = clamp(1 - (end.inkDistance - samples[0].inkDistance) / (1.5 * full.r), 0, 1)
      if (fill > 0) { full.a *= fill * Math.max(4, 2 * full.r / step); dabs.push(full) }
    }
  }
  return easeRetrace(dabs, step)
}

// 22판 'copy' 엔진 도장: 모양 도장(한 변 = 굵기 ÷ 모양 군집 폭 비율 × 필압 · 기울기), 획 방향으로 회전(모양의 세로가 진행 방향 — 목표 그림의 세로 획에서 결 긁힘이 가로로 보임), 알파 = 필압. 끝 가늘어짐(taper)은 안 쓴다(끝을 둥글게 — 6B 모양이 거의 원형). 진행 거리 번호로만 정해 쓰는 중 = 뗀 뒤
const copySide = width => width / B.copy.shapeFrac
export const copySpacing = width => Math.max(B.copy.minStep, copySide(width) * B.copy.spacing)
function copyDab(p, tx, ty, width, d, index) {
  const c = B.copy, side = copySide(width), pr = clamp(p.pressure ?? B.pressureBase, c.minPressure, 1)
  // 23판: 알파 = 바닥 + (1 − 바닥)·p^거듭제곱, 한 변 하한(군집 폭 minWidth 페이지 단위) — 약한 얇은 선이 사라지지 않게
  return { x: p.x, y: p.y, side: Math.max(c.minWidth / c.shapeFrac, side * (1 - c.pressureSize + c.pressureSize * pr) * (1 + c.tiltSize * tiltOf(p))), angle: Math.atan2(ty, tx) + c.angleOffset, a: c.alphaFloor + (1 - c.alphaFloor) * Math.pow(pr, c.alphaPow), i: index }
}
export function copyDabs(samples, width, from = -Infinity, to = Infinity) {
  const dabs = [], step = copySpacing(width)
  if (!samples.length) return dabs
  if (samples.length === 1) {
    for (let k = 0; k < 3; k++) dabs.push(copyDab(samples[0], 1, 0, width, 1e6 + k * step, 1e6 + k))
    return dabs
  }
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], d0 = a.inkDistance, d1 = b.inkDistance
    if (!(d1 > d0)) continue
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, last = i === samples.length - 1
    for (let k = Math.max(Math.ceil(d0 / step), Math.ceil(from / step)); k * step < Math.min(to, last ? d1 + 1e-9 : d1); k++) {
      const t = (k * step - d0) / (d1 - d0), lerp = key => a[key] != null && b[key] != null ? a[key] + (b[key] - a[key]) * t : b[key] ?? a[key]
      dabs.push(copyDab({ x: a.x + dx * t, y: a.y + dy * t, pressure: lerp('pressure'), tiltX: lerp('tiltX'), tiltY: lerp('tiltY') }, dx / length, dy / length, width, k * step, k))
    }
  }
  return dabs
}

// 구간(createStrokePreview) 하나가 맡는 진행 거리 [from, to): 이웃 구간과 문맥 점 하나씩 겹치므로 자기 몫만
export function partRange(part) {
  const from = part.key ? part.points[1]?.inkDistance ?? part.points[0].inkDistance : -Infinity
  const to = part.continuing ? part.points.at(-2).inkDistance : Infinity
  return [from, to]
}
// 획 전체 길이(끝 가늘어짐): 마지막 구간의 마지막 점. 끝난 구간은 모른다(Infinity) — 쓰는 중 · 뗀 뒤가 같게.
export const partTotal = part => part.continuing ? Infinity : part.points.at(-1)?.inkDistance ?? Infinity

// 도장을 찍을 곡선 표본(볼펜과 같은 이웃 점 가운데 2차 곡선, 간격 2). 센서 원값(force)이 있으면 지금 필압 곡선으로 다시 바꾸고
// (예전 곡선으로 저장된 획도 같은 손힘이면 같게), 필압이 없는 점(예전 획)은 기준값.
const BRUSH_STEP = 2
const based = p => !p ? p : Number.isFinite(p.force) ? { ...p, pressure: penPressure('pencil', 0, p.force) } : p.pressure == null ? { ...p, pressure: B.pressureBase } : p
export const brushPartSamples = part => curveOfPart({ ...part, points: part.points.map(based), curveBefore: based(part.curveBefore) }, BRUSH_STEP)
// 지우개 조각(sampled): 이미 곡선 표본이라 그대로
export const brushSampledPoints = (points, start = 0) => withDistances(points.map(based), start)

// 종이 결(앱 Skia): 최종 진하기 = clamp01(L1) × clamp01(L2), L = c0 + c1·a + c2·b + c3·h
// (a: 획 덮임, b: 필압 깊이 v 의 덮임 가중 평균 × a, h: 종이 결 0~1). L1 = 덮임으로 가장자리 자르기(a 0.8 → 1),
// L2 = 포토샵 Height(c0 + 10·깊이 − 결): 결 쪽 기울기 1 이라 몸통에서 결이 흰 구멍 · 회색 · 진한 흑연으로 이어진다.
// 런타임 이미지 필터는 Skia 가 확대를 못 다뤄 층을 페이지 단위 해상도로 그린 뒤 늘려 붙인다(결이 네모로 깨지고 펜을 떼면 결이 바뀌었다)
// → 층 두 겹 + 색 행렬로 화면 픽셀마다 계산한다: 안쪽 층(불투명 검정)에 도장을 (1, 0, v) 색으로 쌓아 R = a, B = b, 결을 더해(Plus) G = h
// → 행렬 1: R = L2, A = L1 → 바깥 층(불투명 검정)에 얹히며 R = 둘의 곱 → 행렬 2: A = R, 색 = 펜 색.
// 결(h): 방향 없는 종이 결 그림(PENCIL_GRAIN_PNG, 코덱스가 그린 '도화지에 연필을 고르게 문지른' 질감 512 반복 타일)을 기본층 0.8 +
// 1.74배 고운 층 0.2 로 읽는다. 좌표는 획 첫 점(origin) 기준이라 화면을 옮겨도 결이 미끄러지지 않고, 칸 크기에 확대 배율을 곱해
// 확대해도 화면에서 같은 크기다(확대가 바뀌면 다시 굽는다). 칸이 화면 1px 안팎이라 큐빅 보간.
export const PENCIL_PAPER_SKSL = `
uniform shader grain;
uniform float2 origin;
uniform float scale;
uniform float gLo;
uniform float gHi;
half4 main(float2 xy) {
  float2 p = (xy - origin) * scale;
  // 30판: 결에 굵은 옥타브(0.43배 = 칸 2.3px)를 섞는다 — 돔 가장자리가 1px 안개로 흩어지지 않고(에어브러시) 2~3px 덩어리 가루로 끊기게(참고 브러시의 가장자리 알갱이)
  float h = grain.eval(p).r;
  // 30판 실기(사용자 "다 쓴 사인펜"): 부드러운 결을 그대로 1차식에 넣으면 뿌연 얼룩(솜) — 종이 골/돌기로 양극화해(smoothstep) 흰 구멍과 흑연 알갱이 경계를 또렷하게
  h = smoothstep(gLo, gHi, h);
  return half4(0, h, 0, 1);
}`
// makeShaderWithChildren 순서대로: origin(2) · scale, 자식 = 결 타일(반복). zoom: 화면 확대 배율(기기 픽셀 배율 포함)
// 가닥: 리본 정점의 텍스처 좌표(진행 거리, 법선)를 그대로 읽는다
export const PENCIL_STRAND_SKSL = `
uniform shader grain;
uniform float scale;
uniform float gLo;
uniform float gHi;
half4 main(float2 xy) { return half4(0, smoothstep(gLo, gHi, grain.eval(xy * scale).r), 0, 1); }`
export const paperScale = (zoom = 1) => B.grainScale * Math.pow(1.75, 1 - (B.grainZoomPow ?? 1)) * Math.pow(zoom, B.grainZoomPow ?? 1)
export const strandUniforms = (zoom = 1, width = 5) => { const s = B.strand, [from, to, k] = s.wide; return [paperScale(zoom) * (1 + (k - 1) * clamp((width - from) / (to - from), 0, 1)), s.step[0], s.step[1]] }
export const paperUniforms = (origin, zoom = 1, width = 0) => { const w = B.strand?.toothWide, k = w ? 1 + (w[2] - 1) * clamp((width - w[0]) / (w[1] - w[0]), 0, 1) : 1; return [origin.x, origin.y, paperScale(zoom) * k, B.grainStep[0], B.grainStep[1]] }
// 색 행렬 두 개(Skia 4×5 행 우선, 마지막 칸은 0~1 더하기). 입력 R = a, G = h, B = b. rgb: 펜 색 0~1
// 29판: 흑연 농담 상수 c0 는 불투명도에 연동 — c0_eff = c0 + a + b·(1 − op) (a: 불투명도 1 에서의 보정, b: 불투명도가 내려갈수록 더 올림 → 0.8 에서 +0.10).
// 불투명도(획 전체 알파)만으로도 중간톤이 올라가므로 낮은 불투명도에서는 코어를 오히려 옅게 두지 않고 c0 를 올려 중간톤 55~65% 를 지킨다.
// 퇴적 모델의 굵기별 L2 계수(사이는 보간)
// 묻는 양의 필압 바닥: 굵기 2.5 → vFloor, 10 이상 → vFloorWide(사이 보간). 굵은 약한 선은 결 구멍이 커 바닥을 더 둔다
export const depositFloor = width => { const d = B.deposit, a = d.vFloor ?? 0, b = d.vFloorWide ?? a; return a + (b - a) * clamp((width - 2.5) / 7.5, 0, 1) }
export const depositLook = width => {
  const rows = B.deposit.l, first = rows[0], last = rows.at(-1)
  if (width <= first.width) return first.l2
  if (width >= last.width) return last.l2
  const i = rows.findIndex(row => row.width >= width), a = rows[i - 1], b = rows[i]
  return mix(a.l2, b.l2, (width - a.width) / (b.width - a.width))
}
// 윤곽 채널 배율: 도장의 윤곽 양 = 묻는 양 × gain(굵기로 보간)
export const depositGain = width => {
  const rows = B.deposit.l, first = rows[0], last = rows.at(-1)
  if (width <= first.width) return first.gain
  if (width >= last.width) return last.gain
  const i = rows.findIndex(row => row.width >= width), a = rows[i - 1], b = rows[i]
  return a.gain + (b.gain - a.gain) * (width - a.width) / (b.width - a.width)
}
// 윤곽 문턱 L1: 행에 l1 이 있으면 굵기로 보간(얇은 선은 완만하게 — 옆이 부드럽게 빠지고, 굵은 선은 가파르게 — 안개 띠가 없다)
export const depositGate = width => {
  const rows = B.deposit.l, first = rows[0], last = rows.at(-1)
  if (!first.l1) return B.deposit.l1
  if (width <= first.width) return first.l1
  if (width >= last.width) return last.l1
  const i = rows.findIndex(row => row.width >= width), a = rows[i - 1], b = rows[i]
  return mix(a.l1, b.l1, (width - a.width) / (b.width - a.width))
}
// 연필은 불투명도를 색 행렬이 맡는다(strokeSkia 는 획 전체 알파를 걸지 않는다)
export const pencilAccumulates = () => B.engine === 'own' && Boolean(B.deposit?.on && B.deposit.accumulate)
// L2 행: B 계수 × bGain, 쌓임이면 행 전체 × 불투명도
const buildRow = (row, op) => { const k = pencilAccumulates() ? op : 1; return [row[0] * k, row[1] * k, row[2] * (B.deposit.bGain ?? 1) * k, row[3] * k] }
export function paperMatrices(width, [r, g, b], opacity = 1) {
  const { l1: lookL1, l2: base, c0op } = brushLook(width), op = clamp(Number.isFinite(opacity) ? opacity : 1, 0, 1)
  const dep = B.deposit?.on
  const l2 = dep ? buildRow(depositLook(width), op) : [base[0] + c0op[0] + c0op[1] * Math.min(1 - op, B.c0opSpan), base[1], base[2], base[3]]
  // 'same': 진하기 = L × (m·L + 1 − m) — m = 1 이면 L²(31판), m 을 내리면 문턱이 완만해져 약한 필압이 덩어리 · 점으로 갈리지 않는다(테스트 담당 32: 실측 약한 손힘 .62 에서 큰 구멍 54%)
  const m = B.deposit.l1Mix ?? 1
  const l1 = !dep ? lookL1 : B.deposit.l1 === 'same' ? [l2[0] * m + (1 - m), l2[1] * m, l2[2] * m, l2[3] * m] : depositGate(width)
  return [
    [l2[1], l2[3], l2[2], 0, l2[0], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, l1[1], l1[3], l1[2], 0, l1[0]],
    [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 1, 0, 0, 0, 0],
  ]
}
