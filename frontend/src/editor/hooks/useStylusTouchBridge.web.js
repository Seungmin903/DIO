import { useEffect, useRef } from 'react'
import { installStylusTouchBridge } from '../utils/stylusTouchBridge.js'
export function useStylusTouchBridge(pointer) {
  const ref = useRef(null)
  useEffect(() => ref.current ? installStylusTouchBridge(ref.current, pointer) : undefined, [pointer])
  return ref
}
