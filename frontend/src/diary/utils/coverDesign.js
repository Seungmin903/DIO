import { COLORS, DIARY_DEFAULTS } from '../constants.js'
import { createId, normalizeAngle } from '../../editor/utils/common.js'
import { TEXT_FONTS, getTextFonts, resolveFontId } from '../../editor/utils/text.js'

// 표지 요소를 하나씩 따로 고른다: 바탕(색 · 그라데이션 · 패턴 또는 사진) · 고무줄 · 제목 · 소제목 · 라벨 · 스티커.
// 표지를 빼도(enabled = false) 설정은 남겨 두어 다시 켜면 그대로 돌아온다.
// 예전 다이어리는 color · pattern 만 있으므로 그 값으로 표지를 만든다.
export const COVER_COLORS = COLORS.map(({ label, value }) => [label, value])
export const COVER_PATTERNS = [['none', '없음'], ['linen', '린넨'], ['leather', '레더'], ['dot', '도트'], ['gingham', '깅엄'], ['stripe', '스트라이프'], ['check', '체크'], ['moa', '모아'], ['dio', '디오']]
// 고르는 칸에서 뺀 무늬. 이미 고른 표지는 그대로 그리고, 그 표지를 고칠 때만 칸에 보인다.
export const RETIRED_PATTERNS = new Set(['leather'])
// 캐릭터 무늬: 반복 타일이 아니라 윤곽선 캐릭터 하나를 표지 오른쪽 아래 가장자리에 크게 걸쳐 표지 색 계열로 찍는다(형압처럼).
export const CHARACTER_PATTERNS = new Set(['moa', 'dio'])
// 편집기 텍스트 도구와 같은 글씨체 (editor/utils/text.js TEXT_FONTS 의 id)
// 표지 제목 글씨체는 편집기 텍스트 도구와 같은 목록(앱 글꼴 + 내 폰트)이다. 내 폰트는 목록을 불러오기 전에도 id 모양으로 받아 둔다
const coverFont = id => (TEXT_FONTS.some(font => font.id === id) || /^personal-[a-f0-9-]{36}$/.test(id ?? '') ? id : 'nanum-gothic')
export const INK_COLORS = [['흰색', '#FFFFFF'], ['먹색', '#3B3F4A'], ['네이비', '#0B1766'], ['파랑', '#606BB2'], ['빨강', '#C8423F'], ['초록', '#2F6B4F']]
// 색 견본은 한 줄 6색 + 직접 고르기로 맞춘다
export const SUBTITLE_COLORS = [['회색', '#9A9DA6'], ...INK_COLORS.slice(0, 5)]
// 고무줄 색 'auto' 는 표지 색을 어둡게 한 색 (CoverArt 에서 계산)
export const BAND_COLORS = [['네이비', '#7D88B5'], ['흰색', '#FFFFFF'], ['먹색', '#3B3F4A'], ['빨강', '#C8423F'], ['카멜', '#B5835A']]
export const PLATES = [['paper', '종이 라벨'], ['ribbon', '띠지'], ['none', '없음']]
// 화면에서 고르는 라벨 모양. '없음'은 라벨 줄의 스위치로 끈다(plate = 'none'). 끄기 전 모양은 plateStyle 에 남는다.
export const PLATE_SHAPES = PLATES.filter(([id]) => id !== 'none')
// 띠지 종이색. 책 띠지처럼 밝은 종이 셋과 짙은 종이 둘을 둔다. 글씨 색은 '글'에서 따로 고른다.
export const RIBBON_COLORS = [['아이보리', '#F3F2ED'], ['크라프트', '#D9C4A3'], ['연회색', '#E3E5EA'], ['먹색', '#3B3F4A'], ['네이비', '#0B1766']]
export const ANCHORS = [['tl', '왼쪽 위'], ['tc', '가운데 위'], ['tr', '오른쪽 위'], ['ml', '왼쪽 가운데'], ['mc', '한가운데'], ['mr', '오른쪽 가운데'], ['bl', '왼쪽 아래'], ['bc', '가운데 아래'], ['br', '오른쪽 아래']]
// 바탕 그라데이션. 색 · 패턴 표지의 바탕색에서 단색 대신 고른다. [이름, 위→아래 색]
// 표지에는 번호(이 배열의 순서)로 저장된다. 출시된 앱에서 이미 고른 표지가 다른 색으로 바뀌지 않도록
// 앞의 6개(예전 프리셋)는 번호 · 색 · 그리는 방식을 그대로 두고 고르는 칸에서만 뺀다. 새 프리셋은 맨 뒤에만 덧붙인다(순서 변경 · 중간 삭제 금지).
const LEGACY_GRADIENTS = [
  ['노을', ['#F6C9B8', '#F3D9C2', '#C7CCE9', '#9DA5D8']],
  ['숲', ['#DCEBD0', '#9CC29A', '#4E7D5B']],
  ['모래', ['#FBEFD9', '#F0D3A8', '#C99E6E']],
  ['밤하늘', ['#1F2A5A', '#3B4C8C', '#8A7DB8']],
  ['벚꽃', ['#FDE3EA', '#F7B9CB']],
  ['바다', ['#CFEAF6', '#8CCBE6', '#3E8DB8']],
]
/** 고르는 칸에 보이는 첫 번호. 그 앞은 예전 프리셋(저장된 표지를 그릴 때만 쓴다) */
export const GRADIENT_PICK_FROM = LEGACY_GRADIENTS.length
/** 예전 프리셋인지: 저장 당시처럼 고른 색만 잇고(물감 섞기 없이) 고르는 칸에는 내지 않는다 */
export const isLegacyGradient = gradient => Number.isInteger(gradient) && gradient < GRADIENT_PICK_FROM
// 고르는 칸에서 뺀 새 프리셋(번호는 그대로 둔다): 블루그레이(9번). 이미 고른 표지는 그대로 그린다.
const RETIRED_GRADIENTS = new Set([9])
/** 고르는 칸에 내는 그라데이션인지 */
export const isPickableGradient = gradient => !isLegacyGradient(gradient) && !RETIRED_GRADIENTS.has(gradient)
// 고르는 프리셋: 하드커버 다이어리 표지 컨셉 — 천(클로스) · 종이 싸개 · 레더처럼 실제 문구점 표지에 있을 법한 차분한 색(코덱스 자문 2026-10-31).
// 띠지 · 진한 글씨 · 고무줄이 올라가도 읽히는 밝기. 1~4번은 한 색의 농담(위 밝음 → 아래 진함), 5~7번은 서로 다른 두 색이 물감처럼 섞인다.
// 첫 번째(로즈핑크)가 가장 먼저 보이는 기본 후보.
export const COVER_GRADIENTS = [
  ...LEGACY_GRADIENTS,
  ['로즈핑크', ['#F4C9D2', '#E8A8B7', '#C9788D']],
  ['세이지', ['#D4DFC9', '#AEC39D', '#78966F']], // 염색 클로스 같은 녹색
  ['라일락', ['#DDD1E6', '#BCA7CE', '#89719F']],
  ['블루그레이', ['#CEDAE0', '#A5BBC5', '#718F9C']], // 종이 싸개 · 패브릭의 푸른 회색
  ['스트로베리 클라우드', ['#F3A8BB', '#B9C0EE']], // 딸기 → 하늘(색은 코덱스 2026-11-01)
  ['피치 셔벗', ['#F49D7D', '#F0ABC4']], // 피치 → 핑크
  ['민트 스카이', ['#70CFBB', '#B0BCEB']], // 민트 → 라벤더
]
// 직접 고르는 그라데이션의 처음 두 색 (위 → 아래)
export const CUSTOM_GRADIENT = ['#F3D9C2', '#9DB6DA']
/** 바탕 그라데이션의 고른 색 (위 → 아래). 단색이면 null */
export function gradientKeys(cover) {
  if (cover.kind !== 'plain' || cover.gradient == null) return null
  if (cover.gradient === 'custom') return cover.gradientColors ?? CUSTOM_GRADIENT
  return COVER_GRADIENTS[cover.gradient]?.[1] ?? null
}
/** 그릴 그라데이션 색 (위 → 아래, 물감처럼 섞은 중간색까지 촘촘히). 단색이면 null. 예전 프리셋은 저장 당시 모습 그대로 고른 색만 잇는다 */
export function gradientStops(cover) {
  const keys = gradientKeys(cover)
  if (!keys) return null
  return isLegacyGradient(cover.gradient) ? keys : paintStops(keys)
}

// 물감 섞기: 색을 빛(RGB 평균)이 아니라 물감처럼 섞는다. 파랑 + 노랑이 회색이 아니라 초록 쪽으로 간다.
// 쿠벨카-뭉크 혼합을 채널마다 근사한다: 선형 반사율 R → 흡수/산란 비 K/S = (1-R)²/2R 를 섞고 다시 R 로 되돌린다.
const toLinear = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const toGamma = v => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)))
const toKS = r => { const R = Math.min(0.999, Math.max(0.001, r)); return (1 - R) ** 2 / (2 * R) }
const fromKS = ks => 1 + ks - Math.sqrt(ks * ks + 2 * ks)
/** 두 색을 물감처럼 섞는다(t = 0 이면 from, 1 이면 to) */
export function paintMix(from, to, t) {
  const channel = (hex, i) => toLinear(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16))
  return '#' + [0, 1, 2].map(i => toGamma(fromKS(toKS(channel(from, i)) * (1 - t) + toKS(channel(to, i)) * t)).toString(16).padStart(2, '0')).join('').toUpperCase()
}
/** 고른 색 사이를 물감 섞기로 촘촘히 채운 색 목록(같은 간격). SVG 그라데이션은 RGB 로만 섞어서 중간색을 직접 넣어 준다 */
export function paintStops(keys, steps = 8) {
  if (keys.length < 2) return keys
  const out = [keys[0]]
  for (let i = 0; i < keys.length - 1; i += 1) {
    for (let k = 1; k <= steps; k += 1) out.push(k === steps ? keys[i + 1] : paintMix(keys[i], keys[i + 1], k / steps))
  }
  return out
}
export const TITLE_SIZE = { min: 8, max: 48 }
export const SUBTITLE_SIZE = { min: 6, max: 24 }
export const STICKER_SIZE = { min: 6, max: 50 }

const PLAIN_TITLE = '#3B3F4A'
const hex = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback
const pick = (value, list, fallback) => list.some(([id]) => id === value) ? value : fallback
const size = (value, { min, max }, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
const percent = (value, fallback) => Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback

export function defaultCover({ color = DIARY_DEFAULTS.color, pattern = DIARY_DEFAULTS.pattern, dateMode } = {}) {
  return {
    // 도트 · 깅엄 · 스트라이프는 예전 표지처럼 밝은 무늬로 시작한다.
    enabled: true, kind: 'plain', color, gradient: null, gradientColors: CUSTOM_GRADIENT, pattern: { type: pattern || 'none', tone: ['dot', 'gingham', 'stripe'].includes(pattern) ? 'light' : 'dark' }, photo: null,
    band: { on: true, dir: 'v', pos: 'near', color: 'auto' }, plate: 'ribbon', plateStyle: 'ribbon', ribbon: { color: RIBBON_COLORS[0][1] },
    title: { useName: true, text: '', font: 'nanum-gothic', size: 17, color: PLAIN_TITLE, anchor: 'bc', at: null },
    subtitle: { on: true, text: `DIARY · ${dateMode === 'undated' ? '만년형' : '2026'}`, size: 7, color: '#9A9DA6' }, // 조밀한 서점 라벨 비율(코덱스 2026-11-01)
    stickers: [],
  }
}

/**
 * 새 다이어리의 처음 표지: 무늬 없음, 종이 라벨은 왼쪽 가운데.
 * 예전 다이어리를 읽을 때 쓰는 defaultCover(표지 값이 없던 다이어리는 예전처럼 린넨 · 띠지)와 나눠 둔다.
 */
export function newDiaryCover(options) {
  const base = defaultCover(options)
  return { ...base, pattern: { type: 'none', tone: 'dark' }, plate: 'paper', plateStyle: 'paper', title: { ...base.title, anchor: 'tl' } }
}

/** 저장된 다이어리 → 그릴 수 있는 표지. 값이 빠지거나 잘못되면 기본값으로 채운다. */
export function normalizeCover(diary) {
  const base = defaultCover({ color: hex(diary?.color, DIARY_DEFAULTS.color), pattern: diary?.pattern ?? null, dateMode: diary?.templateConfig?.dateMode })
  const saved = diary?.cover
  if (!saved || typeof saved !== 'object') return base
  const photo = saved.photo && typeof saved.photo.src === 'string' ? { src: saved.photo.src, mediaFileId: saved.photo.mediaFileId, aspect: saved.photo.aspect, ...(/^#[0-9A-F]{6}$/i.test(saved.photo.tone ?? '') ? { tone: saved.photo.tone.toUpperCase() } : {}) } : null
  // 예전 '예시 사진'(내 사진 없는 사진 표지)은 같은 그라데이션 바탕의 색 표지로 읽는다.
  const oldSample = saved.kind === 'photo' && !photo && Number.isInteger(saved.photo?.sample) ? saved.photo.sample : null
  const gradient = Number.isInteger(saved.gradient) ? saved.gradient : oldSample
  return {
    enabled: saved.enabled !== false,
    kind: saved.kind === 'photo' && photo ? 'photo' : 'plain',
    color: hex(saved.color, base.color),
    gradient: saved.gradient === 'custom' || gradient != null && gradient >= 0 && gradient < COVER_GRADIENTS.length ? (saved.gradient === 'custom' ? 'custom' : gradient) : null,
    gradientColors: Array.isArray(saved.gradientColors) && saved.gradientColors.length === 2 ? saved.gradientColors.map((value, i) => hex(value, CUSTOM_GRADIENT[i])) : CUSTOM_GRADIENT,
    pattern: { type: pick(saved.pattern?.type, COVER_PATTERNS, 'none'), tone: saved.pattern?.tone === 'light' ? 'light' : 'dark' },
    photo,
    band: { on: saved.band?.on !== false, dir: saved.band?.dir === 'h' ? 'h' : 'v', pos: saved.band?.pos === 'center' ? 'center' : 'near', color: saved.band?.color === 'auto' ? 'auto' : hex(saved.band?.color, base.band.color) },
    plate: pick(saved.plate, PLATES, base.plate),
    plateStyle: pick(saved.plateStyle ?? (saved.plate !== 'none' ? saved.plate : null), PLATE_SHAPES, base.plateStyle),
    ribbon: { color: RIBBON_COLORS.some(([, color]) => color === hex(saved.ribbon?.color)) ? hex(saved.ribbon.color) : base.ribbon.color },
    title: {
      useName: saved.title?.useName !== false, text: typeof saved.title?.text === 'string' ? saved.title.text.slice(0, 24) : '',
      font: coverFont(resolveFontId(saved.title?.font)), size: size(saved.title?.size, TITLE_SIZE, 17),
      color: hex(saved.title?.color, PLAIN_TITLE), anchor: pick(saved.title?.anchor, ANCHORS, base.title.anchor),
      at: Number.isFinite(saved.title?.at?.x) && Number.isFinite(saved.title?.at?.y) ? { x: percent(saved.title.at.x, 0), y: percent(saved.title.at.y, 0) } : null,
    },
    subtitle: {
      on: saved.subtitle?.on !== false, text: typeof saved.subtitle?.text === 'string' ? saved.subtitle.text.slice(0, 30) : base.subtitle.text,
      size: size(saved.subtitle?.size, SUBTITLE_SIZE, 8), color: hex(saved.subtitle?.color, base.subtitle.color),
    },
    stickers: (Array.isArray(saved.stickers) ? saved.stickers : []).filter(item => item && typeof item.id === 'string' && (item.asset || item.src)).map(item => ({
      id: item.id, asset: item.asset, src: item.src, mediaFileId: item.mediaFileId, name: item.name,
      x: percent(item.x, 50), y: percent(item.y, 50), size: size(item.size, STICKER_SIZE, 14),
      rotation: Number.isFinite(item.rotation) ? Math.round(normalizeAngle(item.rotation) * 10) / 10 : 0,
    })),
  }
}

/**
 * 편집기 상단바 탭의 색 띠 ({ color, stops }). 표지에 실제로 보이는 색을 따라간다.
 * 그라데이션 표지는 위 → 아래 색 전체(stops), 사진 표지는 사진 대표 색, 그 밖은 바탕색이다.
 * diary.color 는 그라데이션이나 사진을 골라도 예전 단색 그대로라서 그것만 쓰면 표지와 다른 색이 나온다.
 * 색은 normalizeCover 가 #RRGGBB 로 맞춘 값이라 그대로 스타일 문자열에 이어 붙여도 안전하다. 그라데이션은 색이 둘 이상일 때만 쓴다.
 */
export function coverTabPaint(diary) {
  const cover = normalizeCover(diary)
  if (!cover.enabled) return { color: cover.color, stops: null }
  const stops = gradientKeys(cover) // 얇은 띠라 고른 색만 쓴다(스타일 문자열에 이어 붙이는 값)
  if (stops?.length >= 2) return { color: stops[0], stops }
  return { color: cover.kind === 'photo' && cover.photo?.tone ? cover.photo.tone : cover.color, stops: null }
}

/** 표지 스티커 복제: 새 ID 로 오른쪽 아래에 조금 비켜 둔다 (편집기 복제와 같은 방향) */
export function createStickerCopy(item) {
  return { ...item, id: createId(), x: Math.min(100, item.x + 4), y: Math.min(100, item.y + 4) }
}

/** 표지 종류는 바탕만 바꾼다. 고무줄 · 글 · 라벨 · 스티커는 종류를 오가도 그대로 둔다. */
export function changeCoverKind(cover, kind) {
  if (kind === 'none') return { ...cover, enabled: false }
  return { ...cover, enabled: true, kind }
}

// 두 색을 t(0~1) 비율로 섞는다. 고무줄 색 · 가장자리 선을 만든다.
/** '#RRGGBB' 의 상대 휘도(WCAG, 0~1) */
export const relativeLuminance = hex => {
  const channel = shift => { const v = ((parseInt(hex.slice(1), 16) >> shift) & 255) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
};

export function mix(from, to, t) {
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t).toString(16).padStart(2, '0')).join('').toUpperCase()
}

const toHsl = hex => {
  const [r, g, b] = [0, 1, 2].map(i => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
const fromHsl = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// 고무줄 '맞춤' 색(사용자 지시 2026-10-31): 표지 전체의 대표색보다 살짝 진하게. 색조 · 채도는 대표색 그대로 두고 밝기만 낮춘다
// (아주 어두운 표지는 반대로 살짝 밝게). 진한 남색을 섞던 예전 방식은 밝은 표지가 모두 회색이 됐다.
// 그려진 표지의 대표색보다 아주 살짝만 어둡게(사용자 지시): 밝기 0.035 낮춤. 아주 밝은 표지만 흰 띠지와 구분되게 0.05.
function bandTone(hex) {
  const [h, s, l] = toHsl(hex)
  return fromHsl(h, s, l < 0.3 ? l + 0.04 : Math.max(0, l - (l > 0.85 ? 0.05 : 0.035)))
}

// 그라데이션은 끝 색 하나가 아니라 전체를 대표하는 색(선형 RGB 평균)을 기준으로 한다. 끝 색만 따르면 반대쪽 색과 튄다.
function averageColor(stops) {
  const linear = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const gamma = v => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055))
  const sums = [0, 1, 2].map(i => stops.reduce((sum, hex) => sum + linear(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)), 0) / stops.length)
  return '#' + sums.map(v => gamma(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// 무늬가 표지를 실제로 덮는 양: 무늬 타일(CoverPattern)의 면적 × 투명도를 겹침까지 계산한 값. 무늬 색은 어두운 무늬 #0B1766 · 밝은 무늬 흰색.
// CoverPattern 의 타일 · 투명도를 바꾸면 이 표도 다시 잰다.
const PATTERN_COVERAGE = {
  dark: { linen: 0.042, leather: 0.011, dot: 0.012, gingham: 0.069, stripe: 0.051, check: 0.020 },
  light: { linen: 0.129, leather: 0.036, dot: 0.043, gingham: 0.208, stripe: 0.162, check: 0.062 },
}

/**
 * 표지 전체의 대표색: 그려진 표지의 평균색. 바탕(단색, 그라데이션은 색들의 선형 평균)에 무늬가 실제로 덮는 만큼(PATTERN_COVERAGE) 무늬 색을 섞는다.
 * 사진 표지는 사진의 대표 색(photo.tone, 사진을 고를 때 뽑는다), 아직 없으면 null.
 */
export function coverTone(cover) {
  if (cover.kind === 'photo') return cover.photo?.tone ?? null
  const stops = gradientStops(cover)
  const base = stops ? averageColor(stops) : cover.color
  const light = cover.pattern?.tone === 'light'
  const coverage = PATTERN_COVERAGE[light ? 'light' : 'dark'][cover.pattern?.type]
  return coverage ? mix(base, light ? '#FFFFFF' : '#0B1766', coverage) : base
}

/**
 * 캐릭터 무늬의 윤곽선 색: 표지 대표색과 같은 색조로 명도만 옮겨 표지에 녹아든 형압처럼 보이게 한다.
 * 무늬 톤이 '어둡게'면 진하게, '밝게'면 옅게(아주 어두운 표지는 어둡게여도 밝게). 대표색이 없는 사진 표지는 흰색.
 */
export function coverLineColor(cover) {
  const tone = coverTone(cover)
  if (!tone) return '#FFFFFF'
  const [h, s, l] = toHsl(tone)
  const lighter = cover.pattern?.tone === 'light' || l < 0.3
  return fromHsl(h, Math.min(1, s + 0.05), lighter ? Math.min(1, l + 0.16) : Math.max(0, l - 0.16))
}

/** 고무줄 색 'auto': 표지 대표색(coverTone)보다 살짝 진하게. 대표색이 없는 사진 표지는 기본 남색. */
export function bandAutoColor(cover) {
  const tone = coverTone(cover)
  return tone ? bandTone(tone) : '#7D88B5'
}

export const coverTitle =(cover, name) => cover.title.useName ? (name?.trim() || DIARY_DEFAULTS.title) : cover.title.text

const label = (list, value) => list.find(([id, , color]) => id === value || color === value)?.[1]
const colorName = (list, value) => list.find(([, color]) => color.toUpperCase() === String(value).toUpperCase())?.[0] ?? value

const anchorName = cover => cover.title.at ? '옮긴 자리' : label(ANCHORS, cover.title.anchor)

/** 요소 줄 오른쪽에 늘 보이는 요약 */
export function coverElementSummary(cover, element) {
  switch (element) {
    case 'base': return cover.kind === 'photo' ? (cover.photo?.src ? '내 사진' : '사진 없음') : `${cover.gradient === 'custom' ? '직접 고른 그라데이션' : cover.gradient != null ? COVER_GRADIENTS[cover.gradient][0] : colorName(COVER_COLORS, cover.color)} · ${label(COVER_PATTERNS, cover.pattern.type)}`
    case 'band': return cover.band.on ? (cover.band.dir === 'v' ? '세로' : '가로') : '꺼짐'
    case 'text': return `${getTextFonts().find(font => font.id === cover.title.font)?.label ?? '내 폰트'}${cover.subtitle.on && cover.subtitle.text ? ' · 소제목' : ''}`
    case 'plate': if (cover.plate === 'none') return '꺼짐'
      return `${cover.plate === 'ribbon' ? `띠지 · ${colorName(RIBBON_COLORS, cover.ribbon.color)}` : label(PLATES, cover.plate)} · ${anchorName(cover)}`
    case 'stickers': return cover.stickers.length ? `${cover.stickers.length}개` : '없음'
    default: return ''
  }
}

export const coverSummary = cover => !cover.enabled ? '표지 없음' : cover.kind === 'photo' ? '사진 표지' : '색 · 무늬 표지'
