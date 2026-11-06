import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import { PaperGrid, PaperTabs, TemplatePreview } from '../../diary/components/PaperOptions'
import { PdfPageThumb } from '../../diary/components/PdfImport'
import { pdfPageAspect } from '../../diary/utils/pdfImport.js'
import { TEMPLATE_VERSION } from '../templates/catalog.js'
import { loadTemplate } from '../templates/loadTemplate'
import Icon from './controls/Icon'
import { PAPER_GROUPS, countAssetId, papersIn } from '../../diary/utils/paperChoice'
import { PANEL_RADIUS, ToolPanelHeader } from './ToolPanel'

// 페이지로 더할 수 있는 속지: 장수로 넣는 속지만 (날짜 속지는 다이어리를 만들 때 기간으로 넣는다)
const GROUPS = PAPER_GROUPS.map(group => ({ ...group, papers: papersIn(group.id).filter(paper => paper.kind === 'count') })).filter(group => group.papers.length)
const CARD_WIDTH = 340
const SLOTS = 6 // 분류마다 두 줄(3열)로 맞춘다
const MINE_GAP = 12
const MINE = { id: 'mine', name: '나의 속지' } // 공방 · 새 다이어리에서 PDF 로 만든 속지 묶음. 있을 때만 탭을 보인다

/** 팝업을 열기 전에 속지를 미리 불러 둬 열자마자 그려지게 한다 */
export function prefetchPageAddPapers(orientation) {
  for (const group of GROUPS) for (const paper of group.papers) {
    try { loadTemplate({ backgroundAssetId: countAssetId(paper.id, orientation), templateVersion: TEMPLATE_VERSION }).catch(() => {}) } catch { /* 없는 속지는 건너뜀 */ }
  }
}

/**
 * 페이지 추가 (약식 버블). 페이지 목록의 '페이지 추가' 옆에 떠서 분류 탭 + 속지 타일을 보이고,
 * 속지를 누르면 지금 페이지 뒤에 한 장을 넣고 닫는다. 바깥을 누르면 닫힌다.
 * 폰은 화면 아래에 가로로 꽉 차게 띄운다. 폭은 창 크기로 정해 처음 그린 뒤 다시 재지 않는다.
 * anchor: 태블릿 버블 자리 { left, bottom } (화면 기준)
 * myPapers: 나의 속지 묶음. 묶음을 누르면 그 안의 쪽을 펼쳐 한 장을 고르거나 전체를 넣는다(onSelectMine(묶음, 넣을 쪽들))
 */
export default function PageAddPicker({ compact = false, orientation, appearance, currentAssetId = null, anchor = { left: 16, bottom: 16 }, myPapers = [], onSelect, onSelectMine, onClose }) {
  // 지금 페이지의 속지와 같은 속지가 있으면 그 분류에서 열고, 맨 위에 바로 넣는 줄을 둔다
  const current = currentAssetId ? GROUPS.flatMap(item => item.papers.map(paper => ({ paper, group: item.id })))
    .find(item => countAssetId(item.paper.id, orientation) === currentAssetId) ?? null : null
  const [group, setGroup] = useState(current?.group ?? GROUPS[0].id)
  const window = useWindowDimensions()
  const place = compact ? { left: 8, right: 8, bottom: anchor.bottom } : { left: anchor.left, bottom: anchor.bottom, width: Math.min(CARD_WIDTH, window.width - anchor.left - 16) }
  return <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none">
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="페이지 추가 닫기" />
    <View style={[styles.bubble, place]} accessibilityViewIsModal accessibilityLabel="페이지 추가">
      <ToolPanelHeader icon="plus" title="페이지 추가" closeLabel="페이지 추가 닫기" onClose={onClose} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {current && <Pressable accessibilityRole="button" accessibilityLabel={`현재 속지 ${current.paper.name} 한 장 더`} onPress={() => onSelect(currentAssetId)}
          style={({ pressed }) => [styles.current, pressed && styles.pressed]}>
          <TemplatePreview assetId={currentAssetId} width={36} appearance={appearance} sketch />
          <View style={styles.currentText}>
            <Text style={styles.currentLabel}>현재 속지</Text>
            <Text numberOfLines={1} style={styles.currentName}>{current.paper.name}</Text>
          </View>
          <Icon name="plus" size={16} color={colors.primaryStrong} />
        </Pressable>}
        <PaperTabs groups={myPapers.length && onSelectMine ? [...GROUPS, MINE] : GROUPS} value={group} onChange={setGroup} />
        {group === MINE.id ? <MyPaperGrid items={myPapers} onSelect={onSelectMine} />
          : <PaperGrid papers={GROUPS.find(item => item.id === group).papers} selected={null} orientation={orientation} appearance={appearance} minSlots={SLOTS}
            onSelect={id => onSelect(countAssetId(id, orientation))} />}
      </ScrollView>
    </View>
  </View>
}

/**
 * 나의 속지 묶음 타일: 두 열에 쪽의 비율을 유지하며 보여 준다.
 * 묶음은 한 장이 아니라서 속지 타일과 달리 카드 틀을 둔다.
 * 묶음을 누르면 그 안의 쪽을 같은 타일로 펼친다(굿노트 내 템플릿처럼 한 장씩 고른다). 쪽을 누르면 그 한 장, `전체 넣기` 는 묶음 전부. 한 장짜리 묶음은 바로 넣는다.
 */
function MyPaperGrid({ items, onSelect }) {
  const [width, setWidth] = useState(0)
  const [openId, setOpenId] = useState(null)
  const open = items.find(item => item.id === openId) ?? null
  const tile = width ? Math.floor((width - MINE_GAP) / 2) : 0
  const preview = tile - 18 // 안쪽 8 · 테두리 1 씩
  const card = ({ key, page, name, count, label, onPress }) => {
    const aspect = pdfPageAspect(page)
    const box = preview / Math.min(1.6, Math.max(0.75, aspect))
    const thumb = Math.min(preview, box * aspect)
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.mineTile, { width: tile }, pressed && styles.pressed]}>
      <View style={[styles.minePreview, { height: box }]}><PdfPageThumb page={page} width={thumb} ratio={aspect} /></View>
      <Text numberOfLines={1} style={styles.mineName}>{name}</Text>
      {count ? <Text style={styles.mineCount}>{count}</Text> : null}
    </Pressable>
  }
  return <View style={styles.mine} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {open && <View style={styles.mineHead}>
      <Pressable accessibilityRole="button" accessibilityLabel="나의 속지 목록으로" hitSlop={8} onPress={() => setOpenId(null)} style={styles.mineBack}>
        <Icon name="chevronLeft" size={18} forText={13} color={colors.primaryText} />
        <Text numberOfLines={1} style={styles.mineTitle}>{open.name}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`나의 속지 ${open.name} ${open.pages.length}장 모두 넣기`} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} onPress={() => onSelect(open, open.pages)}>
        <Text style={styles.mineAll}>전체 넣기</Text>
      </Pressable>
    </View>}
    <View style={styles.mineGrid}>
      {preview > 0 && (open
        ? open.pages.map((page, index) => card({ key: index, page, name: `${index + 1}쪽`, label: `${open.name} ${index + 1}쪽 넣기`, onPress: () => onSelect(open, [page]) }))
        : items.map(item => card({ key: item.id, page: item.pages[0], name: item.name, count: `${item.pages.length}장`,
          label: item.pages.length > 1 ? `나의 속지 ${item.name} ${item.pages.length}장 펼치기` : `나의 속지 ${item.name} 넣기`,
          onPress: () => item.pages.length > 1 ? setOpenId(item.id) : onSelect(item, item.pages) })))}
    </View>
  </View>
}

const styles = StyleSheet.create({
  mine: { gap: 8, paddingTop: 4 },
  mineHead: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mineBack: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  mineTitle: { flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  mineAll: { color: colors.primaryText, fontSize: 12, fontWeight: '700' },
  mineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: MINE_GAP },
  mineTile: { padding: 8, paddingBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  minePreview: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 6, backgroundColor: colors.surfaceSoft },
  mineName: { marginTop: 8, color: colors.text, fontSize: 13, fontWeight: '700' },
  mineCount: { marginTop: 2, color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },
  // 편집 화면(본문 · 도구 막대)보다 위에 뜬다
  layer: { zIndex: 60, elevation: 60 },
  bubble: { position: 'absolute', maxHeight: '90%', overflow: 'hidden', borderRadius: PANEL_RADIUS, backgroundColor: colors.surface, ...shadow.float },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  current: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  currentText: { flex: 1, minWidth: 0, gap: 2 },
  currentLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  currentName: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
})
