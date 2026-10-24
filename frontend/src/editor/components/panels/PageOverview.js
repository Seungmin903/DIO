import PageBulkDelete from '../controls/PageBulkDelete'
import EditorModal from '../controls/EditorModal'
import { useFormFactor } from '../../../shared/useFormFactor'
import { Fragment, memo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, shadow } from '../../../shared/theme'
import { pageSize } from '../../utils/pageGeometry.js'
import StaticPage from '../canvas/StaticPage'
import { PANEL_RADIUS } from '../ToolPanel'
import Icon from '../controls/Icon'

const THUMB_WIDTH = 200
const GAP = 20
const FILTERS = [['all', '전체'], ['bookmarked', '북마크']]

/**
 * 페이지 넓게 보기. 모든 페이지를 큰 썸네일 격자로 펼쳐 한눈에 보고 바로 이동한다.
 * GoodNotes 의 페이지 보기(전체·책갈피 탭)와 삼성 노트의 페이지 정렬 화면을 참고했다.
 * - 탭: 그 페이지로 이동하고 닫힘
 * - 책갈피: 북마크 넣기·빼기
 */
export default function PageOverview({ pages, currentId, initialFilter = 'all', onSelect, onToggleIndex, onDelete, onReset, onClose }) {
  const { isPhone } = useFormFactor()
  const [filter, setFilter] = useState(initialFilter)
  const [managing, setManaging] = useState(false)
  const [picked, setPicked] = useState([])
  const finish = () => { setManaging(false); setPicked([]) }
  const [width, setWidth] = useState(0)
  const columns = Math.max(1, Math.floor((width - GAP) / (THUMB_WIDTH + GAP)))
  const gridWidth = columns * THUMB_WIDTH + (columns - 1) * GAP
  const gridInset = Math.max(GAP, (width - gridWidth) / 2)
  const shown = filter === 'bookmarked' ? pages.filter((page) => page.indexed) : pages
  const Contents = isPhone ? SafeAreaView : View
  const HeaderSide = isPhone ? View : Fragment
  const content = (
    <Contents style={[styles.backdrop, isPhone && styles.phoneBackdrop]} accessibilityViewIsModal>
      <View style={styles.sheet} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={[styles.header, isPhone && styles.phoneHeader]}>
          <HeaderSide {...(isPhone ? { style: styles.headerSide } : {})}><Text style={styles.title}>페이지</Text></HeaderSide>
          <View style={styles.tabs}>
            {FILTERS.map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => { setFilter(id); setPicked([]) }}
                accessibilityRole="button"
                accessibilityLabel={`넓게 보기 ${label}`}
                accessibilityState={{ selected: filter === id }}
                style={[styles.tab, isPhone && styles.phoneTab, filter === id && styles.tabActive]}
              >
                <Text style={[styles.tabText, filter === id && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <HeaderSide {...(isPhone ? { style: [styles.headerSide, styles.headerActions] } : {})}>
          <Text style={[styles.count, isPhone && styles.phoneCount]}>{shown.length}장</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="넓게 보기 닫기" style={styles.close}>
            <Icon name="close" size={20} />
          </Pressable>
          </HeaderSide>
        </View>
        {onDelete && <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
          <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => managing ? finish() : setManaging(true)}><Text style={styles.tabText}>{managing ? '완료' : '편집'}</Text></Pressable>
          {managing && <PageBulkDelete pages={pages} ids={picked} onDelete={onDelete} onReset={onReset} onDone={finish} />}
        </View>}
        {filter === 'bookmarked'  && !shown.length ? (
          <Text style={styles.empty}>북마크한 페이지가 없어요.</Text>
        ) : (
          width > 0 && (
            <FlatList
              key={columns}
              data={shown}
              extraData={[managing, picked]}
              numColumns={columns}
              keyExtractor={(page) => page.id}
              contentContainerStyle={[styles.grid, isPhone && { paddingHorizontal: gridInset }]}
              columnWrapperStyle={columns > 1 ? styles.row : undefined}
              initialNumToRender={columns * 3}
              windowSize={5}
              renderItem={({ item: page }) => (
                <OverviewItem
                  page={page}
                  number={pages.indexOf(page) + 1}
                  active={managing ? picked.includes(page.id) : page.id === currentId}
                  managing={managing}
                  onSelect={() => { if (managing) { setPicked(ids => ids.includes(page.id) ? ids.filter(id => id !== page.id) : [...ids, page.id]); return }; onSelect(page.id); onClose() }}
                  onToggleIndex={!managing && onToggleIndex ? () => onToggleIndex(page.id) : null}
                />
              )}
            />
          )
        )}
      </View>
    </Contents>
  )
  return isPhone ? <EditorModal visible transparent animationType="fade" onRequestClose={onClose}>{content}</EditorModal> : content
}

const OverviewItem = memo(function OverviewItem({ page, number, active, managing, onSelect, onToggleIndex }) {
  const { width, height } = pageSize(page)
  const zoom = THUMB_WIDTH / width
  return (
    <View style={styles.item}>
      <Pressable onPress={onSelect} accessibilityRole={managing ? "checkbox" : "button"} accessibilityState={managing ? { checked: active } : undefined} accessibilityLabel={`${number}페이지 ${managing ? "선택" : "이동"}`} style={[styles.thumb, { height: height * zoom }]}>
        <View style={styles.thumbPage} pointerEvents="none">
          <StaticPage page={page} zoom={zoom} still />
        </View>
        {managing && <Text style={{ position: 'absolute', top: 8, right: 8, fontSize: 22, color: colors.primary }}>{active ? '☑' : '☐'}</Text>}
        {active && <View style={styles.activeRing} pointerEvents="none" />}
      </Pressable>
      {onToggleIndex && (
        <Pressable
          onPress={onToggleIndex}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={page.indexed ? `${number}페이지 북마크 빼기` : `${number}페이지 북마크하기`}
          accessibilityState={{ selected: Boolean(page.indexed) }}
          style={styles.bookmark}
        >
          <Icon name="bookmark" size={18} color={page.indexed ? colors.primary : colors.textMuted} fill={page.indexed ? colors.primary : 'none'} strokeWidth={2.2} />
        </Pressable>
      )}
      <Text style={[styles.number, active && styles.numberActive]}>{number}</Text>
    </View>
  )
})

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 50, padding: 24, backgroundColor: colors.scrim },
  sheet: { flex: 1, borderRadius: PANEL_RADIUS, backgroundColor: '#EEF2FA', overflow: 'hidden', ...shadow.float },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.surface },
  phoneBackdrop: { position: 'relative', top: undefined, bottom: undefined, left: undefined, right: undefined, flex: 1, padding: 12 },
  phoneHeader: { gap: 6, paddingHorizontal: 16 },
  phoneTab: { paddingHorizontal: 10 },
  phoneCount: { marginLeft: 0 },
  headerSide: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: 'rgba(11,25,87,0.06)' },
  tab: { paddingHorizontal: 16, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.surface, ...shadow.card },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text },
  count: { marginLeft: 'auto', fontSize: 13, fontWeight: '700', color: colors.textMuted },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  empty: { padding: 40, textAlign: 'center', fontSize: 14, color: colors.textMuted },
  grid: { padding: GAP, gap: GAP },
  row: { gap: GAP },
  item: { width: THUMB_WIDTH, alignItems: 'center', gap: 8 },
  thumb: { width: THUMB_WIDTH, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(11,25,87,0.1)', backgroundColor: '#FFFFFF', ...shadow.card },
  thumbPage: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 10 },
  activeRing: { ...StyleSheet.absoluteFillObject, margin: -1, borderRadius: 10, borderWidth: 3, borderColor: colors.primary },
  bookmark: { position: 'absolute', top: 8, left: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.85)' },
  number: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  numberActive: { color: colors.text },
})
