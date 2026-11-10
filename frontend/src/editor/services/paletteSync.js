// 꾸미기 공방 도구 탭 팔레트(도구별 고정 칸)를 계정 서버(/api/v1/me/palettes)와 맞춘다. 런타임 의존성은 모두 주입받는다(테스트에서 바꿔 끼운다).
// - 서버에는 도구별 칸 목록 문서 한 벌을 version 과 함께 둔다(다르면 409). 문서에 없는 도구 · 칸은 기본 색이다.
// - 이 기기에서 마지막으로 맞춘 상태(meta: 계정 · 그때의 서버 문서)를 기억하고, 칸마다 세 갈래로 합친다:
//   기기 칸이 지난번과 다르면(이 기기에서 바꿈) 기기 것, 아니면 서버 것. 그래서 두 기기가 서로 다른 칸을 바꿔도 둘 다 남는다.
//   이 기기 처음(새 기기 · 재설치): 지난번 = 기본 색이라, 기기에서 바꾼 칸만 남기고 나머지는 서버 것을 받는다.
//   다른 계정이 쓰던 기기: 그 계정의 팔레트를 올리지 않고 서버 것을 그대로 받는다.

export const PALETTE_SYNC_DEBOUNCE_MS = 1500
const stable = value => JSON.stringify(value)

/** 서버 문서 → 도구마다 기본 칸 수를 채운 목록(형식이 틀린 칸은 기본 색) */
export function fillPalettes(palettes, { scopes, defaults, normalize }) {
  const out = {}
  for (const scope of scopes) {
    const saved = Array.isArray(palettes?.[scope]) ? palettes[scope] : []
    out[scope] = defaults(scope).map((value, i) => (typeof saved[i] === 'string' && normalize(scope, saved[i])) || value)
  }
  return out
}

/** 칸마다 세 갈래 합치기: 기기 칸이 base 와 다르면 기기 것, 아니면 서버 것 */
export function mergePalettes(base, local, server, scopes) {
  const out = {}
  for (const scope of scopes) out[scope] = server[scope].map((value, i) => local[scope][i] !== base[scope][i] ? local[scope][i] : value)
  return out
}

/**
 * account: 지금 로그인한 계정 id(문자열)
 * api: { get() → { version, palettes }, put(expectedVersion, palettes) → { version, palettes } } (409 는 error.status === 409)
 * palettes: { scopes, defaults(scope), normalize(scope, value), load(), snapshot(scope), subscribe(listener) → 해제, apply(scope, expected, colors) → 바꿨으면 true }
 * storage · key: 이 기기에서 맞춘 상태(meta)를 둔다
 */
export function createPaletteSync({ account, api, palettes, storage, key, isActive = () => true, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = PALETTE_SYNC_DEBOUNCE_MS, onError = () => {} }) {
  const { scopes } = palettes
  const metaKey = `${key}:meta`
  let meta = null, timer = null, running = null, again = false, closed = false, unsubscribe = null, applying = false
  const active = () => { if (closed || !isActive()) throw Object.assign(Error('팔레트 동기화가 끝났어요.'), { code: 'SYNC_CLOSED' }) }
  const readMeta = async () => { try { const value = JSON.parse(await storage.getItem(metaKey) ?? 'null'); return value && typeof value === 'object' ? value : null } catch { return null } }
  const fill = doc => fillPalettes(doc, palettes)
  const local = () => Object.fromEntries(scopes.map(scope => [scope, [...palettes.snapshot(scope)]]))

  // 지난번에 맞춘 문서. 다른 계정이 쓰던 기기면 기기 것을 base 로 두어 기기 칸이 '바뀜'으로 보이지 않게 한다(서버 것을 받는다)
  function baseFor(current) {
    if (meta && meta.account !== account) return current
    if (!meta) return fill({})
    try { return fill(JSON.parse(meta.synced)) } catch { return fill({}) }
  }

  async function reconcile() {
    active()
    meta ??= await readMeta(); active()
    await palettes.load(); active()
    let server = await api.get(); active()
    const base = baseFor(local())
    let merged, localNow
    for (let attempt = 0; ; attempt++) {
      const serverFull = fill(server.palettes)
      localNow = local() // 합칠 때 본 기기 값. 기기에 들일 때 이 값과 달라졌으면(그사이 사용자가 바꿈) 덮지 않는다
      merged = mergePalettes(base, localNow, serverFull, scopes)
      if (stable(merged) === stable(serverFull)) break // 서버가 이미 같다(올릴 것 없음)
      try { server = await api.put(server.version, merged); active(); break }
      catch (error) {
        if (error?.status !== 409 || attempt >= 2) throw error
        server = await api.get(); active() // 다른 기기가 먼저 바꿨다: 다시 받아 합친다
      }
    }
    const synced = fill(server.palettes)
    // 기기에 들인다. 합친 뒤(저장 응답을 기다리는 동안 포함) 사용자가 바꾼 도구는 덮지 않고(apply 가 false) 맞춘 상태도 기록하지 않은 채 다시 맞춘다
    let complete = true
    applying = true
    try {
      for (const scope of scopes) {
        if (stable(palettes.snapshot(scope)) === stable(synced[scope])) continue
        if (!await palettes.apply(scope, localNow[scope], synced[scope])) complete = false
        active()
      }
    } finally { applying = false }
    if (!complete) { again = true; return }
    meta = { account, version: server.version, synced: stable(synced) }
    await storage.setItem(metaKey, stable(meta))
  }

  function run() {
    if (running) { again = true; return running }
    running = reconcile().catch(error => { if (error?.code !== 'SYNC_CLOSED') onError(error) })
      .finally(() => { running = null; if (again && !closed) { again = false; schedule() } })
    return running
  }
  function schedule() {
    if (closed) return
    if (timer != null) clearTimer(timer)
    timer = setTimer(() => { timer = null; run() }, debounceMs)
  }

  return {
    /** 처음 맞추고, 그 뒤 팔레트가 바뀔 때마다(잠시 모아) 올린다 */
    start() {
      // 받아서 바꾸는 중의 알림은 바로 올리지 않는다. 그 사이 사용자가 바꿨을 수도 있어 맞추기가 끝나면 한 번 더 맞춘다
      unsubscribe = palettes.subscribe(() => { if (applying) again = true; else schedule() })
      return run()
    },
    /** 지금 바로 다시 맞춘다(앱이 다시 앞으로 왔을 때 등) */
    sync: run,
    whenIdle: async () => { while (running || timer != null) { if (timer != null) { clearTimer(timer); timer = null; run() } await running } },
    stop() { closed = true; if (timer != null) clearTimer(timer); timer = null; unsubscribe?.() },
  }
}
