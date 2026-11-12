import { cloneElement, useEffect } from 'react'
import { useMediaUri } from '../../hooks/useMediaUri'
import { useSvgImageUri } from '../../hooks/useSvgImageUri'
import { reportMediaDisplayError } from '../../services/mediaStore'
import { coverLayout } from '../../utils/objects'
import { LEGACY_TAPE_PATTERNS, TAPE_DEFAULT, TAPE_PALETTES } from '../../constants'
import { useSvgId } from '../../utils/svgId'
import { LACE_HEIGHT, LACE_TILES } from './laceTapes'
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, Line, Path, Pattern, Polygon, Rect } from 'react-native-svg'
import { snapScale, snapToPixel } from '../../../shared/pixelSnap'

// 기본 테이프 크기(180×34)의 가로:세로. 이미지 테이프 자르기 틀도 이 비율을 쓴다.
export const TAPE_RATIO = 180 / 34

/** 무늬 + 색 정하기. 예전 문서의 무늬 이름(mint-stripe 등)도 지금 방식으로 바꿔 읽는다. */
export function tapeLook(pattern, palette) {
  const legacy = LEGACY_TAPE_PATTERNS[pattern]
  // 색을 아직 안 골랐으면 기본색(핑크). 미리보기와 실제로 붙는 색이 같도록 TAPE_DEFAULT 를 쓴다.
  const look = { pattern: legacy?.pattern ?? pattern ?? 'solid', palette: palette ?? legacy?.palette ?? TAPE_DEFAULT.palette }
  // 사용자 지정 색: 'custom:#바탕:#무늬'
  if (look.palette.startsWith('custom:')) {
    const [, bg, fg] = look.palette.split(':')
    return { ...look, bg, fg }
  }
  const colors = TAPE_PALETTES.find((p) => p.id === look.palette) ?? TAPE_PALETTES[0]
  return { ...look, bg: colors.bg, fg: colors.fg }
}

// 레이스 도안을 몇 벌 이어 붙일지. 도안이 타일 안(0 ~ width)에만 있어야 복사본끼리 겹치지 않고 맞닿는다
// (겹치면 evenodd 라 겹친 곳이 구멍이 된다). 예전 도안(아이렛 · 크로셰)은 타일 밖으로 조금 나가 있어 한 벌만 쓴다.
const LACE_MAX_COPIES = 12
const laceFits = new Map()
function laceCopies(pattern, lace, needed) {
  if (!laceFits.has(pattern)) {
    const xs = lace.body.match(/-?\d+(\.\d+)?/g).filter((_, i) => i % 2 === 0).map(Number) // 모든 명령이 절대 좌표 x y 쌍이다
    laceFits.set(pattern, Math.min(...xs) >= 0 && Math.max(...xs) <= lace.width)
  }
  return laceFits.get(pattern) && Number.isFinite(needed) ? Math.max(1, Math.min(LACE_MAX_COPIES, Math.ceil(needed))) : 1
}
const joinedLaces = new Map()
function joinedLace(pattern, lace, copies) {
  if (copies === 1) return lace.body
  const key = `${pattern}:${copies}`
  if (!joinedLaces.has(key)) {
    const parts = Array.from({ length: copies }, (_, n) => {
      let i = 0
      return lace.body.replace(/-?\d+(\.\d+)?/g, (v) => (i++ % 2 === 0 ? +(Number(v) + n * lace.width).toFixed(2) : v))
    })
    joinedLaces.set(key, parts.join(''))
  }
  return joinedLaces.get(key)
}
// 한 경로로 이어도 복사본 경계가 맞닿는 곳에 가는 줄이 남아(태블릿에서 확인) 그 위에 경계를 끊김 없이 그린 조각(seam)을 덧그린다.
// 같은 색을 겹쳐 칠하므로 조각의 가장자리는 보이지 않고 경계의 가는 줄만 메워진다.
function laceSeams(pattern, lace, copies) {
  const key = `${pattern}:seam:${copies}`
  if (!joinedLaces.has(key)) {
    const parts = Array.from({ length: copies - 1 }, (_, n) => {
      let i = 0
      return lace.seam.replace(/-?\d+(\.\d+)?/g, (v) => (i++ % 2 === 0 ? +(Number(v) + (n + 1) * lace.width).toFixed(2) : v))
    })
    joinedLaces.set(key, parts.join(''))
  }
  return joinedLaces.get(key)
}

/**
 * 무늬 타일. 바탕(bg)·무늬(fg) 두 색으로 그려서 무늬는 그대로 두고 색만 바꿀 수 있다.
 * 화면 배율과 상관없이 같은 밀도로 보이도록 scale 을 곱한다.
 */
function PatternTile({ id, pattern, bg, fg, scale, height, width }) {
  const s = (v) => v * scale
  const lace = LACE_TILES[pattern]
  if (lace) {
    // 레이스: 구멍이 뚫린 레이스 모양 하나(evenodd)만 칠하고 바탕 사각형은 없다. 칠하지 않은 곳은 진짜 투명이라 밑이 비친다.
    // 레이스는 한 가지 색(바탕색)이다. 타일은 테이프 높이에 맞춰 키운다.
    // 이어 붙일 수 있는 도안은 테이프 길이만큼 한 경로로 이어 붙여 타일 하나로 채운다: 타일이 여러 장이면
    // 곧은 헤딩 · 띠가 칸 경계마다 가는 줄로 잘려 보였다(무늬 칸 이음매).
    // 타일 높이는 테이프의 두 배로 두고 아래 절반은 비운다: 높이가 소수점 픽셀이면(미리보기 14dp × 1.75 = 24.5px) 기기가 타일을
    // 정수 픽셀로 맞추면서 아래 칸 타일의 윗줄이 테이프 밑에 가는 실선으로 비쳤다(부채술의 곧은 헤딩).
    const k = height / LACE_HEIGHT
    const copies = laceCopies(pattern, lace, width / (lace.width * k))
    return (
      <Pattern id={id} patternUnits="userSpaceOnUse" width={lace.width * k * copies} height={height * 2} viewBox={`0 0 ${lace.width * copies} ${LACE_HEIGHT * 2}`}>
        <Path d={joinedLace(pattern, lace, copies)} fill={bg} fillRule="evenodd" />
        {copies > 1 && lace.seam && <Path d={laceSeams(pattern, lace, copies)} fill={bg} fillRule="evenodd" />}
      </Pattern>
    )
  }
  switch (pattern) {
    case 'stripe':
      // 사선 스트라이프
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(12)} height={s(12)}>
          <Rect width={s(12)} height={s(12)} fill={bg} />
          <Path d={`M${s(-3)} ${s(3)} L${s(3)} ${s(-3)} M0 ${s(12)} L${s(12)} 0 M${s(9)} ${s(15)} L${s(15)} ${s(9)}`} stroke={fg} strokeWidth={s(3.2)} />
        </Pattern>
      )
    case 'dot':
      // 엇갈려 놓인 물방울 도트
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(14)} height={s(14)}>
          <Rect width={s(14)} height={s(14)} fill={bg} />
          <Circle cx={s(3.5)} cy={s(3.5)} r={s(2.2)} fill={fg} />
          <Circle cx={s(10.5)} cy={s(10.5)} r={s(2.2)} fill={fg} />
        </Pattern>
      )
    case 'check':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(14)} height={s(14)}>
          <Rect width={s(14)} height={s(14)} fill={bg} />
          <Rect width={s(7)} height={s(14)} fill={fg} fillOpacity={0.45} />
          <Rect width={s(14)} height={s(7)} fill={fg} fillOpacity={0.45} />
        </Pattern>
      )
    case 'kraft':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(7)} height={s(7)}>
          <Rect width={s(7)} height={s(7)} fill={bg} />
          <Rect width={s(2)} height={s(7)} fill={fg} fillOpacity={0.18} />
        </Pattern>
      )
    case 'grid':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(8)} height={s(8)}>
          <Rect width={s(8)} height={s(8)} fill={bg} />
          <Line x1="0" y1="0" x2={s(8)} y2="0" stroke={fg} strokeOpacity={0.7} strokeWidth={s(1.6)} />
          <Line x1="0" y1="0" x2="0" y2={s(8)} stroke={fg} strokeOpacity={0.7} strokeWidth={s(1.6)} />
        </Pattern>
      )
    case 'wave':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(24)} height={s(12)}>
          <Rect width={s(24)} height={s(12)} fill={bg} />
          <Path d={`M0 ${s(6)} Q${s(6)} ${s(1)} ${s(12)} ${s(6)} T${s(24)} ${s(6)}`} stroke={fg} strokeWidth={s(1.6)} fill="none" />
        </Pattern>
      )
    case 'gingham':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(16)} height={s(16)}>
          <Rect width={s(16)} height={s(16)} fill={bg} />
          <Rect width={s(8)} height={s(16)} fill={fg} fillOpacity={0.3} />
          <Rect width={s(16)} height={s(8)} fill={fg} fillOpacity={0.3} />
        </Pattern>
      )
    case 'heart':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(18)} height={s(18)}>
          <Rect width={s(18)} height={s(18)} fill={bg} />
          <Path
            d={`M${s(9)} ${s(13)} C${s(3)} ${s(9)} ${s(4)} ${s(4.5)} ${s(7)} ${s(5)} C${s(8)} ${s(5.2)} ${s(8.6)} ${s(6)} ${s(9)} ${s(6.8)} C${s(9.4)} ${s(6)} ${s(10)} ${s(5.2)} ${s(11)} ${s(5)} C${s(14)} ${s(4.5)} ${s(15)} ${s(9)} ${s(9)} ${s(13)}Z`}
            fill={fg}
          />
        </Pattern>
      )
    case 'star':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(20)} height={s(20)}>
          <Rect width={s(20)} height={s(20)} fill={bg} />
          <Path
            d={`M${s(6)} ${s(2)} L${s(7)} ${s(5)} L${s(10)} ${s(6)} L${s(7)} ${s(7)} L${s(6)} ${s(10)} L${s(5)} ${s(7)} L${s(2)} ${s(6)} L${s(5)} ${s(5)}Z`}
            fill={fg}
          />
          <Circle cx={s(15)} cy={s(15)} r={s(1.1)} fill={fg} />
        </Pattern>
      )
    case 'plaid':
      // 플래드: 가로·세로 띠(면)가 교차하고 사이에 가는 선
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(20)} height={s(20)}>
          <Rect width={s(20)} height={s(20)} fill={bg} />
          <Rect x={s(6)} width={s(6)} height={s(20)} fill={fg} fillOpacity={0.28} />
          <Rect y={s(6)} width={s(20)} height={s(6)} fill={fg} fillOpacity={0.28} />
          <Line x1={s(16)} y1="0" x2={s(16)} y2={s(20)} stroke={fg} strokeOpacity={0.6} strokeWidth={s(0.8)} />
          <Line x1="0" y1={s(16)} x2={s(20)} y2={s(16)} stroke={fg} strokeOpacity={0.6} strokeWidth={s(0.8)} />
        </Pattern>
      )
    case 'checker':
      // 체커보드: 반반 또렷한 바둑판
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(16)} height={s(16)}>
          <Rect width={s(16)} height={s(16)} fill={bg} />
          <Rect width={s(8)} height={s(8)} fill={fg} fillOpacity={0.75} />
          <Rect x={s(8)} y={s(8)} width={s(8)} height={s(8)} fill={fg} fillOpacity={0.75} />
        </Pattern>
      )
    case 'ribbon':
      // 리본(코케트): 작은 나비 리본이 엇갈려 놓인다
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(24)} height={s(24)}>
          <Rect width={s(24)} height={s(24)} fill={bg} />
          {[
            [7, 8],
            [19, 20],
          ].map(([x, y]) => (
            <G key={`${x}-${y}`}>
              <Path
                d={`M${s(x)} ${s(y)} C${s(x - 3)} ${s(y - 4)} ${s(x - 6)} ${s(y - 1)} ${s(x - 5)} ${s(y + 1.5)} C${s(x - 4)} ${s(y + 3)} ${s(x - 1)} ${s(y + 1)} ${s(x)} ${s(y)}Z M${s(x)} ${s(y)} C${s(x + 3)} ${s(y - 4)} ${s(x + 6)} ${s(y - 1)} ${s(x + 5)} ${s(y + 1.5)} C${s(x + 4)} ${s(y + 3)} ${s(x + 1)} ${s(y + 1)} ${s(x)} ${s(y)}Z`}
                fill={fg}
              />
              <Path d={`M${s(x - 0.5)} ${s(y + 0.5)} L${s(x - 2.5)} ${s(y + 5)} M${s(x + 0.5)} ${s(y + 0.5)} L${s(x + 2.5)} ${s(y + 5)}`} stroke={fg} strokeWidth={s(1)} strokeLinecap="round" />
              <Circle cx={s(x)} cy={s(y)} r={s(1.1)} fill={fg} />
            </G>
          ))}
        </Pattern>
      )
    case 'cherry':
      // 체리: 두 알이 줄기로 이어진 체리 + 잎 (열매·줄기 색은 고정, 바탕만 팔레트)
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(24)} height={s(22)}>
          <Rect width={s(24)} height={s(22)} fill={bg} />
          <Path d={`M${s(8)} ${s(14)} Q${s(10)} ${s(6)} ${s(14)} ${s(4)} M${s(15)} ${s(15)} Q${s(14)} ${s(8)} ${s(14)} ${s(4)}`} stroke="#5E8C4A" strokeWidth={s(0.9)} fill="none" />
          <Path d={`M${s(14)} ${s(4)} Q${s(18)} ${s(1.5)} ${s(20)} ${s(4)} Q${s(17)} ${s(6)} ${s(14)} ${s(4)}Z`} fill="#7BB062" />
          <Circle cx={s(7.5)} cy={s(15.5)} r={s(2.6)} fill="#E2475B" />
          <Circle cx={s(15)} cy={s(16.5)} r={s(2.6)} fill="#E2475B" />
          <Circle cx={s(6.7)} cy={s(14.7)} r={s(0.7)} fill="#FFFFFF" fillOpacity={0.7} />
          <Circle cx={s(14.2)} cy={s(15.7)} r={s(0.7)} fill="#FFFFFF" fillOpacity={0.7} />
        </Pattern>
      )
    case 'sakura': {
      // 벚꽃: 끝이 살짝 갈라진 다섯 잎
      const petals = [0, 72, 144, 216, 288]
      const flower = (cx, cy, r, key) => (
        <G key={key}>
          {petals.map((deg) => {
            const a = ((deg - 90) * Math.PI) / 180
            const tip = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
            const side = 0.42
            const l = { x: cx + Math.cos(a - side) * r * 0.62, y: cy + Math.sin(a - side) * r * 0.62 }
            const rr = { x: cx + Math.cos(a + side) * r * 0.62, y: cy + Math.sin(a + side) * r * 0.62 }
            const notch = { x: cx + Math.cos(a) * r * 0.78, y: cy + Math.sin(a) * r * 0.78 }
            return (
              <Path
                key={deg}
                d={`M${s(cx)} ${s(cy)} Q${s(l.x)} ${s(l.y)} ${s(tip.x + Math.cos(a - 1.2) * r * 0.18)} ${s(tip.y + Math.sin(a - 1.2) * r * 0.18)} L${s(notch.x)} ${s(notch.y)} L${s(tip.x + Math.cos(a + 1.2) * r * 0.18)} ${s(tip.y + Math.sin(a + 1.2) * r * 0.18)} Q${s(rr.x)} ${s(rr.y)} ${s(cx)} ${s(cy)}Z`}
                fill={fg}
                fillOpacity={0.9}
              />
            )
          })}
          <Circle cx={s(cx)} cy={s(cy)} r={s(r * 0.18)} fill="#FFF3C9" />
        </G>
      )
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(28)} height={s(28)}>
          <Rect width={s(28)} height={s(28)} fill={bg} />
          {flower(8, 8, 5.5, 'a')}
          {flower(21, 20, 4.2, 'b')}
          <Circle cx={s(22)} cy={s(6)} r={s(1)} fill={fg} fillOpacity={0.5} />
          <Circle cx={s(6)} cy={s(22)} r={s(0.8)} fill={fg} fillOpacity={0.5} />
        </Pattern>
      )
    }
    case 'botanical':
      // 보태니컬: 휘어진 줄기에 잎이 달린 가지
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(28)} height={s(24)}>
          <Rect width={s(28)} height={s(24)} fill={bg} />
          <Path d={`M${s(4)} ${s(20)} Q${s(12)} ${s(14)} ${s(16)} ${s(4)}`} stroke={fg} strokeWidth={s(0.9)} fill="none" />
          {[
            [7.5, 17.2, -40],
            [10.8, 13.6, -20],
            [13.4, 9.6, -60],
            [9.6, 18.6, 40],
            [13.2, 15, 30],
            [15.4, 10.4, 10],
          ].map(([x, y, rot]) => (
            <Path
              key={`${x}-${y}`}
              d={`M${s(x)} ${s(y)} q${s(2.4)} ${s(-1.6)} ${s(4)} ${s(0)} q${s(-1.6)} ${s(1.6)} ${s(-4)} ${s(0)}Z`}
              fill={fg}
              fillOpacity={0.8}
              transform={`rotate(${rot} ${s(x)} ${s(y)})`}
            />
          ))}
          <Circle cx={s(23)} cy={s(6)} r={s(1.2)} fill={fg} fillOpacity={0.45} />
        </Pattern>
      )
    case 'squiggle':
      // 스퀴글: 자유롭게 구불거리는 선
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(24)} height={s(10)}>
          <Rect width={s(24)} height={s(10)} fill={bg} />
          <Path
            d={`M0 ${s(5)} C${s(2)} ${s(1)} ${s(4)} ${s(9)} ${s(6)} ${s(5)} S${s(10)} ${s(1)} ${s(12)} ${s(5)} S${s(16)} ${s(9)} ${s(18)} ${s(5)} S${s(22)} ${s(1)} ${s(24)} ${s(5)}`}
            stroke={fg}
            strokeWidth={s(1.3)}
            fill="none"
            strokeLinecap="round"
          />
        </Pattern>
      )
    case 'dash':
      // 대시: 가운데 짧은 선이 이어진다 (슬림용)
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(12)} height={s(11)}>
          <Rect width={s(12)} height={s(11)} fill={bg} />
          <Line x1={s(2)} y1={s(5.5)} x2={s(9)} y2={s(5.5)} stroke={fg} strokeWidth={s(1.8)} strokeLinecap="round" />
        </Pattern>
      )
    case 'dotline':
      // 도트 라인: 가운데 점 한 줄
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(9)} height={s(11)}>
          <Rect width={s(9)} height={s(11)} fill={bg} />
          <Circle cx={s(4.5)} cy={s(5.5)} r={s(1.8)} fill={fg} />
        </Pattern>
      )
    case 'doubleline':
      // 더블 라인: 가는 가로줄 두 개
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(10)} height={s(11)}>
          <Rect width={s(10)} height={s(11)} fill={bg} />
          <Rect y={s(3)} width={s(10)} height={s(1.2)} fill={fg} />
          <Rect y={s(6.8)} width={s(10)} height={s(1.2)} fill={fg} />
        </Pattern>
      )
    case 'zigzag':
      // 지그재그
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(10)} height={s(11)}>
          <Rect width={s(10)} height={s(11)} fill={bg} />
          <Path d={`M0 ${s(7.5)} L${s(5)} ${s(3.5)} L${s(10)} ${s(7.5)}`} stroke={fg} strokeWidth={s(1.5)} fill="none" strokeLinejoin="round" />
        </Pattern>
      )
    case 'pinstripe':
      // 핀스트라이프: 가는 세로줄
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(5)} height={s(11)}>
          <Rect width={s(5)} height={s(11)} fill={bg} />
          <Rect x={s(2)} width={s(1)} height={s(11)} fill={fg} />
        </Pattern>
      )
    case 'houndstooth': {
      // 하운드투스: 클래식한 사냥개 이빨 체크 (24 단위 타일을 와이드 높이에 맞춰 줄인다)
      const k = (v) => s(v * 0.6)
      const d = `M0 ${k(18)}h${k(6)}l${k(6)} ${k(-6)}v${k(6)}h${k(6)}l${k(-6)} ${k(6)}H0 M${k(24)} ${k(18)}v${k(6)}h${k(-6)} M${k(24)} 0l${k(-6)} ${k(6)}h${k(-6)}l${k(6)} ${k(-6)} M${k(12)} 0v${k(6)}L0 ${k(18)}v${k(-6)}l${k(6)} ${k(-6)}H0V0`
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={k(24)} height={k(24)}>
          <Rect width={k(24)} height={k(24)} fill={bg} />
          <Path d={d} fill={fg} />
        </Pattern>
      )
    }
    case 'awning':
      // 어닝 스트라이프: 차양처럼 굵은 세로 줄
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(20)} height={s(17)}>
          <Rect width={s(20)} height={s(17)} fill={bg} />
          <Rect width={s(10)} height={s(17)} fill={fg} />
        </Pattern>
      )
    case 'scallop':
      // 스캘럽: 물고기 비늘처럼 겹친 반원
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(12)} height={s(8)}>
          <Rect width={s(12)} height={s(8)} fill={bg} />
          <Path d={`M0 ${s(8)} A${s(6)} ${s(6)} 0 0 1 ${s(12)} ${s(8)} M${s(-6)} ${s(4)} A${s(6)} ${s(6)} 0 0 1 ${s(6)} ${s(4)} M${s(6)} ${s(4)} A${s(6)} ${s(6)} 0 0 1 ${s(18)} ${s(4)}`} stroke={fg} strokeWidth={s(1.2)} fill="none" />
        </Pattern>
      )
    case 'halftone': {
      // 하프톤: 위아래 가장자리는 큰 점, 가운데로 갈수록 작은 점 (와이드 높이 68 기준)
      const rows = [5.5, 16.5, 27.5, 40.5, 51.5, 62.5]
      const radius = [2.8, 2.1, 1.3, 1.3, 2.1, 2.8]
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(12)} height={s(68)}>
          <Rect width={s(12)} height={s(68)} fill={bg} />
          {rows.map((y, i) => (
            <Circle key={y} cx={s(i % 2 ? 9 : 3)} cy={s(y)} r={s(radius[i])} fill={fg} />
          ))}
        </Pattern>
      )
    }
    case 'plus':
      // 플러스: 작은 십자
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(17)} height={s(17)}>
          <Rect width={s(17)} height={s(17)} fill={bg} />
          <Path d={`M${s(8.5)} ${s(5)} L${s(8.5)} ${s(12)} M${s(5)} ${s(8.5)} L${s(12)} ${s(8.5)}`} stroke={fg} strokeWidth={s(1.8)} strokeLinecap="round" />
        </Pattern>
      )
    case 'arch':
      // 아치: 겹 무지개 모양
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(22)} height={s(17)}>
          <Rect width={s(22)} height={s(17)} fill={bg} />
          <Path d={`M${s(3)} ${s(14)} A${s(8)} ${s(8)} 0 0 1 ${s(19)} ${s(14)}`} stroke={fg} strokeWidth={s(2.4)} fill="none" />
          <Path d={`M${s(7.5)} ${s(14)} A${s(3.5)} ${s(3.5)} 0 0 1 ${s(14.5)} ${s(14)}`} stroke={fg} strokeWidth={s(2.4)} fill="none" />
        </Pattern>
      )
    case 'triangle':
      // 트라이앵글: 위아래 엇갈린 삼각형
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(16)} height={s(17)}>
          <Rect width={s(16)} height={s(17)} fill={bg} />
          <Polygon points={`${s(2)},${s(7)} ${s(6)},${s(1)} ${s(10)},${s(7)}`} fill={fg} />
          <Polygon points={`${s(10)},${s(10)} ${s(14)},${s(16)} ${s(6)},${s(16)}`} fill={fg} fillOpacity={0.55} />
        </Pattern>
      )
    case 'border':
      // 보더: 굵은 가로 줄무늬
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(10)} height={s(17)}>
          <Rect width={s(10)} height={s(17)} fill={bg} />
          <Rect width={s(10)} height={s(8.5)} fill={fg} fillOpacity={0.8} />
        </Pattern>
      )
    case 'foil':
      // 금박 라인: 바탕색 위 가운데 금색 점선 (금색은 고정)
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(14)} height={s(10)}>
          <Rect width={s(14)} height={s(10)} fill={bg} />
          <Line x1={s(1)} y1={s(5)} x2={s(9)} y2={s(5)} stroke="#D2AE57" strokeWidth={s(1.6)} strokeLinecap="round" />
          <Circle cx={s(11.8)} cy={s(5)} r={s(0.9)} fill="#D2AE57" />
        </Pattern>
      )
    case 'flower':
    case 'mini-flower': {
      // 다섯 잎 꽃. 미니는 같은 꽃을 작게 촘촘히
      const k = pattern === 'mini-flower' ? 0.55 : 1
      const t = (v) => s(v * k)
      const petals = [0, 72, 144, 216, 288].map((deg) => {
        const r = (deg * Math.PI) / 180
        return { cx: t(11 + Math.cos(r) * 3.6), cy: t(11 + Math.sin(r) * 3.6) }
      })
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={t(22)} height={t(22)}>
          <Rect width={t(22)} height={t(22)} fill={bg} />
          {petals.map((p, i) => (
            <Circle key={i} cx={p.cx} cy={p.cy} r={t(2.9)} fill={fg} fillOpacity={0.85} />
          ))}
          <Circle cx={t(11)} cy={t(11)} r={t(1.8)} fill="#FFF6DA" />
          <Circle cx={t(2)} cy={t(2)} r={t(1)} fill={fg} fillOpacity={0.5} />
        </Pattern>
      )
    }
    case 'lace':
      // 레이스: 동그란 꽃무늬 구멍이 이어진 모양
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(18)} height={s(18)}>
          <Rect width={s(18)} height={s(18)} fill={bg} />
          <Circle cx={s(9)} cy={s(9)} r={s(6.5)} fill="none" stroke={fg} strokeOpacity={0.7} strokeWidth={s(1.4)} />
          <Circle cx={s(9)} cy={s(9)} r={s(2.2)} fill={fg} fillOpacity={0.55} />
          {[0, 90, 180, 270].map((deg) => {
            const r = (deg * Math.PI) / 180
            return <Circle key={deg} cx={s(9 + Math.cos(r) * 4.4)} cy={s(9 + Math.sin(r) * 4.4)} r={s(1)} fill={fg} fillOpacity={0.55} />
          })}
          <Circle cx={s(0)} cy={s(0)} r={s(1.6)} fill={fg} fillOpacity={0.4} />
        </Pattern>
      )
    case 'script':
      // 손글씨: 필기체처럼 이어지는 고리 선
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(30)} height={s(16)}>
          <Rect width={s(30)} height={s(16)} fill={bg} />
          <Path
            d={`M${s(1)} ${s(10)} C${s(4)} ${s(2)} ${s(8)} ${s(2)} ${s(7)} ${s(9)} C${s(6.5)} ${s(13)} ${s(10)} ${s(12)} ${s(12)} ${s(8)} C${s(14)} ${s(4)} ${s(17)} ${s(5)} ${s(16)} ${s(10)} C${s(16)} ${s(13)} ${s(20)} ${s(12)} ${s(22)} ${s(8)} C${s(24)} ${s(4)} ${s(27)} ${s(6)} ${s(29)} ${s(10)}`}
            stroke={fg}
            strokeWidth={s(1.1)}
            fill="none"
            strokeLinecap="round"
          />
        </Pattern>
      )
    default:
      // solid: 무늬 없이 한 가지 색. 색 칸의 큰 원(바탕색)과 같은 색이라 고른 색 그대로 보인다
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(10)} height={s(10)}>
          <Rect width={s(10)} height={s(10)} fill={bg} />
        </Pattern>
      )
  }
}

/** 양 끝을 같은 방향으로 비스듬히 자른 테이프 (평행사변형) */
function diagonalPolygon(w, h) {
  const slant = Math.min(h * 0.6, w * 0.25)
  return `${slant.toFixed(2)},0 ${w},0 ${(w - slant).toFixed(2)},${h} 0,${h}`
}

/** 무늬 타일을 테이프 세로 가운데에 맞춘다 (타일 한 장이 테이프 높이 한가운데 오게 위쪽을 민다) */
function centeredTile(tile, height, crisp) {
  const tileHeight = Number(tile.props.height)
  if (!tileHeight) return tile
  const y = (height - tileHeight) / 2
  return cloneElement(tile, { y: crisp ? snapToPixel(y) : y })
}

/**
 * 손으로 찢은 듯한 테이프 끝. 잘게 들쭉날쭉한 톱니를 위에서 아래로 놓되 깊이를 조금씩 달리한다.
 * 같은 크기면 항상 같은 모양이 나오도록 난수 대신 사인값으로 흔든다. (다시 그릴 때 모양이 바뀌지 않게)
 */
function tornPolygon(w, h) {
  // 톱니 하나의 높이를 키워(지그재그를 넓게) 테이프 높이에 4~6개 정도 들어가게 한다.
  const teeth = Math.max(3, Math.round(h / 7))
  const depth = Math.min(Math.max(3, h * 0.17), w * 0.12)
  const jitter = (i, seed) => 0.55 + 0.45 * Math.abs(Math.sin(i * 12.9898 + seed * 78.233))
  const right = []
  const left = []
  for (let i = 0; i <= teeth * 2; i += 1) {
    const y = (h / (teeth * 2)) * i
    // 짝수 칸은 바깥, 홀수 칸은 안쪽으로 파고든다.
    const inR = i % 2 ? depth * jitter(i, 1) : depth * 0.12 * jitter(i, 3)
    const inL = i % 2 ? depth * jitter(i, 2) : depth * 0.12 * jitter(i, 4)
    right.push(`${(w - inR).toFixed(2)},${y.toFixed(2)}`)
    left.push(`${inL.toFixed(2)},${(h - y).toFixed(2)}`)
  }
  return [...right, ...left].join(' ')
}

/**
 * 마스킹테이프. 기본 패턴은 SVG 무늬로 채우고, 사용자가 올린 이미지는 테이프 네모 틀에 꽉 채워(cover) 넣는다.
 * 어느 쪽이든 끝 모양(절취선·직선)으로 자른다. 비치는 정도는 요소 불투명도(기본 80%)로 정한다.
 */
/**
 * 저장한 사진 테이프의 미리보기 크기(보관함 칸 · 공방 카드): 폭 width 안에서 정한 조각 비율(pieceRatio)대로 높이를 정하고
 * (minH~maxH 로 묶는다), 조각이 폭보다 짧으면 반복되게 segmentShare 를 돌려준다. 비율이 없던 예전 테이프는 규격 비율.
 */
export function tapePreviewBox(tape, width, minH, maxH, fallbackRatio) {
  const ratio = tape.pieceRatio ?? fallbackRatio
  const height = Math.min(maxH, Math.max(minH, width / ratio))
  const piece = height * ratio
  return { width, height, segmentShare: piece / width, pieceRatio: ratio }
}

// segmentShare: 사진 테이프 한 조각 폭 ÷ 테이프 길이(없으면 한 조각), pieceRatio: 잘라 둘 때 조각의 가로:세로
// crisp: 미리보기(보관함 칸 · 레이어 썸네일 등 줄여 그린 그림)는 무늬 배율을 기기 픽셀에 맞춰 칸 이음매가 깨지지 않게 한다(shared/pixelSnap).
// 캔버스는 확대 · 축소할 때 무늬가 튀지 않게 맞추지 않는다
export default function TapeView({ pattern, palette, segmentShare, pieceRatio, src, mediaFileId, crop, imageWidth, imageHeight, edge = 'torn', width, height, scale = 1, crisp = false, onAssetLoad, onAssetError }) {
  const hasImage = Boolean(mediaFileId || src)
  // 사진 테이프는 SVG 이미지로 그린다. 기기에서 GIF 를 넘기면 앱이 죽어 첫 장면 PNG 로 바꿔 넘긴다
  const image = useSvgImageUri({ src, mediaFileId }, useMediaUri({ src, mediaFileId }), { enabled: hasImage })
  const uri = image.uri
  // 첫 장면을 만들지 못하면 그릴 이미지가 없어 onAssetLoad 가 오지 않는다. 대신 오류를 알린다
  useEffect(() => {
    if (!image.failed) return
    reportMediaDisplayError({ src, mediaFileId })
    onAssetError?.()
  }, [image.failed]) // eslint-disable-line react-hooks/exhaustive-deps
  const svgId = useSvgId('tape')
  const look = tapeLook(pattern, palette)
  // 무늬·색·끝 모양이 바뀌면 id 도 바꾸고 SVG 를 새로 만든다. (같은 id 로 내용만 바꾸면 기기에서 이전 모양이 남는다)
  // 레이스는 테이프 길이에 따라 이어 붙인 벌 수도 넣는다(벌 수가 바뀌면 타일 내용이 바뀐다)
  const lace = LACE_TILES[look.pattern]
  const laceCount = lace ? laceCopies(look.pattern, lace, width / (lace.width * height / LACE_HEIGHT)) : 1
  const variant = `${edge}-${look.pattern}-${look.palette}${lace ? `-${laceCount}` : ''}`
  const patternId = `${svgId}-pattern-${variant}`
  const clipId = `${svgId}-clip-${variant}`
  // 테이프 모양(직선은 네모, 절취선은 톱니 다각형)
  const points =
    edge === 'torn'
      ? tornPolygon(width, height)
      : edge === 'diagonal'
        ? diagonalPolygon(width, height)
        : `0,0 ${width},0 ${width},${height} 0,${height}`
  if (!hasImage && look.pattern === 'stripe') {
    // 사선줄은 무늬 타일로 채우지 않고 줄마다 테이프 모양으로 잘라 직접 그린다.
    // 타일로 채우면 한 줄이 칸 경계마다 조각으로 나뉘어, 칸 크기가 소수점 픽셀이 될 때(캔버스 확대 · 회전) 이음매에서 줄이 어긋났다.
    const s = crisp ? snapScale(scale) : scale
    const offset = (height - s * 12) / 2 // 예전 타일과 같은 자리에 줄이 오게 (centeredTile 과 같은 위치)
    return (
      <Svg key={variant} width={width} height={height}>
        <Polygon points={points} fill={look.bg} />
        {stripeBands(parsePoints(points), width + height, s, crisp ? snapToPixel(offset) : offset).map((band, i) => (
          <Polygon key={i} points={band} fill={look.fg} />
        ))}
      </Svg>
    )
  }
  if (!hasImage) {
    // 무늬 테이프는 잘라내기(ClipPath) 대신 테이프 모양 자체를 무늬로 채운다.
    // Android 의 SVG 는 G 에 건 ClipPath 를 무시하는 경우가 있어 절취선↔직선이 안 바뀌었다.
    return (
      <Svg key={variant} width={width} height={height}>
        <Defs>
          {/* 레이스 타일은 테이프 위끝에 맞춰 둔다(아래 절반이 빈 두 배 높이라 가운데 맞추면 안 된다) */}
          {lace
            ? PatternTile({ id: patternId, pattern: look.pattern, bg: look.bg, fg: look.fg, scale, height, width })
            : centeredTile(PatternTile({ id: patternId, pattern: look.pattern, bg: look.bg, fg: look.fg, scale: crisp ? snapScale(scale) : scale, height, width }), height, crisp)}
        </Defs>
        <Polygon points={points} fill={`url(#${patternId})`} />
      </Svg>
    )
  }
  // 이미지 테이프는 모양으로 잘라야 해서 ClipPath 를 이미지에 직접 건다.
  return (
    <Svg key={variant} width={width} height={height}>
      <G>
        <TapeImage
          onAssetLoad={onAssetLoad}
          uri={uri}
          crop={crop}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          width={width}
          height={height}
          segmentWidth={segmentShare ? width * segmentShare : width}
          pieceRatio={pieceRatio}
          points={points}
          clipId={clipId}
          crisp={crisp}
        />
      </G>
    </Svg>
  )
}

/**
 * 이미지 테이프: 고른 영역(crop)을 '한 조각' 틀(segmentWidth × height)에 채운다.
 * 테이프가 한 조각보다 길면 같은 조각을 옆으로 이어 붙여 반복한다(좌우로 늘리면 조각이 더 이어진다).
 * 두께를 바꾸면 조각도 가로세로 비율 그대로 커진다(segmentW 가 두께와 함께 바뀐다). pieceRatio 는 조각의 가로:세로라 늘 segmentW / 두께와 같다.
 * crop 이 없던 예전 테이프는 가운데 기준.
 * 조각마다 '테이프 모양 ∩ 그 조각 칸'으로 잘라야 자른 영역 밖(원본의 나머지)이 옆 칸으로 비어져 나오지 않는다.
 * (G 에 건 ClipPath 는 Android 에서 무시될 때가 있어, 겹친 잘라내기 대신 다각형을 직접 잘라 이미지마다 건다)
 */
function TapeImage({ onAssetLoad, uri, crop, imageWidth, imageHeight, width, height, segmentWidth, pieceRatio, points, clipId, crisp }) {
  if (!uri) return null
  const href = { uri }
  // 미리보기(crisp)는 조각 경계를 기기 픽셀에 맞춰 이음매가 흐린 줄로 보이지 않게 한다
  const seg = Math.max(1, crisp ? snapToPixel(segmentWidth || width) : segmentWidth || width)
  const count = Math.max(1, Math.ceil(width / seg - 0.001))
  // 자를 때 높이(조각 폭 ÷ 가로:세로)로 자리를 잡은 뒤, 지금 두께에 맞춰 위아래만 늘린다
  const pieceH = pieceRatio ? seg / pieceRatio : height
  const stretch = height / pieceH
  const base = crop && imageWidth && imageHeight ? coverLayout({ imageWidth, imageHeight, crop }, seg, pieceH) : null
  const layout = base && { left: base.left, width: base.width, top: base.top * stretch, height: base.height * stretch }
  const shape = parsePoints(points)
  // 이웃 칸 사이에 가는 틈이 보이지 않게 아주 조금 겹친다.
  const clips = Array.from({ length: count }, (_, i) =>
    clipToStrip(shape, i * seg - (i ? SEAM : 0), (i + 1) * seg + (i < count - 1 ? SEAM : 0)),
  )
  return (
    <>
      <Defs>
        {clips.map((clip, i) => (
          <ClipPath key={i} id={`${clipId}-${count}-${i}`}>
            <Polygon points={clip} />
          </ClipPath>
        ))}
      </Defs>
      {clips.map((_, i) => {
        const clipPath = `url(#${clipId}-${count}-${i})`
        return layout ? (
          <SvgImage
            key={i}
            onLoad={i === 0 ? onAssetLoad : undefined}
            href={href}
            x={i * seg + layout.left}
            y={layout.top}
            width={layout.width}
            height={layout.height}
            preserveAspectRatio="none"
            clipPath={clipPath}
          />
        ) : (
          <SvgImage
            key={i}
            onLoad={i === 0 ? onAssetLoad : undefined}
            href={href}
            x={i * seg}
            width={seg}
            height={height}
            preserveAspectRatio="xMidYMid slice"
            clipPath={clipPath}
          />
        )
      })}
    </>
  )
}

const SEAM = 0.4

function parsePoints(points) {
  return points.split(' ').map((pair) => pair.split(',').map(Number))
}

/** 다각형에서 a·x + b·y ≤ c 인 쪽만 남긴다. (Sutherland–Hodgman, 경계 하나) */
function clipHalfPlane(shape, a, b, c) {
  const out = []
  shape.forEach((cur, i) => {
    const prev = shape[(i + shape.length - 1) % shape.length]
    const dc = a * cur[0] + b * cur[1] - c, dp = a * prev[0] + b * prev[1] - c
    if ((dc <= 0) !== (dp <= 0)) {
      const t = dp / (dp - dc)
      out.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])])
    }
    if (dc <= 0) out.push(cur)
  })
  return out
}

/**
 * 사선줄(/ 방향 45°) 띠마다 테이프 모양으로 자른 다각형. 예전 12×12 타일(줄 굵기 3.2)과 같은 간격 · 굵기 · 자리다.
 * 줄의 중심선은 x + y = offset + 12·s·k 이고, 수직 굵기 3.2·s 는 x + y 로 재면 ±1.6·s·√2 다.
 */
export function stripeBands(shape, span, s, offset) {
  const step = 12 * s, half = 1.6 * s * Math.SQRT2
  const bands = []
  for (let k = Math.floor((-half - offset) / step); offset + k * step - half <= span; k++) {
    const c = offset + k * step
    const band = clipHalfPlane(clipHalfPlane(shape, 1, 1, c + half), -1, -1, -(c - half))
    if (band.length >= 3) bands.push(band.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '))
  }
  return bands
}

/** 다각형을 세로 띠(left ≤ x ≤ right) 안으로 자른다. (Sutherland–Hodgman, 세로 경계 두 개) */
function clipToStrip(shape, left, right) {
  const cut = (input, inside, edgeX) => {
    const out = []
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length]
      const curIn = inside(cur[0])
      if (curIn !== inside(prev[0])) {
        const t = (edgeX - prev[0]) / (cur[0] - prev[0])
        out.push([edgeX, prev[1] + t * (cur[1] - prev[1])])
      }
      if (curIn) out.push(cur)
    })
    return out
  }
  const result = cut(cut(shape, (x) => x >= left, left), (x) => x <= right, right)
  return result.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}
