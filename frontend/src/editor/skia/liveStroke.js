// 앱: 쓰는 중인 획을 다 그린 획과 같은 Skia 캔버스(맨 위 획 묶음)에 그리려고 PenInput 의 미리보기를 전한다.
// 캔버스가 둘이면 펜을 뗄 때 미리보기가 지워지는 프레임과 다 그린 획이 그려지는 프레임이 어긋나 획마다 깜박였다(사용자 지적).
// 같은 캔버스면 '미리보기 + 묶음' → '새 획을 넣은 묶음'이 한 번에 바뀐다.
let current = null
const listeners = new Set()
export const liveStroke = {
  get: () => current,
  set(next) {
    if (current === next) return
    current = next
    listeners.forEach(listener => listener())
  },
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
