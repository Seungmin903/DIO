/**
 * SVG 이미지용 GIF 첫 장면 PNG 보관소. 같은 GIF 는 한 번만 만들고, 쓰는 화면(retain)이 있는 동안은 지우지 않는다.
 * 아무도 안 쓰는 완성본이 limit 개를 넘으면 오래 안 쓴 것부터 지운다(dispose 로 캐시 파일 삭제).
 * 실패는 쓰는 화면이 있는 동안만 기억해 다시 그릴 때마다 변환을 되풀이하지 않는다. 쓰는 화면이 모두 사라지면 실패 기록을 지워,
 * 보관소가 아직 파일을 못 내려준 것 같은 일시적 오류라면 다음에 그 화면을 열 때 다시 만든다.
 * 상태는 바뀔 때마다 새 스냅샷 객체({ status: 'pending' | 'ready' | 'failed', uri, error })로 바꿔 useSyncExternalStore 가 알아챈다.
 */
export function createStillCache({ make, dispose = () => {}, limit = 24 }) {
  const entries = new Map() // key → { snapshot, users, resource, used }
  const listeners = new Set()
  let tick = 0
  const notify = () => listeners.forEach((listener) => listener())
  const set = (entry, snapshot) => { entry.snapshot = snapshot; notify() }

  function trim() {
    for (const [key, entry] of entries) {
      if (entry.snapshot.status === 'failed' && entry.users === 0) entries.delete(key)
    }
    const idle = [...entries].filter(([, e]) => e.snapshot.status === 'ready' && e.users === 0).sort((a, b) => a[1].used - b[1].used)
    for (const [key, entry] of idle.slice(0, Math.max(0, idle.length - limit))) {
      entries.delete(key)
      if (entry.resource) { try { dispose(entry.resource) } catch { /* 캐시 파일은 OS 도 지운다 */ } }
    }
  }

  return {
    /** 화면이 key 의 첫 장면을 쓰기 시작한다. 없으면 만든다. 돌려준 함수로 다 썼다고 알린다 */
    retain(key, input) {
      let entry = entries.get(key)
      if (!entry) {
        entry = { snapshot: { status: 'pending' }, users: 0, used: 0 }
        entries.set(key, entry)
        Promise.resolve().then(() => make(input)).then(
          (resource) => {
            entry.resource = resource
            if (entries.get(key) !== entry) { try { dispose(resource) } catch { /* 이미 지운 항목 */ } return }
            set(entry, { status: 'ready', uri: resource.uri })
            trim()
          },
          (error) => { if (entries.get(key) === entry) { set(entry, { status: 'failed', error }); trim() } },
        )
      }
      entry.users++
      entry.used = ++tick
      let released = false
      return () => { if (released) return; released = true; entry.users--; entry.used = ++tick; trim() }
    },
    get: (key) => entries.get(key)?.snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    size: () => entries.size,
  }
}

/**
 * 문자열을 짧은 키로 (큰 data URI 를 그대로 Map 키로 들고 있지 않게).
 * 키가 겹치면 다른 GIF 의 첫 장면이 오류 없이 보이므로, 서로 다른 해시 두 개(djb2 · FNV-1a, 합쳐 64비트)와 길이를 함께 쓴다
 */
export function shortKey(text) {
  let djb = 5381, fnv = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    djb = (Math.imul(djb, 33) + c) >>> 0
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0
  }
  return `${djb.toString(36)}.${fnv.toString(36)}:${text.length}`
}
