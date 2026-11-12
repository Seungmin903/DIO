import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

// 시스템 '움직임 줄이기'가 켜져 있는지. 켜져 있으면 시트 · 패널은 움직임 없이 바로 나타난다.
export default function useReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (alive) setReduce(Boolean(value)) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return reduce
}
