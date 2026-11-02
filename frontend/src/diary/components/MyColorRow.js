import { useRef, useState } from 'react'
import { useColorPresets } from '../../editor/components/controls/MyColorPresets'
import PresetColorEditor from './PresetColorEditor'
import { MineRow } from './StudioPresets'

/**
 * 견본 줄 아래 '내 색상' 줄. 모양과 동작은 꾸미기 공방 도구 탭의 내 색상과 같다:
 * 저장한 색을 누르면 바꾸기 · 지우기 말풍선, 맨 끝 + 는 추가 말풍선. 여기서는 '완료'를 누르면 그 색을 속지에도 적용하고, 지금 쓰는 색에 고리를 두른다.
 * scope: 저장 목록 구분(controls/MyColorPresets), label: 색 이름 앞말(예: '종이' → '내 종이 색'), value: 지금 색, onChange(color)
 */
export default function MyColorRow({ scope, label, value, onChange }) {
  const mine = useColorPresets(scope)
  const cells = useRef({})
  // { kind: 'mine' | 'add', index, anchor }: 바꾸는 색과 그 견본의 창 안 자리(말풍선을 그 옆에 띄운다)
  const [editing, setEditing] = useState(null)
  const open = (kind, index) => () => {
    const node = cells.current[`${kind}${index}`]
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => setEditing({ kind, index, anchor: { x, y, width, height } }))
    else setEditing({ kind, index, anchor: null })
  }
  const ref = (kind, index) => node => { cells.current[`${kind}${index}`] = node }
  const apply = color => onChange(color.toUpperCase())
  const mineEntry = editing?.kind === 'mine' ? mine.presets[editing.index] : null
  let editor = null
  if (mineEntry) editor = <PresetColorEditor title={`내 ${label} 색 바꾸기`} value={mineEntry} anchor={editing.anchor}
    onClose={() => setEditing(null)} onRemove={() => { mine.remove(mineEntry); setEditing(null) }}
    onDone={color => { mine.replace(mineEntry, color); apply(color); setEditing(null) }} />
  else if (editing?.kind === 'add') editor = <PresetColorEditor title={`내 ${label} 색 추가`} original={null} anchor={editing.anchor}
    value={mine.presets[mine.presets.length - 1] ?? value}
    onClose={() => setEditing(null)} onDone={color => { mine.add(color); apply(color); setEditing(null) }} />
  return <>
    <MineRow mine={mine} label={label} editing={editing} cellRef={ref} onOpen={open} selected={value?.toUpperCase()} />
    {editor}
  </>
}
