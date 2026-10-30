import { COLORS, DIARY_DEFAULTS } from '../constants.js'
import { createId, normalizeAngle } from '../../editor/utils/common.js'

// 표지 요소를 하나씩 따로 고른다: 바탕(색 · 그라데이션 · 패턴 또는 사진) · 고무줄 · 제목 · 소제목 · 라벨 · 스티커.
// 표지를 빼도(enabled = false) 설정은 남겨 두어 다시 켜면 그대로 돌아온다.
// 예전 다이어리는 color · pattern 만 있으므로 그 값으로 표지를 만든다.
export const COVER_COLORS = COLORS.map(({ label, value }) => [label, value])
export const COVER_PATTERNS = [['none', '없음'], ['linen', '린넨'], ['leather', '레더'], ['dot', '도트'], ['gingham', '깅엄'], ['stripe', '스트라이프'], ['check', '체크']]
// 편집기 텍스트 도구와 같은 글씨체 (editor/utils/text.js TEXT_FONTS 의 id)
export const COVER_FONTS = [['sans', '기본 고딕'], ['serif', '기본 명조'], ['nanum-gothic', '나눔고딕'], ['nanum-myeongjo', '나눔명조'], ['nanum-pen', '나눔손글씨 펜'], ['poor-story', '푸어스토리']]
export const INK_COLORS = [['흰색', '#FFFFFF'], ['먹색', '#3B3F4A'], ['네이비', '#0B1766'], ['파랑', '#606BB2'], ['빨강', '#C8423F'], ['초록', '#2F6B4F']]
// 색 견본은 한 줄 6색 + 직접 고르기로 맞춘다
export const SUBTITLE_COLORS = [['회색', '#9A9DA6'], ...INK_COLORS.slice(0, 5)]
// 고무줄 색 'auto' 는 표지 색을 어둡게 한 색 (CoverArt 에서 계산)
export const BAND_COLORS = [['네이비', '#7D88B5'], ['흰색', '#FFFFFF'], ['먹색', '#3B3F4A'], ['빨강', '#C8423F'], ['카멜', '#B5835A']]
export const PLATES = [['paper', '종이 라벨'], ['ribbon', '띠지'], ['none', '없음']]
// 띠지 종이색. 책 띠지처럼 밝은 종이 셋과 짙은 종이 둘을 둔다. 글씨 색은 '글'에서 따로 고른다.
export const RIBBON_COLORS = [['아이보리', '#F3F2ED'], ['크라프트', '#D9C4A3'], ['연회색', '#E3E5EA'], ['먹색', '#3B3F4A'], ['네이비', '#0B1766']]
export const ANCHORS = [['tl', '왼쪽 위'], ['tc', '가운데 위'], ['tr', '오른쪽 위'], ['ml', '왼쪽 가운데'], ['mc', '한가운데'], ['mr', '오른쪽 가운데'], ['bl', '왼쪽 아래'], ['bc', '가운데 아래'], ['br', '오른쪽 아래']]
// 바탕 그라데이션. 색 · 패턴 표지의 바탕색에서 단색 대신 고른다. [이름, 위→아래 색]
export const COVER_GRADIENTS = [
  ['노을', ['#F6C9B8', '#F3D9C2', '#C7CCE9', '#9DA5D8']],
  ['숲', ['#DCEBD0', '#9CC29A', '#4E7D5B']],
  ['모래', ['#FBEFD9', '#F0D3A8', '#C99E6E']],
  ['밤하늘', ['#1F2A5A', '#3B4C8C', '#8A7DB8']],
  ['벚꽃', ['#FDE3EA', '#F7B9CB']],
  ['바다', ['#CFEAF6', '#8CCBE6', '#3E8DB8']],
]
// 직접 고르는 그라데이션의 처음 두 색 (위 → 아래)
export const CUSTOM_GRADIENT = ['#F3D9C2', '#9DB6DA']
/** 바탕 그라데이션 색 (위 → 아래). 단색이면 null */
export function gradientStops(cover) {
  if (cover.kind !== 'plain' || cover.gradient == null) return null
  if (cover.gradient === 'custom') return cover.gradientColors ?? CUSTOM_GRADIENT
  return COVER_GRADIENTS[cover.gradient]?.[1] ?? null
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
    band: { on: true, dir: 'v', pos: 'near', color: 'auto' }, plate: 'ribbon', ribbon: { color: RIBBON_COLORS[0][1] },
    title: { useName: true, text: '', font: 'sans', size: 17, color: PLAIN_TITLE, anchor: 'bc', at: null },
    subtitle: { on: true, text: `DIARY · ${dateMode === 'undated' ? '만년형' : '2026'}`, size: 8, color: '#9A9DA6' },
    stickers: [],
  }
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
    ribbon: { color: RIBBON_COLORS.some(([, color]) => color === hex(saved.ribbon?.color)) ? hex(saved.ribbon.color) : base.ribbon.color },
    title: {
      useName: saved.title?.useName !== false, text: typeof saved.title?.text === 'string' ? saved.title.text.slice(0, 24) : '',
      font: pick(saved.title?.font, COVER_FONTS, 'sans'), size: size(saved.title?.size, TITLE_SIZE, 17),
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
export function mix(from, to, t) {
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * 고무줄 색 'auto': 바탕(단색 또는 그라데이션 아래쪽 색)을 같은 계열로 조금 어둡게.
 * 사진 표지는 사진의 대표 색(photo.tone, 사진을 고를 때 뽑는다)을 같은 방식으로 어둡게, 아직 없으면 기본 남색.
 */
export function bandAutoColor(cover) {
  if (cover.kind === 'photo') return cover.photo?.tone ? mix(cover.photo.tone, '#1C2233', 0.22) : '#7D88B5'
  const stops = gradientStops(cover)
  return mix(stops ? stops[stops.length - 1] : cover.color, '#1C2233', 0.22)
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
    case 'text': return `${label(COVER_FONTS, cover.title.font)}${cover.subtitle.on && cover.subtitle.text ? ' · 소제목' : ''}`
    case 'plate': return `${cover.plate === 'ribbon' ? `띠지 · ${colorName(RIBBON_COLORS, cover.ribbon.color)}` : label(PLATES, cover.plate)} · ${anchorName(cover)}`
    case 'stickers': return cover.stickers.length ? `${cover.stickers.length}개` : '없음'
    default: return ''
  }
}

export const coverSummary = cover => !cover.enabled ? '표지 없음' : cover.kind === 'photo' ? '사진 표지' : '색 · 무늬 표지'
