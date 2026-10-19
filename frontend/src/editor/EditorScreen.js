import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../theme'
import Canvas from './components/Canvas'
import CropPanel from './components/CropPanel'
import DecorDrawer from './components/DecorDrawer'
import Icon from './components/Icon'
import LayerPanel from './components/LayerPanel'
import PageList from './components/PageList'
import Ribbon from './components/Ribbon'
import TopBar from './components/TopBar'
import { PAGE_HEIGHT, PAGE_WIDTH, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './constants'
import { useEditor } from './hooks/useEditor'
import { getCurrentPage } from './state/editorReducer'
import { clamp, createId } from './utils/common'
import { pickImages } from './utils/image'
import { createObjectFromDecor } from './utils/objects'

const TOAST_MS = 2000
// 캔버스 위아래로 리본바·하단 컨트롤이 겹치지 않게 비워 두는 여백
const STAGE_PADDING = { top: 84, bottom: 76, side: 28 }

export default function EditorScreen({ onHome, diary }) {
  const { state, dispatch, saveStatus } = useEditor(diary)
  const page = getCurrentPage(state)
  const pageIndex = state.doc.pages.indexOf(page)

  const [stageSize, setStageSize] = useState(null)
  const [zoomSetting, setZoomSetting] = useState('fit') // 'fit' | number
  const [drawerTab, setDrawerTab] = useState(null)
  const [layersOpen, setLayersOpen] = useState(true)
  const [pagesOpen, setPagesOpen] = useState(true)
  const [focusMode, setFocusMode] = useState(false)
  const [cropId, setCropId] = useState(null)
  const [recentPhotos, setRecentPhotos] = useState([])
  const [toast, setToast] = useState(null)

  const fitZoom = stageSize
    ? clamp(
        Math.min(
          (stageSize.width - STAGE_PADDING.side * 2) / PAGE_WIDTH,
          (stageSize.height - STAGE_PADDING.top - STAGE_PADDING.bottom) / PAGE_HEIGHT,
        ),
        ZOOM_MIN,
        ZOOM_MAX,
      )
    : 0.6
  const zoom = zoomSetting === 'fit' ? fitZoom : zoomSetting

  const cropTarget = cropId ? page.objects.find((o) => o.id === cropId && o.type === 'photo') : null

  const showToast = useCallback((message) => setToast({ message, key: createId() }), [setToast])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  // 자르던 사진이 되돌리기 등으로 사라지면 자르기를 끝낸다.
  if (cropId && !cropTarget) setCropId(null)

  const changeZoom = (next) => {
    const value = next === 'fit' ? 'fit' : clamp(Math.round(next * 100) / 100, ZOOM_MIN, ZOOM_MAX)
    setZoomSetting(value)
    showToast(value === 'fit' ? '화면에 맞췄어요' : `${Math.round(value * 100)}%`)
  }

  const randomCenter = () => ({
    x: PAGE_WIDTH / 2 + (Math.random() - 0.5) * 160,
    y: PAGE_HEIGHT / 2 + (Math.random() - 0.5) * 120,
  })

  const addDecor = (item) => {
    dispatch({ type: 'addObjects', objects: [createObjectFromDecor(item, randomCenter())] })
  }

  const addPhotos = async () => {
    try {
      const images = await pickImages()
      if (!images.length) return
      const photos = images.map((image) => ({
        id: createId(),
        src: image.src,
        name: image.name,
        imageWidth: image.width,
        imageHeight: image.height,
      }))
      setRecentPhotos((prev) => [...photos, ...prev].slice(0, 12))
      const center = randomCenter()
      const objects = photos.map((photo, index) =>
        createObjectFromDecor({ kind: 'photo', ...photo }, { x: center.x + index * 24, y: center.y + index * 24 }),
      )
      dispatch({ type: 'addObjects', objects })
    } catch (error) {
      showToast(error.message)
    }
  }

  const startCrop = (id) => {
    setDrawerTab(null)
    dispatch({ type: 'select', ids: [id] })
    dispatch({ type: 'checkpoint' })
    setCropId(id)
  }

  const finishCrop = (apply) => {
    if (!apply) dispatch({ type: 'revertToCheckpoint' })
    setCropId(null)
    showToast(apply ? '사진 자르기를 적용했어요.' : '자르기를 취소했어요.')
  }

  const undo = () => {
    if (!state.past.length) return
    if (cropId) setCropId(null)
    dispatch({ type: 'undo' })
    showToast('마지막 작업을 되돌렸어요.')
  }

  const redo = () => {
    if (!state.future.length) return
    dispatch({ type: 'redo' })
    showToast('다시 실행했어요.')
  }

  // 웹(키보드)에서의 단축키
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined
    const handleKey = (event) => {
      const target = event.target
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target?.tagName)) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && key === 'y') {
        event.preventDefault()
        redo()
      } else if (key === 'escape') {
        if (cropId) finishCrop(false)
        else dispatch({ type: 'select', ids: [] })
      } else if (!cropId && state.selectedIds.length && (key === 'delete' || key === 'backspace')) {
        event.preventDefault()
        const ids = page.objects.filter((o) => state.selectedIds.includes(o.id) && !o.locked).map((o) => o.id)
        dispatch({ type: 'removeObjects', ids })
      } else if (!cropId && mod && key === 'd' && state.selectedIds.length) {
        event.preventDefault()
        dispatch({ type: 'duplicateObjects', ids: state.selectedIds })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const showPages = pagesOpen && !focusMode
  const showLayers = layersOpen && !focusMode

  return (
    <View style={styles.root}>
      <TopBar
        doc={state.doc}
        pageNumber={pageIndex + 1}
        layersOpen={showLayers}
        pagesOpen={showPages}
        focusMode={focusMode}
        onHome={() => {
          if (onHome) onHome()
          else showToast('다이어리 홈은 다른 화면에서 연결될 예정이에요.')
        }}
        onTogglePages={() => {
          setFocusMode(false)
          setPagesOpen(!showPages)
        }}
        onToggleLayers={() => {
          setFocusMode(false)
          setLayersOpen(!showLayers)
        }}
        onToggleFocus={() => {
          setFocusMode(!focusMode)
          if (!focusMode) showToast('집중 편집 · 양옆 패널을 닫았어요.')
        }}
        onShare={() => showToast('공유는 백엔드 연결 후 사용할 수 있어요.')}
      />

      <View style={styles.body}>
        {showPages && (
          <PageList
            pages={state.doc.pages}
            currentId={page.id}
            onSelect={(id) => {
              if (cropId) finishCrop(false)
              dispatch({ type: 'selectPage', id })
            }}
            onAdd={() => dispatch({ type: 'addPage' })}
            onRemove={(id) => {
              dispatch({ type: 'removePage', id })
              showToast('페이지를 삭제했어요. 되돌리기로 복구할 수 있어요.')
            }}
          />
        )}

        <View style={styles.stage} onLayout={(event) => setStageSize(event.nativeEvent.layout)}>
          <ScrollView horizontal contentContainerStyle={styles.scrollX} showsHorizontalScrollIndicator={false}>
            <ScrollView contentContainerStyle={styles.scrollY} showsVerticalScrollIndicator={false}>
              <Canvas
                page={page}
                zoom={zoom}
                selectedIds={state.selectedIds}
                cropId={cropTarget?.id ?? null}
                dispatch={dispatch}
                onCrop={startCrop}
                onToast={showToast}
              />
            </ScrollView>
          </ScrollView>

          <View style={styles.ribbonWrap} pointerEvents="box-none">
            <Ribbon
              drawerTab={drawerTab}
              onOpenDrawer={(tab) => {
                if (cropId) finishCrop(false)
                setDrawerTab(drawerTab === tab ? null : tab)
              }}
              onSelectTool={() => setDrawerTab(null)}
              onPlaceholder={(label) => showToast(`${label}은(는) 다른 담당 기능이라 아직 연결하지 않았어요.`)}
            />
          </View>

          {drawerTab && (
            <View style={styles.drawerWrap}>
              <DecorDrawer
                tab={drawerTab}
                onTabChange={setDrawerTab}
                onAdd={addDecor}
                onAddPhotos={addPhotos}
                recentPhotos={recentPhotos}
                onToast={showToast}
                onClose={() => setDrawerTab(null)}
              />
            </View>
          )}

          <View style={[styles.floating, styles.floatingLeft]}>
            <RoundButton icon="undo" label="되돌리기" disabled={!state.past.length} onPress={undo} />
            <View style={styles.floatingDivider} />
            <RoundButton icon="redo" label="다시 실행" disabled={!state.future.length} onPress={redo} />
          </View>

          <View style={[styles.floating, styles.floatingRight]}>
            <RoundButton icon="minus" label="축소" onPress={() => changeZoom(zoom - ZOOM_STEP)} />
            <Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text>
            <RoundButton icon="plus" label="확대" onPress={() => changeZoom(zoom + ZOOM_STEP)} />
            <View style={styles.floatingDivider} />
            <RoundButton icon="fit" label="화면에 맞춤" active={zoomSetting === 'fit'} onPress={() => changeZoom('fit')} />
          </View>

          {toast && (
            <View key={toast.key} style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}
        </View>

        {cropTarget ? (
          <CropPanel photo={cropTarget} dispatch={dispatch} onApply={() => finishCrop(true)} onCancel={() => finishCrop(false)} />
        ) : (
          showLayers && <LayerPanel objects={page.objects} selectedIds={state.selectedIds} saveStatus={saveStatus} dispatch={dispatch} />
        )}
      </View>
    </View>
  )
}

function RoundButton({ icon, label, disabled, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.roundButton, active && styles.roundActive, pressed && styles.roundPressed, disabled && styles.roundDisabled]}
    >
      <Icon name={icon} size={19} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  body: { flex: 1, flexDirection: 'row', gap: 16, padding: 16 },
  stage: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 18 },
  scrollX: { flexGrow: 1, justifyContent: 'center' },
  scrollY: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: STAGE_PADDING.top,
    paddingBottom: STAGE_PADDING.bottom,
    paddingHorizontal: STAGE_PADDING.side,
  },
  ribbonWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  drawerWrap: { position: 'absolute', top: 76, right: 12, bottom: 12 },
  floating: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...shadow.card,
  },
  floatingLeft: { left: 12 },
  floatingRight: { right: 12 },
  floatingDivider: { width: 1, height: 20, backgroundColor: colors.border },
  zoomValue: { minWidth: 52, textAlign: 'center', fontSize: 13, fontWeight: '800', color: colors.text },
  roundButton: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: colors.surfaceSoft },
  roundPressed: { backgroundColor: colors.primarySoft },
  roundDisabled: { opacity: 0.3 },
  toast: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
  toastText: { fontSize: 13, fontWeight: '700', color: colors.surface },
})
