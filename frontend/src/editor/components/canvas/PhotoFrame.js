import { Platform, StyleSheet } from 'react-native'
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { FRAME_TEXT } from '../../constants'

const FILM_COLOR = '#1F2026'
// 흰 종이에 흰 폴라로이드를 올려도 가장자리가 보이게 아주 옅은 선
const EDGE = 'rgba(11,25,87,0.26)'
const EDGE_WIDTH = 1
// 사진 틀 고르는 칸처럼 작게 그릴 때 흰 틀이 바탕에 묻히지 않게 쓰는 진한 선
export const PREVIEW_EDGE = 'rgba(11,25,87,0.38)'
// 바깥 선은 틀 안쪽으로 들여 그린다. 가장자리에 걸치면 기기의 픽셀 반올림으로 오른쪽 · 아래 선이 그림 영역 밖으로 잘린다.
const EDGE_INSET = EDGE_WIDTH / 2 + 1
const FILM_PRINT = '#F2C46B' // 필름 가장자리에 인쇄된 글자 (주황빛 노랑)
const MAT_COLOR = '#FBFAF7'
const MAT_LINE = 'rgba(0,0,0,0.12)'
const FRAME_SHADE = 'rgba(0,0,0,0.22)'

/**
 * 여백 있는 사진 틀의 바탕 (사진은 그 위에 inner 자리에 들어간다).
 * - polaroid: 단색 판
 * - film: 어두운 필름 + 위아래 띠의 구멍
 * - stamp: 가장자리가 톱니(반원 구멍)인 우표
 * - ticketConcert · ticketCinema · ticketMatch · ticketBoarding: 오른쪽 절취선 너머 칸이 있는 공연 · 영화 · 경기 티켓과 탑승권
 * - frame: 액자 (예전 문서 표시용). 틀 색 띠 + 흰 매트 + 사진 둘레의 옅은 안쪽 선
 * width·height·inner 는 화면 px. color 는 틀 색(필름은 고정). text 는 사용자가 고친 인쇄 글자(없으면 기본 글자).
 * edge 는 바깥 선 색 (고르는 칸에서 진하게).
 */
export default function FrameBackdrop({ frame, width, height, inner, color = '#FFFFFF', text, edge = EDGE }) {
  if (width <= 0 || height <= 0) return null
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {frame === 'film' && <Film width={width} height={height} inner={inner} />}
      {(frame === 'stamp' || frame === 'polaroid') && <FrameEdge frame={frame} width={width} height={height} fill={color} stroke={edge} />}
      {isTicketFrame(frame) && (
        <Ticket kind={frame} width={width} height={height} inner={inner} color={color} edge={edge} text={frameTextOf(frame, text)} />
      )}
      {frame === 'frame' && <PictureFrame width={width} height={height} inner={inner} color={color} />}
    </Svg>
  )
}

/** 틀 바깥 모양 (폴라로이드 · 우표 · 티켓 · 여러 칸 틀). 바깥 선과 고르는 칸의 그림자가 같은 모양을 쓴다. */
export function frameOutlinePath(frame, w, h) {
  if (frame === 'stamp') return stampPath(w, h)
  if (frame === 'ticketCinema') return scallopPath(w, h)
  if (isTicketFrame(frame)) {
    const tear = ticketTear(frame, w)
    return tear != null ? ticketPath(w, h, tear, ticketNotch(w)) : roundRectPath(w, h, w * 0.02)
  }
  return `M0 0 H${w} V${h} H0 Z`
}

/**
 * 틀이 실제로 차지하는 모양 (선이 잘리지 않게 EDGE_INSET 만큼 들인 바깥 모양). stroke 를 주면 테두리 선도 두른다.
 * 고르는 칸의 그림자도 이 모양을 써야 선 바깥으로 그림자가 삐져나오지 않는다.
 */
export function FrameShape({ frame, width, height, fill, stroke }) {
  const e = EDGE_INSET
  return (
    <Path d={frameOutlinePath(frame, width - e * 2, height - e * 2)} transform={`translate(${e} ${e})`} fill={fill}
      stroke={stroke} strokeWidth={stroke ? EDGE_WIDTH : undefined} />
  )
}

const FrameEdge = FrameShape

/** 액자: 바깥 틀(색) 안에 흰 매트, 매트와 사진 사이에 옅은 그늘 선 (사진은 inner 자리) */
function PictureFrame({ width, height, inner, color }) {
  const band = inner.left * 0.55 // 틀 띠 두께 (나머지는 매트)
  const shade = Math.max(0.6, inner.left * 0.06)
  return (
    <>
      <Rect width={width} height={height} fill={color} />
      <Rect x={band} y={band} width={width - band * 2} height={height - band * 2} fill={MAT_COLOR} />
      {/* 틀 안쪽 모서리의 그늘 (틀이 매트보다 도드라져 보이게) */}
      <Rect x={band} y={band} width={width - band * 2} height={height - band * 2} fill="none" stroke={FRAME_SHADE} strokeWidth={shade} />
      <Rect
        x={inner.left - shade / 2}
        y={inner.top - shade / 2}
        width={inner.width + shade}
        height={inner.height + shade}
        fill="none"
        stroke={MAT_LINE}
        strokeWidth={shade}
      />
    </>
  )
}

export const isTicketFrame = (frame) => typeof frame === 'string' && frame.startsWith('ticket')

/** 틀에 인쇄된 글자: 기본 글자 위에 사용자가 고친 값 (빈 글자로 지운 칸은 비운다) */
export const frameTextOf = (frame, text) => ({ ...FRAME_TEXT[frame]?.defaults, ...text })

export const MONO = Platform.select({ ios: 'Courier', default: 'monospace' })

// 티켓 종류별 강조 글자 색 (밝은 바탕 기준)
const TICKET_ACCENT = { ticketConcert: '#4F5FA8', ticketCinema: '#1F2026', ticketMatch: '#1F2026', ticketBoarding: '#5E7FB8' }

const ticketTear = (kind, u) => (kind === 'ticketConcert' ? u * 0.86 : kind === 'ticketBoarding' ? u * 0.735 : null)
const ticketNotch = (u) => Math.max(1.5, u * 0.022)

/**
 * 티켓에 인쇄된 고칠 수 있는 줄 (글자 위치 · 크기는 틀 너비 u 기준). 그리기와 두 번 눌러 고치기가 같은 자리를 쓴다.
 * - 공연: 종류 · 공연 이름 · 일시 · 좌석
 * - 영화: 종류 · 영화 제목 · 상영 정보 · 좌석
 * - 경기: 종류 · 경기 · (바코드) · 입장 정보
 * - 탑승권: 왼쪽 위 종류 · 구간 · 항공편, 절취선 너머 좌석 · 게이트
 * tone: ink(본문) · muted(옅은 글자) · accent(강조색)
 */
export function ticketLines(kind, w, inner) {
  const u = w
  const boarding = kind === 'ticketBoarding'
  const tear = ticketTear(kind, u)
  const x = boarding ? u * 0.05 : inner.left + inner.width + u * 0.045 // 글자 칸 왼쪽
  const max = (tear != null ? tear - u * 0.03 : w - u * 0.05) - x
  const lines = [
    { field: 'label', x, y: u * 0.1, size: u * 0.032, max, tone: boarding ? 'accent' : 'muted', mono: true, spacing: 0.12 },
    { field: 'title', x, y: u * (boarding ? 0.18 : 0.175), size: u * (boarding ? 0.062 : 0.054), max, tone: 'ink', weight: '800' },
  ]
  if (FRAME_TEXT[kind].defaults.info != null) lines.push({ field: 'info', x, y: u * (boarding ? 0.235 : 0.24), size: u * 0.03, max, tone: 'ink', mono: true })
  if (boarding) {
    const stub = { x: (tear + w) / 2, width: w - tear - u * 0.04 }
    lines.push(
      { field: 'seat', x: stub.x, y: u * 0.235, size: u * 0.07, max: stub.width, tone: 'ink', weight: '800', anchor: 'middle' },
      { field: 'gate', x: stub.x, y: u * 0.34, size: u * 0.028, max: stub.width, tone: 'muted', mono: true, anchor: 'middle' },
    )
  } else {
    const concert = kind === 'ticketConcert'
    lines.push({ field: 'detail', x, y: u * (kind === 'ticketMatch' ? 0.375 : 0.35), size: u * 0.034, max, tone: concert ? 'accent' : 'ink', mono: !concert, weight: concert ? '700' : '500' })
  }
  return lines
}

/** 인쇄 줄의 글자 색 (틀 색이 어두우면 밝은 글자) */
export function printColor(tone, frame, color) {
  if (tone === 'film') return FILM_PRINT
  const dark = isDarkColor(color)
  if (tone === 'muted') return dark ? 'rgba(255,255,255,0.6)' : 'rgba(31,32,38,0.55)'
  if (tone === 'accent') return dark ? 'rgba(255,255,255,0.85)' : TICKET_ACCENT[frame]
  if (tone === 'caption') return dark ? 'rgba(255,255,255,0.9)' : 'rgba(31,32,38,0.8)'
  return dark ? 'rgba(255,255,255,0.92)' : '#1F2026'
}

/** 줄에 찍을 글자. 필름 4컷 번호(step)는 맨 앞 숫자를 칸마다 하나씩 늘린다 (12A → 13A …) */
export function lineText(line, text) {
  const value = text[line.field] ?? ''
  if (!line.step) return value
  const match = /^(\d+)(.*)$/.exec(value)
  return match ? `${Number(match[1]) + line.step}${match[2]}` : value
}

/**
 * 티켓 (실제 티켓처럼 왼쪽에 작은 사진, 가운데 인쇄 글자). 고칠 수 있는 줄은 ticketLines. 그 밖에
 * 공연은 절취선(위아래 반원 홈) 너머 세로 ADMIT, 영화는 물결 가장자리, 경기는 바코드, 탑승권은 절취선 너머 SEAT.
 */
function Ticket({ kind, width: w, height: h, inner, color, edge, text }) {
  const u = w
  const ink = printColor('ink', kind, color)
  const muted = printColor('muted', kind, color)
  const r = ticketNotch(u)
  const tear = ticketTear(kind, u)
  const lines = ticketLines(kind, w, inner)
  const stubX = tear != null ? (tear + w) / 2 : 0
  return (
    <>
      <FrameEdge frame={kind} width={w} height={h} fill={color} stroke={edge} />
      {tear != null && (
        <Line x1={tear} y1={r + 2} x2={tear} y2={h - r - 2} stroke={ink} strokeWidth={Math.max(0.5, u * 0.003)} strokeDasharray={`${r * 0.5} ${r * 0.5}`} opacity={0.35} />
      )}
      {kind === 'ticketMatch' && <Barcode left={lines[0].x} width={lines[0].max} top={u * 0.205} height={u * 0.1} ink={ink} />}
      {lines.map((line, i) => (
        <PrintLine key={i} {...line} fill={printColor(line.tone, kind, color)}>{lineText(line, text)}</PrintLine>
      ))}
      {kind === 'ticketConcert' && (
        <SvgText x={stubX} y={h / 2 + u * 0.011} fontSize={u * 0.03} fontFamily={MONO} letterSpacing={u * 0.006} textAnchor="middle" fill={muted} transform={`rotate(90 ${stubX} ${h / 2})`}>
          ADMIT
        </SvgText>
      )}
      {kind === 'ticketBoarding' && (
        <PrintLine x={stubX} y={u * 0.13} size={u * 0.028} max={w - tear - u * 0.04} fill={muted} mono anchor="middle">SEAT</PrintLine>
      )}
    </>
  )
}

/**
 * 인쇄된 한 줄. 칸(max)보다 길면 글자를 60% 까지 줄이고, 그래도 길면 뒤를 … 로 줄인다.
 * spacing 은 글자 크기 대비 자간.
 */
function PrintLine({ x, y, size, max, fill, mono = false, weight = mono ? '500' : '600', spacing = 0.02, anchor = 'start', children }) {
  const fitted = fitLine(String(children ?? ''), size, max, mono, spacing)
  if (!fitted.text) return null
  return (
    <SvgText x={x} y={y} fontSize={fitted.size} fontWeight={weight} fontFamily={mono ? MONO : undefined} letterSpacing={fitted.size * spacing} textAnchor={anchor} fill={fill}>
      {fitted.text}
    </SvgText>
  )
}

/** 글자 폭 어림 (한글 · 전각은 1, 나머지는 고정폭 0.6 · 보통 0.58 글자 크기) */
function lineWidth(text, size, mono, spacing) {
  let units = 0
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e7f ? 1 : mono ? 0.6 : 0.58
  return (units + spacing * text.length) * size
}

/** 칸 너비(max)에 맞춘 글자와 크기 */
export function fitLine(text, size, max, mono = false, spacing = 0.02) {
  if (!text || lineWidth(text, size, mono, spacing) <= max) return { text, size }
  const smaller = Math.max(size * 0.6, (size * max) / lineWidth(text, size, mono, spacing))
  if (lineWidth(text, smaller, mono, spacing) <= max) return { text, size: smaller }
  let cut = [...text]
  while (cut.length > 1 && lineWidth(`${cut.join('')}…`, smaller, mono, spacing) > max) cut = cut.slice(0, -1)
  return { text: `${cut.join('')}…`, size: smaller }
}

/** 가로로 늘어선 바코드 막대 */
function Barcode({ left, width, top, height, ink }) {
  const bars = []
  let x = left
  BARCODE.forEach((unit, i) => {
    const w = (width * unit) / BARCODE_TOTAL
    if (i % 2 === 0) bars.push(<Rect key={i} x={x} y={top} width={w} height={height} fill={ink} />)
    x += w
  })
  return bars
}

const roundRectPath = (w, h, r) => roundRectAt(0, 0, w, h, r)

// 바코드 막대·틈 두께 (막대부터 번갈아)
const BARCODE = [2, 1, 1, 1, 3, 1, 1, 2, 2, 1, 1, 1, 3, 2, 1, 1, 2, 1, 1, 2, 3, 1, 1, 1, 2]
const BARCODE_TOTAL = BARCODE.reduce((sum, unit) => sum + unit, 0)

/** 영화 티켓 외곽: 위아래는 곧고 양옆 가장자리에 반원 홈이 이어진다 */
export function scallopPath(w, h) {
  const r = Math.max(1.5, h * 0.045)
  const n = Math.max(2, Math.round(h / (r * 3.4)))
  const step = h / n
  let d = `M0 0 L${w} 0`
  for (let i = 0; i < n; i += 1) {
    const c = step * (i + 0.5)
    d += ` L${w} ${c - r} A${r} ${r} 0 0 0 ${w} ${c + r}`
  }
  d += ` L${w} ${h} L0 ${h}`
  for (let i = 0; i < n; i += 1) {
    const c = h - step * (i + 0.5)
    d += ` L0 ${c + r} A${r} ${r} 0 0 0 0 ${c - r}`
  }
  return `${d} Z`
}

/** 절취선 x(tear) 위아래에 반원 홈을 판 티켓 외곽 */
export function ticketPath(w, h, tear, r) {
  return `M0 0 L${tear - r} 0 A${r} ${r} 0 0 0 ${tear + r} 0 L${w} 0 L${w} ${h} L${tear + r} ${h} A${r} ${r} 0 0 0 ${tear - r} ${h} L0 ${h} Z`
}

/**
 * 여러 칸 틀에 인쇄된 고칠 수 있는 줄. 인생네컷은 아래 글자, 필름 4컷은 칸마다 위 필름 이름 · 아래 번호.
 * cells 는 칸 자리 (그리는 단위 그대로).
 */
export function stripLines(frame, width, height, cells) {
  if (frame === 'filmstrip') {
    const band = cells[0]?.top ?? 0
    const size = band * 0.24
    return cells.flatMap((cell, i) => [
      { field: 'brand', x: cell.left + size * 0.2, y: cell.top - band * 0.1, size, max: cell.width * 0.7, tone: 'film', mono: true, weight: '700', spacing: 0.06 },
      { field: 'number', step: i, x: cell.left + cell.width - size * 0.2, y: cell.top + cell.height + band * 0.1 + size * 0.8, size, max: cell.width * 0.5, tone: 'film', mono: true, weight: '700', spacing: 0.06, anchor: 'end' },
    ])
  }
  const last = cells[cells.length - 1]
  const footerTop = last ? last.top + last.height : height
  const foot = height - footerTop
  return [{ field: 'caption', x: width / 2, y: footerTop + foot * 0.62, size: foot * 0.26, max: width * 0.86, tone: 'caption', weight: '700', spacing: 0.1, anchor: 'middle' }]
}

/** 여러 칸 틀(인생네컷 · 필름 4컷)의 바탕. 칸(cells, 화면 px)은 빈 칸 색으로 깔고 사진은 그 위에 얹는다. */
export function StripBackdrop({ frame, width, height, cells, color = STRIP_DEFAULT_COLOR, text, edge = EDGE }) {
  if (width <= 0 || height <= 0) return null
  const film = frame === 'filmstrip'
  const fill = film ? FILM_COLOR : color
  const dark = film || isDarkColor(color)
  const empty = emptySlotColor(dark)
  const printed = frameTextOf(frame, text)
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {film ? (
        // 칸 너비가 사진 한 장(36mm)
        <Path d={filmPath(width, height, cells[0]?.top ?? 0, (cells[0]?.width ?? width) / 36, true)} fill={FILM_COLOR} fillRule="evenodd" />
      ) : dark ? <Rect width={width} height={height} fill={fill} /> : <FrameEdge frame="strip" width={width} height={height} fill={fill} stroke={edge} />}
      {cells.map((cell, i) => <Rect key={i} x={cell.left} y={cell.top} width={cell.width} height={cell.height} fill={empty} />)}
      {stripLines(frame, width, height, cells).map((line, i) => (
        <PrintLine key={i} {...line} fill={printColor(line.tone, frame, color)}>{lineText(line, printed)}</PrintLine>
      ))}
    </Svg>
  )
}

/** 사진이 아직 없는 자리의 색 (틀 바탕이 어두우면 밝게, 밝으면 어둡게 비친다) */
export const emptySlotColor = (dark) => (dark ? 'rgba(255,255,255,0.14)' : 'rgba(31,32,38,0.08)')

// 인생네컷의 처음 틀 색 (검정 스트립)
export const STRIP_DEFAULT_COLOR = '#1F2026'

/** 밝은 글씨를 올려야 하는 어두운 색인지 (#RGB · #RRGGBB) */
export function isDarkColor(hex) {
  const value = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex ?? '') ? hex.slice(1) : 'ffffff'
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return r * 0.299 + g * 0.587 + b * 0.114 < 140
}

/** 필름 한 장: 사진 너비가 36mm 인 35mm 필름 조각 */
function Film({ width, height, inner }) {
  return <Path d={filmPath(width, height, inner.top, inner.width / 36)} fill={FILM_COLOR} fillRule="evenodd" />
}

// 35mm 필름 구멍(KS 규격, mm): 필름 방향 폭 1.98 · 가로지르는 높이 2.79 · 간격 4.75(사진 한 장에 8개) · 모서리 0.5
const PERF = { width: 1.98, height: 2.79, pitch: 4.75, radius: 0.5, edge: 1.6 }

/**
 * 구멍이 뚫린 필름 바탕 (evenodd 로 구멍 자리를 비워 아래 종이가 보인다).
 * band 는 위아래 띠 높이, mm 는 1mm 의 크기. outer 면 구멍을 바깥 가장자리 쪽에 붙여 안쪽에 인쇄 글자 자리를 남긴다 (필름 4컷).
 */
export function filmPath(width, height, band, mm, outer = false) {
  const w = PERF.width * mm
  const h = Math.min(PERF.height * mm, band * 0.7)
  const pitch = PERF.pitch * mm
  const r = PERF.radius * mm
  const top = outer ? Math.min(PERF.edge * mm, (band - h) / 2) : (band - h) / 2
  // 양 끝 구멍과 가장자리 사이는 구멍 사이 틈의 절반 이상
  const count = Math.max(1, Math.floor((width - w - (pitch - w)) / pitch) + 1)
  const start = (width - (count - 1) * pitch - w) / 2
  let d = `M0 0 H${width} V${height} H0 Z`
  for (let i = 0; i < count; i += 1) {
    const x = start + i * pitch
    d += ` ${roundRectAt(x, top, w, h, r)} ${roundRectAt(x, height - top - h, w, h, r)}`
  }
  return d
}

function roundRectAt(x, y, w, h, r) {
  return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
}

/** 네 변에 반원 톱니를 판 우표 모양 (시계 방향으로 돌며 안쪽으로 파낸다) */
export function stampPath(w, h) {
  const r = Math.max(1.2, Math.min(w, h) * 0.028)
  const edge = (len) => {
    const n = Math.max(2, Math.round(len / (r * 3.6)))
    return { n, step: len / n }
  }
  const top = edge(w)
  const side = edge(h)
  let d = 'M0 0'
  for (let i = 0; i < top.n; i += 1) {
    const c = top.step * (i + 0.5)
    d += ` L${c - r} 0 A${r} ${r} 0 0 0 ${c + r} 0`
  }
  d += ` L${w} 0`
  for (let i = 0; i < side.n; i += 1) {
    const c = side.step * (i + 0.5)
    d += ` L${w} ${c - r} A${r} ${r} 0 0 0 ${w} ${c + r}`
  }
  d += ` L${w} ${h}`
  for (let i = 0; i < top.n; i += 1) {
    const c = w - top.step * (i + 0.5)
    d += ` L${c + r} ${h} A${r} ${r} 0 0 0 ${c - r} ${h}`
  }
  d += ` L0 ${h}`
  for (let i = 0; i < side.n; i += 1) {
    const c = h - side.step * (i + 0.5)
    d += ` L0 ${c + r} A${r} ${r} 0 0 0 0 ${c - r}`
  }
  return `${d} Z`
}
