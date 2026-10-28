import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import ConfirmDialog from '../controls/ConfirmDialog'

// Selection lives only while the photo tab is mounted. Removal changes the list,
// never the media repository or objects already placed on a page.
export default function RecentPhotos({ photos, columns, onAdd, onRemove, renderThumb }) {
  const [managing, setManaging] = useState(false)
  const [selected, setSelected] = useState([])
  const [pending, setPending] = useState(null)
  const confirming = useRef(false)
  const ids = selected.filter(id => photos.some(photo => photo.id === id))
  const finish = () => { setManaging(false); setSelected([]); setPending(null) }
  const ask = (values) => { confirming.current = false; setPending([...values]) }
  const toggle = id => setSelected(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id])
  return <View style={s.section}>
    <View style={s.row}>
      <Text style={s.title}>최근 불러온 사진</Text>
      {photos.length > 0 && <Pressable accessibilityRole="button" onPress={() => managing ? finish() : setManaging(true)} style={s.button}>
        <Text style={s.text}>{managing ? '완료' : '관리'}</Text>
      </Pressable>}
    </View>
    {managing && <View style={s.row}>
      <Text style={s.text} accessibilityLiveRegion="polite">{ids.length}개 선택</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ids.length }} disabled={!ids.length} onPress={() => ask(ids)} style={[s.button, !ids.length && s.disabled]}>
        <Text style={s.danger}>선택한 {ids.length}개 삭제</Text>
      </Pressable>
    </View>}
    {!photos.length && <Text style={s.text}>최근 불러온 사진이 없어요.</Text>}
    <View style={s.grid}>{photos.map((photo, index) => {
      const checked = ids.includes(photo.id)
      const name = `${photo.name ?? '사진'} ${index + 1}`
      return <View key={photo.id} style={[s.cell, { width: `${100 / Math.ceil(columns / 2)}%` }]}>
        <Pressable accessibilityRole={managing ? 'checkbox' : 'button'} accessibilityState={managing ? { checked } : undefined}
          accessibilityLabel={`${name} ${managing ? '선택' : '붙이기'}`}
          onPress={() => managing ? toggle(photo.id) : onAdd({ kind: 'photo', ...photo })}
          style={[s.tile, checked && s.selected]}>
          {renderThumb(photo)}
          {managing && <View pointerEvents="none" style={[s.check, checked && s.checked]}><Text style={s.checkText}>{checked ? '✓' : ''}</Text></View>}
        </Pressable>
        {!managing && <Pressable accessibilityRole="button" accessibilityLabel={`${name} 최근 목록에서 삭제`} onPress={() => ask([photo.id])} style={s.remove}>
          <Text style={s.danger}>삭제</Text>
        </Pressable>}
      </View>
    })}</View>
    <ConfirmDialog open={Boolean(pending)} title={`최근 사진 ${pending?.length ?? 0}개를 목록에서 삭제할까요?`}
      message="목록에서만 삭제돼요. 원본과 캔버스에 붙인 사진은 그대로 유지돼요."
      onCancel={() => setPending(null)} onConfirm={() => {
        if (!pending || confirming.current) return
        confirming.current = true
        onRemove(pending)
        finish()
      }} />
  </View>
}

const s = StyleSheet.create({
  section: { gap: 8, marginTop: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  text: { fontSize: 13, color: colors.text },
  danger: { fontSize: 13, fontWeight: '700', color: colors.danger },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, backgroundColor: colors.primarySoft },
  disabled: { opacity: 0.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { aspectRatio: 4 / 5, padding: 4 },
  tile: { flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.primary },
  check: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primaryStrong },
  checkText: { color: colors.surface, fontWeight: '700' },
  remove: { position: 'absolute', right: 8, bottom: 8, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 10 },
})
