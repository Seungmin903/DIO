import { memo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
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
export default function PageOverview({ pages, currentId, initialFilter = 'all', onSelect, onToggleIndex, onClose }) {
  const [filter, setFilter] = useState(initialFilter)
  const [width, setWidth] = useState(0)
  const columns = Math.max(1, Math.floor((width - GAP) / (THUMB_WIDTH + GAP)))
  const shown = filter === 'bookmarked' ? pages.filter((page) => page.indexed) : pages
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.sheet} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <View style={styles.header}>
          <Text style={styles.title}>페이지</Text>
          <View style={styles.tabs}>
            {FILTERS.map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => setFilter(id)}
                accessibilityRole="button"
                accessibilityLabel={`넓게 보기 ${label}`}
                accessibilityState={{ selected: filter === id }}
                style={[styles.tab, filter === id && styles.tabActive]}
              >
                <Text style={[styles.tabText, filter === id && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.count}>{shown.length}장</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="넓게 보기 닫기" style={styles.close}>
            <Icon name="close" size={20} />
          </Pressable>
        </View>
        {filter === 'bookmarked' && !shown.length ? (
          <Text style={styles.empty}>북마크한 페이지가 없어요.</Text>
        ) : (
          width > 0 && (
            <FlatList
              key={columns}
              data={shown}
              numColumns={columns}
              keyExtractor={(page) => page.id}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={columns > 1 ? styles.row : undefined}
              initialNumToRender={columns * 3}
              windowSize={5}
              renderItem={({ item: page }) => (
                <OverviewItem
                  page={page}
                  number={pages.indexOf(page) + 1}
                  active={page.id === currentId}
                  onSelect={() => { onSelect(page.id); onClose() }}
                  onToggleIndex={onToggleIndex ? () => onToggleIndex(page.id) : null}
                />
              )}
            />
          )
        )}
      </View>
    </View>
  )
}

const OverviewItem = memo(function OverviewItem({ page, number, active, onSelect, onToggleIndex }) {
  const { width, height } = pageSize(page)
  const zoom = THUMB_WIDTH / width
  return (
    <View style={styles.item}>
      <Pressable onPress={onSelect} accessibilityRole="button" accessibilityLabel={`${number}페이지로 이동`} style={[styles.thumb, { height: height * zoom }]}>
        <View style={styles.thumbPage} pointerEvents="none">
          <StaticPage page={page} zoom={zoom} still />
        </View>
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
}, (previous, next) => previous.page === next.page && previous.number === next.number && previous.active === next.active)

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 50, padding: 24, backgroundColor: 'rgba(11,25,87,0.28)' },
  sheet: { flex: 1, borderRadius: PANEL_RADIUS, backgroundColor: '#EEF2FA', overflow: 'hidden', ...shadow.float },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.surface },
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
