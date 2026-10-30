import { useCallback, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { normalizeAngle, rotateVector, unionBounds } from '../../utils/common'
import Icon from '../controls/Icon'
import { objectOpacity } from '../canvas/ObjectView'
import Slider from '../controls/Slider'
import EffectOptions from './EffectOptions'
import ShapeSettings from '../ShapeSettings'
import TapeOptions from './TapeOptions'
import FrameOptions from './FrameOptions'
import { isStripFrame } from '../../utils/photoStrip'
import { hasPhotoMedia } from '../../utils/objects'
import { PaletteInteractionContext } from '../controls/ColorPicker'

const TYPE_TITLES = { sticker: '스티커', photo: '사진', tape: '마스킹테이프', shape: '도형' }

/**
 * 선택한 요소의 세부 옵션 (편집 바의 '더보기').
 * 캔버스 위에 띄우면 요소·편집 바를 가리기 쉬워서 보관함처럼 편집 영역 오른쪽에 붙인다.
 * 탭 두 개: '꾸미기'(사진 틀·칸 사진·모양·모서리 둥글기·틀 색, 불투명도, 윤곽선·그림자, 테이프 디자인)를 먼저, '배치'(반전·각도)는 뒤에.
 * 꾸밀 것이 없는 요소(이미지 테이프 등)는 배치만 보여 준다.
 */
export default function MorePanel({ objects, dispatch, onReplacePhoto, onReplaceCell, onCropCell, onClose }) {
  const [tab, setTab] = useState('style')
  const scrollRef = useRef(null)
  const [paletteDragging, setPaletteDragging] = useState(false)
  const onPaletteInteraction = useCallback(active => {
    // 다음 렌더 전에도 네이티브 스크롤이 팔레트 제스처를 가져가지 않게 한다.
    scrollRef.current?.setNativeProps?.({ scrollEnabled: !active })
    setPaletteDragging(active)
  }, [])
  const pivotRef = useRef(null)
  const editable = objects.filter((o) => !o.locked)
  const single = objects.length === 1 ? objects[0] : null
  const isPhoto = single?.type === 'photo' && !single.locked
  const isShape = single?.type === 'shape' && !single.locked
  const isTape = single?.type === 'tape' && !single.locked
  const hasStyle = true // 불투명도는 모든 요소에 있어 꾸미기 탭이 늘 있다
  const current = hasStyle ? tab : 'layout'
  const title = objects.length > 1 ? `${objects.length}개 요소` : `${TYPE_TITLES[single?.type] ?? '요소'} 옵션`
  const updateEach = (makePatch, record = true) =>
    dispatch({ type: 'updateMany', record, patches: Object.fromEntries(editable.map((o) => [o.id, makePatch(o)])) })
  // 각도: 하나면 제자리(가운데 기준)에서, 여러 개(그룹)면 묶음 가운데를 기준으로 함께 돌린다.
  // (각자 제자리에서 돌리면 묶음 배치가 흐트러졌다)
  function rotateTo(angle) {
    const delta = angle - (editable[0].rotation ?? 0)
    if (editable.length === 1) {
      updateEach(() => ({ rotation: normalizeAngle(angle) }), false)
      return
    }
    // 끄는 동안 기준점이 흔들리지 않게 시작할 때 잡아 둔 묶음 가운데를 쓴다
    const pivot = pivotRef.current ?? unionCenter(editable)
    updateEach((o) => {
      const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 }
      const v = rotateVector(c.x - pivot.x, c.y - pivot.y, delta)
      return { rotation: normalizeAngle((o.rotation ?? 0) + delta), x: pivot.x + v.x - o.w / 2, y: pivot.y + v.y - o.h / 2 }
    }, false)
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="옵션 닫기">
          <Icon name="close" size={18} />
        </Pressable>
      </View>

      {hasStyle && editable.length > 0 && (
        <View style={styles.tabs} accessibilityRole="tablist">
          {[
            { id: 'style', label: '꾸미기' },
            { id: 'layout', label: '배치' },
          ].map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: current === item.id }}
              style={[styles.tab, current === item.id && styles.tabActive]}
            >
              <Text style={[styles.tabText, current === item.id && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <PaletteInteractionContext.Provider value={onPaletteInteraction}>
      <ScrollView ref={scrollRef} scrollEnabled={!paletteDragging} style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!editable.length ? (
          <Text style={styles.hint}>잠긴 요소예요. 잠금을 풀면 편집할 수 있어요.</Text>
        ) : current === 'style' ? (
          <>
            {isShape && <ShapeSettings embedded showShapePicker={false} settings={single} onCheckpoint={() => dispatch({type:'checkpoint'})} onCommit={() => dispatch({type:'commitCheckpoint'})} onChange={(patch,record=true) => updateEach(()=>patch,record)} />}
            {/* 여러 칸 틀은 칸마다 '칸 사진'에서 바꾼다 */}
            {isPhoto && !isStripFrame(single.frame) && (
              <Pressable
                onPress={() => onReplacePhoto(single.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.replaceButton, pressed && styles.pressed]}
              >
                <Icon name="swap" size={16} />
                <Text style={styles.chipText}>{hasPhotoMedia(single) ? '사진 바꾸기' : '사진 넣기'}</Text>
              </Pressable>
            )}
            {isPhoto && <FrameOptions photo={single} dispatch={dispatch} onReplaceCell={onReplaceCell} onCropCell={onCropCell} />}

            <Section title="불투명도">
              <Slider
                value={objectOpacity(editable[0])}
                min={0.1}
                max={1}
                step={0.1}
                minusLabel="불투명도 낮추기"
                plusLabel="불투명도 높이기"
                scale={100}
                unit="%"
                label="불투명도"
                onStart={() => dispatch({ type: 'checkpoint' })}
                onEnd={() => dispatch({type:'commitCheckpoint'})}
                onChange={(value) => updateEach(() => ({ opacity: Math.round(value * 100) / 100 }), false)}
              />
            </Section>

            <EffectOptions objects={editable} dispatch={dispatch} />

            {isTape && (
              <TapeOptions tape={single} dispatch={dispatch} />
            )}

          </>
        ) : (
          <>
            <Section title="반전">
              <View style={styles.chips}>
                <Chip label="좌우 반전" onPress={() => updateEach((o) => ({ flipX: !o.flipX }))} />
                <Chip label="상하 반전" onPress={() => updateEach((o) => ({ flipY: !o.flipY }))} />
              </View>
            </Section>

            {/* 각도: 원본(0°) 기준 절대 각도. 좌우로 끌거나 숫자 칸에 직접 넣는다 */}
            <Section title="각도">
              <Slider
                value={Math.round(editable[0].rotation ?? 0)}
                min={0}
                max={359}
                step={1}
                minusLabel="왼쪽으로 돌리기"
                plusLabel="오른쪽으로 돌리기"
                unit="°"
                label="각도"
                wrap
                onStart={() => {
                  dispatch({ type: 'checkpoint' })
                  pivotRef.current = unionCenter(editable)
                }}
                onEnd={() => dispatch({type:'commitCheckpoint'})}
                onChange={(value) => rotateTo(Math.round(value))}
              />
            </Section>
          </>
        )}
      </ScrollView>
      </PaletteInteractionContext.Provider>
    </View>
  )
}

function unionCenter(objects) {
  const b = unionBounds(objects)
  return { x: b.cx, y: b.cy }
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Chip({ label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  panel: {
    width: 300,
    maxWidth: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.97)',
    // 웹에서는 뒤 캔버스가 살짝 비치는 유리 질감 (네이티브는 불투명 흰 배경)
    ...Platform.select({ web: { backgroundColor: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)' }, default: {} }),
    overflow: 'hidden',
    ...shadow.float,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  tab: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(11, 23, 102, 0.14)' },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  close: { padding: 6 },
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 18 },
  hint: { paddingTop: 12, fontSize: 12.5, color: colors.textMuted },
  section: { marginTop: 14 },
  sectionTitle: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.primarySoft },
  replaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    marginTop: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
})
