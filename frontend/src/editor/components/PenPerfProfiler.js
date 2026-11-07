import { Profiler } from 'react'
import { PEN_PERFORMANCE_ENABLED, markPenPerformance } from '../utils/penPerformance.js'

// 펜 측정이 켜진 개발 실행에서만 React 커밋 시간을 진행 중인 획 측정에 붙인다(id + 'CommitMs'). 꺼져 있으면 자식을 그대로 돌려준다.
const passthrough = ({ children }) => children
// nested-update: 커밋 직후 effect 가 다시 setState 해 연쇄된 커밋(렌더 루프의 징후)
const profiled = ({ id, children }) => <Profiler id={id} onRender={(_id, phase, actualDuration) => { markPenPerformance(`${id}CommitMs`, actualDuration); if (phase === 'nested-update') markPenPerformance(`${id}NestedUpdate`, 1) }}>{children}</Profiler>
const PenPerfProfiler = PEN_PERFORMANCE_ENABLED ? profiled : passthrough
export default PenPerfProfiler
