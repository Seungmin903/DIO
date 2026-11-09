// 노선 색 줄: 칸 4개 + 추가(+) 한 줄로 콤팩트하게 둔다(실기 피드백 2026-11-09). 배경색 · 레이아웃 색은 다른 속지와 같은 견본 7개 그대로다.
// 보이는 4칸 = [직접 고른 최근 색(새것이 왼쪽) … , 기본 견본 …] 에서 앞 4개. 지금 쓰는 색이 그 안에 없으면 맨 앞에 끼워 넣어 항상 보이게 한다.
// 직접 고른 색은 왼쪽에서 들어오고 오른쪽 끝 색이 밀려난다.
export const PAPER_COLOR_ROW = 4
const key = color => String(color ?? '').toUpperCase()

/**
 * recent: 직접 고른 색(최근 순), presets: [이름, 색] 기본 견본, current: 지금 색. → [{ color, name }] size 개
 */
export function paperColorRow(recent, presets, current, size = PAPER_COLOR_ROW) {
  const names = new Map(presets.map(([name, color]) => [key(color), name]))
  const ordered = [...recent.map(color => key(color)), ...presets.map(([, color]) => key(color))]
  const seen = new Set(), row = []
  for (const color of ordered) {
    if (!color || seen.has(color)) continue
    seen.add(color); row.push(color)
  }
  let shown = row.slice(0, size)
  const now = key(current)
  if (now && /^#[0-9A-F]{6}$/.test(now) && !shown.includes(now)) shown = [now, ...shown].slice(0, size)
  return shown.map(color => ({ color, name: names.get(color) ?? color }))
}

/** 기기에 저장해 둔 최근 색 목록(최신이 앞)을 다시 읽는다: 형식이 틀린 값은 버리고 중복은 하나로, 순서는 그대로, 최대 size. */
export function restorePaperColors(saved, size = PAPER_COLOR_ROW) {
  if (!Array.isArray(saved)) return []
  // 오래된 것부터 앞에 넣어 가면 최신이 맨 앞에 남는다(pushPaperColor 가 형식 검사 · 중복 제거 · 개수 제한을 맡는다)
  return saved.reduceRight((list, color) => pushPaperColor(list, color, size), [])
}

/** 직접 고른 색을 최근 목록 맨 앞에 넣는다(중복 제거, 최대 size). */
export function pushPaperColor(recent, color, size = PAPER_COLOR_ROW) {
  const now = key(color)
  if (!/^#[0-9A-F]{6}$/.test(now)) return recent
  return [now, ...recent.map(key).filter(item => item !== now)].slice(0, size)
}
