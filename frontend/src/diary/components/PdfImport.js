import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Icon from '../../editor/components/controls/Icon'
import { mediaRegistry, mediaService, mediaUri } from '../../editor/services/mediaStore'
import { mediaId } from '../../editor/utils/mediaReferences.js'
import { colors } from '../../shared/theme'
import { OptionRow, Toggle } from './FormControls'
import CoverArt from './CoverArt'

// 쪽 그림의 표시 주소. 보여 주는 동안만 붙들고, 읽기가 끝나면 상태로 받아 그린다.
function usePageUri(page) {
  const id = mediaId(page)
  const [uri, setUri] = useState(() => mediaUri(page))
  useEffect(() => {
    // 다른 쪽으로 바뀌면 이전 쪽 그림을 남기지 않는다
    setUri(mediaUri(page))
    if (!id) return undefined
    let live = true
    const release = mediaRegistry.retain(id)
    mediaService.resolveDisplay(id).then(entry => { if (live && entry?.uri) setUri(entry.uri) }).catch(() => {})
    return () => { live = false; release() }
  }, [id])
  return uri
}

/** PDF 한 쪽(미디어 보관함 그림) 미리보기. 비율은 지키고 남는 곳은 흰 종이. */
export function PdfPageThumb({ page, width, ratio, style }) {
  const uri = usePageUri(page)
  return <View pointerEvents="none" style={[styles.thumb, { width, height: width / ratio }, style]}>
    {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
  </View>
}

function ToggleRow({ label, value, onChange, disabled }) {
  return <View style={[styles.toggleRow, disabled && styles.dim]}>
    <Text style={styles.toggleLabel}>{label}</Text>
    <Toggle label={label} value={value} onChange={onChange} disabled={disabled} />
  </View>
}

/**
 * 이름 · 방향 아래의 PDF 불러오기: 버튼 + 불러온 파일 요약 + 옵션 셋(첫 장을 표지로 · 나의 표지에 추가 · 나의 속지에 추가).
 * 옵션은 PDF 를 불러온 뒤에만 보이고, 그때부터 켜고 끌 수 있다. papers = false 이면(서버 다이어리) 속지 옵션을 감춘다.
 */
export default function PdfImport({ pdf, busy, progress, disabled, onPick, onClear, firstAsCover, onFirstAsCover,
  addToMyCovers, onAddToMyCovers, addToMyPapers, onAddToMyPapers, coverAlsoPaper = false, onCoverAlsoPaper, papers = true }) {
  const ready = Boolean(pdf) && !busy
  const total = pdf?.pages.length ?? 0
  return <>
    <OptionRow label="PDF">
      <View style={styles.line}>
        <Pressable accessibilityRole="button" accessibilityLabel="PDF에서 시작하기" accessibilityState={{ busy, disabled: disabled || busy }} disabled={disabled || busy} onPress={onPick}
          style={({ pressed }) => [styles.button, (disabled || busy) && styles.dim, pressed && styles.pressed]}>
          <Icon name="upload" size={16} forText={12.5} />
          <Text style={styles.buttonText}>{busy ? (progress?.total ? `불러오는 중 ${progress.done}/${progress.total}` : '여는 중…') : pdf ? 'PDF 바꾸기' : 'PDF에서 시작하기'}</Text>
        </Pressable>
        {pdf && !busy ? <Pressable accessibilityRole="button" accessibilityLabel="불러온 PDF 빼기" disabled={disabled} onPress={onClear} hitSlop={6}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}><Icon name="close" size={16} color={colors.textMuted} /></Pressable> : null}
      </View>
      {pdf ? <Text numberOfLines={1} style={styles.file}>{`${pdf.name} · ${pdf.totalPages > total ? `${total}쪽 (전체 ${pdf.totalPages}쪽 중)` : `${total}쪽`}`}</Text> : null}
    </OptionRow>
    {pdf ? <>
      <ToggleRow label="첫 장을 표지로" value={firstAsCover} onChange={onFirstAsCover} disabled={!ready || !papers} />
      {papers && firstAsCover ? <ToggleRow label="표지로 쓴 장도 속지에 넣기" value={coverAlsoPaper} onChange={onCoverAlsoPaper} disabled={!ready} /> : null}
      <ToggleRow label="표지를 나의 표지에 추가" value={addToMyCovers} onChange={onAddToMyCovers} disabled={!ready} />
      {papers ? <ToggleRow label="속지를 나의 속지에 추가" value={addToMyPapers} onChange={onAddToMyPapers} disabled={!ready || (firstAsCover && !coverAlsoPaper && total < 2)} /> : null}
    </> : null}
  </>
}

function Remove({ label, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
    <Icon name="close" size={12} color="#FFFFFF" strokeWidth={2.6} />
  </Pressable>
}

const COVER_TILE = { width: 54, height: 72 }
const WIDE_COVER_TILE = { width: 66, height: 50 } // 가로 다이어리에서 담은 표지: 테두리 · 안쪽 여백(10)을 더해도 칸 폭 76 안에 든다

/** 나의 표지: 저장해 둔 표지를 누르면 지금 표지를 그걸로 바꾼다. */
export function MyCoverList({ items, name, selectedId, onPick, onRemove, disabled }) {
  if (!items.length) return null
  return <OptionRow label="나의 표지">
    <View style={styles.tiles}>
      {items.map(item => {
        const tile = item.orientation === 'landscape' ? WIDE_COVER_TILE : COVER_TILE
        return <View key={item.id} style={[styles.tileBox, disabled && styles.dim]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`나의 표지 ${item.name} 쓰기`} accessibilityState={{ selected: selectedId === item.id }} disabled={disabled} onPress={() => onPick(item)}
            style={({ pressed }) => [styles.coverTile, selectedId === item.id && styles.tileOn, pressed && styles.pressed]}>
            <View style={tile}><CoverArt cover={item.cover} name={name} width={tile.width} height={tile.height} /></View>
          </Pressable>
          <Text numberOfLines={1} style={styles.tileName}>{item.name}</Text>
          {!disabled && <Remove label={`나의 표지 ${item.name} 지우기`} onPress={() => onRemove(item)} />}
        </View>
      })}
    </View>
  </OptionRow>
}

/** 나의 속지: 저장해 둔 PDF 속지 묶음. 누르면 지금 속지를 그걸로 바꾼다. */
export function MyPaperList({ items, selectedId, onPick, onRemove, disabled }) {
  if (!items.length) return null
  return <OptionRow label="나의 속지">
    <View style={styles.tiles}>
      {items.map(item => <View key={item.id} style={[styles.tileBox, disabled && styles.dim]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`나의 속지 ${item.name} ${item.pages.length}장 쓰기`} accessibilityState={{ selected: selectedId === item.id }} disabled={disabled} onPress={() => onPick(item)}
          style={({ pressed }) => [styles.paperTile, selectedId === item.id && styles.tileOn, pressed && styles.pressed]}>
          <PdfPageThumb page={item.pages[0]} width={item.orientation === 'landscape' ? 72 : 54} ratio={item.orientation === 'landscape' ? 4 / 3 : 3 / 4} />
        </Pressable>
        <Text numberOfLines={1} style={styles.tileName}>{`${item.name} · ${item.pages.length}장`}</Text>
        {!disabled && <Remove label={`나의 속지 ${item.name} 지우기`} onPress={() => onRemove(item)} />}
      </View>)}
    </View>
  </OptionRow>
}

const styles = StyleSheet.create({
  dim: { opacity: 0.4 },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  thumb: { backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { height: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  buttonText: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  clear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surfaceMuted },
  file: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 2 },
  toggleLabel: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tileBox: { width: 76, gap: 4, alignItems: 'center' },
  coverTile: { padding: 3, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  paperTile: { width: 76, height: 76, borderRadius: 6, borderWidth: 2, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  tileOn: { borderColor: colors.primary },
  tileName: { maxWidth: 76, color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  remove: { position: 'absolute', top: -4, right: 0, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong },
})
