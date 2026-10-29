import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

// 페이지(캔버스) 안에서 만든 요소를 작업창(stage) 위 층에 그리는 통로.
// Android·iOS 는 부모 영역 밖으로 나간 버튼에 터치를 주지 않아서, 페이지 밖까지 나가야 하는 선택 바는 stage 를 덮는 층에 그린다.
const StageOverlayContext = createContext(null)

/**
 * stage 를 덮는 층. children(Viewport 등)은 그대로 두고, StageOverlay 로 보낸 요소를 그 위에 그린다.
 * hidden: 확대·이동하는 동안처럼 잠깐 숨길 때. 요소를 내리지 않아 열어 둔 메뉴·측정한 너비가 그대로 남는다.
 */
export function StageOverlayHost({ hidden = false, children }) {
  const [content, setContent] = useState(null)
  return (
    <StageOverlayContext.Provider value={setContent}>
      {children}
      <View pointerEvents={hidden ? 'none' : 'box-none'} style={[StyleSheet.absoluteFill, hidden && styles.hidden]}>{content}</View>
    </StageOverlayContext.Provider>
  )
}

/** children 을 가장 가까운 StageOverlayHost 층에 그린다. 층이 없으면(미리보기·테스트) 그 자리에 그린다. */
export function StageOverlay({ children }) {
  const setContent = useContext(StageOverlayContext)
  useLayoutEffect(() => { setContent?.(children ?? null) })
  useLayoutEffect(() => () => setContent?.(null), [setContent])
  return setContent ? null : children
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
})
