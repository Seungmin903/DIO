import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { Asset } from 'expo-asset'
import { readLegacyExportImage } from '../utils/exportImage'
import { pngResource, readBytes } from '../utils/gifFileIO'
import { createStickerPlaybackCache, createStickerPlayer, prepareStickerPlayback } from '../utils/stickerPlayback.js'

const cache = createStickerPlaybackCache(async (source, signal) => {
  if (signal.aborted) throw new Error('Sticker playback cancelled')
  let uri = source?.uri
  if (typeof source === 'number') {
    const asset = Asset.fromModule(source)
    await asset.downloadAsync()
    uri = asset.localUri ?? asset.uri
  }
  if (!uri || signal.aborted) throw new Error('Sticker source unavailable')
  const input = await readLegacyExportImage(uri)
  try { return await prepareStickerPlayback(await readBytes(input.blob), pngResource, { signal }) }
  finally { input.dispose?.() }
})

/** iOS의 움직이는 효과는 한 플레이어가 고른 정지 PNG 장면을 모든 레이어에 전달한다. */
export function useStickerPlayback(source) {
  const key = typeof source === 'number' ? `asset:${source}` : source?.uri ?? null
  const [prepared, setPrepared] = useState(null)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    setPrepared(null)
    if (!key) return
    let active = true
    let lease = cache.acquire(key, source)
    const accept = (current) => current.promise.then((clip) => {
      if (active) { setIndex(0); setPrepared({ key, clip }) }
    }, () => { if (active) setPrepared({ key, error: true }) })
    accept(lease)
    const unsubscribe = cache.subscribe(key, (readyPromise) => {
      if (!active || lease.promise === readyPromise) return
      const previous = lease
      lease = cache.acquire(key, source)
      accept(lease).then(() => previous.release())
    })
    return () => { active = false; unsubscribe(); lease.release() }
  }, [key])
  const clip = prepared?.key === key && !prepared.clip?.disposed ? prepared.clip : null
  useEffect(() => {
    if (!clip) return
    const player = createStickerPlayer(clip, setIndex)
    if (!AppState.currentState || AppState.currentState === 'active') player.play()
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') player.play(); else player.pause() })
    return () => { player.stop(); subscription.remove() }
  }, [clip])
  return { source: clip?.frames[index]?.source ?? null, error: prepared?.key === key && prepared.error }
}
