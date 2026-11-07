import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useMediaEntry, useMediaUri } from '../../hooks/useMediaUri'
import { mediaService, reportMediaDisplayError } from '../../services/mediaStore'
import { mediaId } from '../../utils/mediaReferences.js'
import { builtinStickerOf } from '../../builtinStickers'
import { useStickerPacks } from '../../hooks/useStickerPacks'
import { useRemoteAssetUri } from '../../../shared/remoteAssets/useRemoteAssetUri'
import { stickerSource } from '../../stickerAssets'
import { colors } from '../../../shared/theme'
import BuiltinStickerArt from '../canvas/BuiltinStickerArt'
import DdayWidget from '../../widgets/DdayWidget'
import { DDAY_STYLES, ddayStyleOf } from '../../widgets/dday'
import { createMemo } from '../../widgets/memo'
import { MEMO_ARTS } from '../../widgets/memoArt'
import ShapeContent from '../canvas/ShapeContent'
import { snapStepScale } from '../../../shared/pixelSnap'

const RETRIES = 2

/**
 * 스티커 보관함 칸 그림 (편집기 보관함 · 표지 스티커가 함께 쓴다).
 * - expo-image 로 칸 크기에 맞춰 줄여 풀고 메모리 · 디스크에 캐시해 다시 열 때 바로 보인다.
 * - 불러오지 못하면 잠깐 뒤 두 번까지 다시 시도하고, 그래도 안 되면 흐린 자리표시만 남긴다.
 */
export default function StickerThumbImage({ item, style }) {
  useStickerPacks() // 원격 스티커 팩이 늦게 들어오면 다시 그린다
  if (item.kind === 'memo') return <MemoThumb item={item} style={style} />
  if (item.widget) return <WidgetThumb item={item} style={style} />
  const builtin = builtinStickerOf(item.builtin)
  if (builtin?.image) return <RemoteImageThumb image={builtin.image} style={style} />
  if (builtin) return <View style={style}><BuiltinStickerArt sticker={builtin} canvas width="100%" height="100%" /></View>
  if (item.builtin) return <View style={style} /> // 아직 받지 못한 원격 스티커: 빈 칸으로 두고 팩이 오면 그린다
  return <ImageThumb item={item} style={style} />
}

/** 원격 그림 스티커(팩의 PNG). 받기 전에는 흐린 자리표시 */
function RemoteImageThumb({ image, style }) {
  const uri = useRemoteAssetUri(image)
  if (!uri) return <View style={[styles.placeholder, style]} />
  return <Image source={{ uri }} style={style} contentFit="contain" cachePolicy="memory-disk" transition={0} recyclingKey={image.key} />
}

// 미리보기는 늘 'D-37' 샘플이다. 매 렌더 새 객체를 만들어 위젯의 memo 가 무력화되지 않게 모듈 상수로 둔다.
const THUMB_TODAY = { y: 2000, m: 1, d: 1 }
const THUMB_WIDGETS = Object.fromEntries(DDAY_STYLES.map((style) => [style.id, { kind: 'dday', style: style.id, title: '', date: '2000-02-07' }]))

// 위젯은 이미지가 없어 칸 크기에 맞춰 직접 그린다 (칸 안에서 가로로 꽉 차게, 긴 변은 칸에 맞춤).
function WidgetThumb({ item, style }) {
  const [box, setBox] = useState(null)
  const size = ddayStyleOf(item.style)
  const fit = box ? Math.min(box.width / size.w, box.height / size.h) * 0.92 : 0 // 가장자리 여백: 칸 끝에서 잘려 보이지 않게
  return (
    <View style={[style, styles.widgetBox]} onLayout={(event) => setBox(event.nativeEvent.layout)}>
      {fit > 0 && <DdayWidget widget={THUMB_WIDGETS[size.id]} width={size.w * fit} height={size.h * fit} today={THUMB_TODAY} />}
    </View>
  )
}

// 메모 미리보기: 붙일 때와 같은 도형을 칸 크기로 줄여 그린다
const THUMB_MEMOS = Object.fromEntries(MEMO_ARTS.map((art) => [art.id, createMemo({ memo: art.id }, { x: 0, y: 0 })]))

// 메모지 줄 · 모눈 · 점의 반복 간격(그림 좌표). 줄여 그릴 때 이 간격을 기기 픽셀 정수로 맞춰 줄마다 진하기가 달라지지 않게 한다
const memoStep = (art) => {
  const at = (name) => [...new Set([...art.svg.matchAll(new RegExp(` ${name}="([0-9.]+)"`, 'g'))].map((m) => Number(m[1])))].sort((a, b) => a - b)
  const gaps = ['y1', 'x1', 'cx', 'cy'].flatMap((name) => at(name).slice(1).map((value, i) => Math.round((value - at(name)[i]) * 100) / 100))
  const count = {}
  for (const gap of gaps) if (gap > 2) count[gap] = (count[gap] ?? 0) + 1
  const [step] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] ?? []
  return step ? Number(step) : null
}
const MEMO_STEPS = Object.fromEntries(MEMO_ARTS.map((art) => [art.id, memoStep(art)]))

function MemoThumb({ item, style }) {
  const [box, setBox] = useState(null)
  const memo = THUMB_MEMOS[item.memo] ?? THUMB_MEMOS[MEMO_ARTS[0].id]
  const step = MEMO_STEPS[memo.art]
  const raw = box ? Math.min(box.width / memo.w, box.height / memo.h) * 0.92 : 0
  // 미리보기 그래픽 규칙: 줄 간격을 기기 픽셀에 맞춘다. 맞춘 배율이 칸을 넘으면 줄인다
  const snapped = raw > 0 && step ? snapStepScale(raw, step) : raw
  const fit = snapped > raw / 0.92 ? snapStepScale(raw * 0.9, step) : snapped
  return (
    <View style={[style, styles.widgetBox]} onLayout={(event) => setBox(event.nativeEvent.layout)}>
      {fit > 0 && <ShapeContent object={memo} zoom={fit} hideText crisp />}
    </View>
  )
}

function ImageThumb({ item, style }) {
  const id = item.asset ? null : mediaId(item.poster ?? item)
  const uri = useMediaUri(item.asset ? null : item, { still: true })
  const [attempt, setAttempt] = useState(0)
  const failed = useMediaEntry(id)?.status === 'error'
  // 사용자 스티커: 보관소에서 읽다 실패하면(잠깐 바쁜 저장소 등) 다시 읽는다
  useEffect(() => {
    if (!failed || attempt >= RETRIES) return undefined
    const timer = setTimeout(() => { setAttempt(value => value + 1); mediaService.resolveDisplay(id).catch(() => {}) }, 500 * (attempt + 1))
    return () => clearTimeout(timer)
  }, [failed, attempt, id])
  // 그리기 실패 재시도 타이머는 칸이 사라지면 함께 멈춘다
  const drawRetry = useRef(null)
  useEffect(() => () => clearTimeout(drawRetry.current), [])
  const source = stickerSource(item, true, uri)
  if (!source || failed && attempt >= RETRIES) {
    return item.emoji ? <Text style={styles.emoji}>{item.emoji}</Text> : <View style={[styles.placeholder, style]} />
  }
  return <Image key={attempt} source={source} style={style} contentFit="contain" cachePolicy="memory-disk" transition={0} recyclingKey={String(item.asset ?? id ?? item.src)}
    onError={() => {
      // 보관소 읽기 실패는 위 effect 가 다시 시도하므로 여기서 한 번 더 올리지 않는다
      if (failed) return
      if (attempt < RETRIES) { clearTimeout(drawRetry.current); drawRetry.current = setTimeout(() => setAttempt(value => value + 1), 400 * (attempt + 1)) } else if (id) reportMediaDisplayError(item)
    }} />
}

const styles = StyleSheet.create({
  emoji: { fontSize: 28, textAlign: 'center' },
  widgetBox: { alignItems: 'center', justifyContent: 'center' },
  placeholder: { borderRadius: 8, backgroundColor: colors.surfaceMuted },
})
