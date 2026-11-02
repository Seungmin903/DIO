// 공유 참여자 기본 프로필 색: 서버가 참여자마다 뽑아 주는 memberColor(각 채널 64~208 완전 랜덤 RGB)를
// 미리 정한 24색(밝은 12 · 어두운 12) 중 하나로 맞춰 쓴다. 같은 서버 색은 늘 같은 색이 된다.
//
// 24색: OKLCH(사람 눈에 고른 밝기 · 채도 · 색상) 색상환을 12등분하고, 칙칙해지는 자리만 색상 위치를 살짝 옮겼다.
//  - 밝은 12색: 명도 0.86 · 채도 0.09(파랑 · 남색 · 분홍 쪽은 sRGB 한계로 0.07~0.08). 표정은 네이비(colors.text), 대비 9.9:1 이상.
//    노랑 85°(버터) · 연두 115° 로 옮겨 카키빛을 피했다.
//  - 어두운 12색: 명도 0.55 · 채도 0.11(청록 200° 만 sRGB 한계로 0.092). 표정은 흰색, 대비 4.5:1 이상.
//    노랑은 머스터드(88°)까지만 두고, 칙칙한 올리브(100~130°)는 건너뛰어 잎새색 135° 부터 초록 · 청록을 30° 넘게 벌렸다.
// 등장 비율: 서버 랜덤색은 색상환 위에 고르지 않게 퍼져 있다. 그래서 12칸 경계(HUE_BOUNDS)를 서버 색 분포의 12분위로,
// 밝음 · 어두움 기준(LIGHT_FROM)을 칸마다 서버 색 명도의 중앙값으로 미리 계산해 24색이 거의 같은 비율(약 1/24)로 나온다.
// 회색(채도가 거의 없는 서버 색)은 색상이 의미 없어 서버 값으로 24색 중 하나를 고른다.

export const LIGHT_AVATAR_COLORS = ['#FFBDC1', '#FEC1A6', '#ECCD8C', '#CFD994', '#B2E0A8', '#97E4C2', '#85E4E3', '#8EDEFE', '#B3D4FF', '#CBCBFE', '#E8C0FA', '#FDBADF'];
export const DARK_AVATAR_COLORS = ['#A8545D', '#A7593D', '#9F6122', '#8C6D08', '#54803A', '#158561', '#088187', '#0A7CA6', '#4D70B2', '#7165AD', '#8C5B9B', '#9F557F'];
const HUE_BOUNDS = [32.9, 87.3, 118.4, 136.7, 148.3, 170.4, 213.8, 266.6, 291.4, 315, 334];
const LIGHT_FROM = [0.587, 0.65, 0.733, 0.725, 0.704, 0.706, 0.71, 0.623, 0.531, 0.56, 0.605, 0.599];
const GREY_CHROMA = 0.03;

const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const channels = hex => [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

function oklch(hex) {
  const [r, g, b] = channels(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(a, bb), H: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

const luminance = hex => {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** 두 색의 대비(WCAG) */
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** 서버 참여자 색 → { fill, light }. light 면 밝은 바탕이라 표정을 진한 색(colors.text)으로 그린다. 잘못된 값이면 null */
export function memberAvatarTone(value) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  const { L, C, H } = oklch(value);
  if (C < GREY_CHROMA) {
    const pick = ((parseInt(value.slice(1), 16) * 2654435761) >>> 0) % 24;
    return pick < 12 ? { fill: LIGHT_AVATAR_COLORS[pick], light: true } : { fill: DARK_AVATAR_COLORS[pick - 12], light: false };
  }
  const index = HUE_BOUNDS.filter(bound => H >= bound).length;
  const light = L >= LIGHT_FROM[index];
  return { fill: (light ? LIGHT_AVATAR_COLORS : DARK_AVATAR_COLORS)[index], light };
}
