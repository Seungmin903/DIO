import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useMediaUri } from '../../hooks/useMediaUri'
import { mediaService, mediaRegistry } from '../../services/mediaStore'
import { mediaId } from '../../utils/mediaReferences.js'
import { stickerSource } from '../../stickerAssets'
import { STICKER_THUMBS } from '../../stickerThumbs'
import { colors } from '../../../shared/theme'

const RETRIES = 2

/**
 * 스티커 보관함 칸 그림 (편집기 보관함 · 표지 스티커가 함께 쓴다).
 * - 기본 스티커는 칸용 128px 썸네일을 쓴다. 캔버스에 붙인 스티커는 원본을 그대로 쓴다.
 * - expo-image 로 칸 크기에 맞춰 줄여 풀고 메모리 · 디스크에 캐시해 다시 열 때 바로 보인다.
 * - 불러오지 못하면 잠깐 뒤 두 번까지 다시 시도하고, 그래도 안 되면 흐린 자리표시만 남긴다.
 */
export default function StickerThumbImage({ item, style }) {
  const id = item.asset ? null : mediaId(item.poster ?? item)
  const uri = useMediaUri(item.asset ? null : item, { still: true })
  const [attempt, setAttempt] = useState(0)
  const failed = id && mediaRegistry.get(id)?.status === 'error'
  // 사용자 스티커: 보관소에서 읽다 실패하면(잠깐 바쁜 저장소 등) 다시 읽는다
  useEffect(() => {
    if (!failed || attempt >= RETRIES) return undefined
    const timer = setTimeout(() => { setAttempt(value => value + 1); mediaService.resolveDisplay(id).catch(() => {}) }, 500 * (attempt + 1))
    return () => clearTimeout(timer)
  }, [failed, attempt, id])
  const source = item.asset ? STICKER_THUMBS[item.asset] ?? stickerSource(item, true) : stickerSource(item, true, uri)
  if (!source || failed && attempt >= RETRIES) {
    return item.emoji ? <Text style={styles.emoji}>{item.emoji}</Text> : <View style={[styles.placeholder, style]} />
  }
  return <Image key={attempt} source={source} style={style} contentFit="contain" cachePolicy="memory-disk" transition={0} recyclingKey={String(item.asset ?? id ?? item.src)}
    onError={() => { if (attempt < RETRIES) setTimeout(() => setAttempt(value => value + 1), 400 * (attempt + 1)) }} />
}

const styles = StyleSheet.create({
  emoji: { fontSize: 28, textAlign: 'center' },
  placeholder: { borderRadius: 8, backgroundColor: colors.surfaceMuted },
})
