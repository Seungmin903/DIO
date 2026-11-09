// 앱 시작 인트로(BootSplash) 시간표. 지라 589 "모아 갑툭튀" — 예고 → 등장 → 갸우뚱 → DIO 손글씨.
// 시안 · 근거: 저장소 밖 '인트로 구상' 폴더의 G2 안(코덱스 검수 값). 길이 단위는 size(큰 모아 그림 한 변), 시간은 ms.
//   0.25~0.6초  모서리에서 책갈피 · 표지 끝만 빼꼼(폰은 눈 하나까지), 0.36초 책 모서리 위로 효과선 두 줄 '뾱'
//   0.62~0.9초  -2° 두리번, 0.9~0.98초 살짝 움츠림(0.96배)
//   0.98~1.58초 지금 자리까지 올라옴(살짝 넘쳤다 제자리)
//   1.68~2.13초 8° 갸우뚱
//   2.19~2.89초 D · I · O 를 글자마다 펜을 떼며 손글씨처럼 씀, 0.45초 멈춘 뒤 앱으로
export const BOOT_INTRO_TOTAL = 3340;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const outCubic = p => 1 - Math.pow(1 - p, 3);
const inOut = p => -(Math.cos(Math.PI * p) - 1) / 2;
const outBack = (p, s) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);

// 큰 모아 자세: x · y 는 size 비율 이동, r 은 회전(도), k 는 크기
export function moaAt(t) {
  let x = -0.86, y = 0.65, r = 0, k = 1;
  if (t >= 250) { const p = outCubic(seg(t, 250, 600)); x = lerp(-0.86, -0.30, p); y = lerp(0.65, 0.18, p); }
  if (t >= 620 && t < 900) { const p = seg(t, 620, 900); r = -2 * Math.sin(2 * Math.PI * p) * (1 - p); }
  if (t >= 900) { const p = inOut(seg(t, 900, 980)); x = lerp(-0.30, -0.36, p); y = lerp(0.18, 0.24, p); k = lerp(1, 0.96, p); }
  if (t >= 980) { const p = outBack(seg(t, 980, 1580), 1.1); x = lerp(-0.36, 0, p); y = lerp(0.24, 0, p); k = lerp(0.96, 1, clamp(p)); }
  if (t >= 1680) r = 8 * inOut(seg(t, 1680, 2130));
  return { x, y, r, k };
}

// 뾱 효과선 두 줄. 빼꼼 자세에서 그림 비율 (0.90, 0.30) 자리(책 오른쪽 위 모서리) 바깥으로 튄다.
export const POP_LINES = { start: 360, duration: 260, angles: [-30, -68], from: 0.04, length: 0.07, width: 0.016, anchor: { u: 0.90, v: 0.30 }, pose: { x: -0.30, y: 0.18 } };
// 선이 앞 45% 동안 바깥으로 뻗고, 뒤 55% 동안 끝 쪽으로 빨려 들어가며 사라진다. tail · head 는 기준점에서 size 비율 거리
export function popLineAt(t) {
  const { start, duration, from, length } = POP_LINES;
  const p = seg(t, start, start + duration);
  if (p <= 0 || p >= 1) return { tail: from, head: from, visible: false };
  if (p < 0.45) return { tail: from, head: from + length * outCubic(p / 0.45), visible: true };
  const q = (p - 0.45) / 0.55;
  return { tail: lerp(from, from + length * 1.25, inOut(q)), head: from + length * (1 + 0.25 * outCubic(q)), visible: true };
}

// DIO 글자별 쓰는 시간 칸: D 230 · 쉼 70 · I 90 · 쉼 70 · O 240ms
export const LETTER_SLOTS = [[2190, 2420], [2490, 2580], [2650, 2890]];
export const letterAt = (t, index) => inOut(seg(t, ...LETTER_SLOTS[index]));

// Animated.interpolate 에 넣을 표본. 곡선을 step(ms) 간격으로 찍어 네이티브 드라이버에서도 같은 움직임이 나오게 한다
export function sample(fn, from = 0, to = BOOT_INTRO_TOTAL, step = 20) {
  const inputRange = [], outputRange = [];
  for (let t = from; t < to; t += step) { inputRange.push(t); outputRange.push(fn(t)); }
  inputRange.push(to); outputRange.push(fn(to));
  return { inputRange, outputRange, extrapolate: 'clamp' };
}

// 뒤에서 도는 무거운 작업(예전 문서 옮기기)을 인트로 손글씨와 겹치지 않게 미루는 문.
// '시간이 됐다(due)'와 '손글씨가 끝났다 · 인트로가 없다(introDone)' 둘 다 오면 start 를 딱 한 번 부른다.
// 인트로가 아예 안 나오는 경우(동작 줄이기 · 이미지 오류 · 8초 제한 · 목업)는 시작 화면이 닫힐 때 introDone 이 온다.
export function createAfterIntroGate(start) {
  const state = { due: false, introDone: false, started: false };
  const tryStart = () => {
    if (state.started || !state.due || !state.introDone) return;
    state.started = true;
    start();
  };
  return {
    due() { state.due = true; tryStart(); },
    introDone() { state.introDone = true; tryStart(); },
  };
}

// 한 글자 안의 여러 획(D = 세로획 → 둥근 배)을 길이 비율로 나눠 앞 획을 다 쓴 뒤 다음 획을 쓴다.
// 반환: 획마다 글자 진행도에서 차지하는 [시작, 끝] 비율
export function strokeSpans(strokes) {
  const total = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  let at = 0;
  return strokes.map(stroke => { const span = [at / total, (at + stroke.length) / total]; at = span[1] * total; return span; });
}
// 글자 진행도(0~1)에서 그 획의 진행도
export const strokeAt = (letterProgress, [from, to]) => clamp((letterProgress - from) / (to - from));
