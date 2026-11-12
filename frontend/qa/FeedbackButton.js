import { useEffect, useRef, useState } from 'react'

export default function FeedbackButton({ label, value }) {
  const [count, setCount] = useState(0), [status, setStatus] = useState('미기록')
  const sequence = useRef(0), contact = useRef(null), latest = useRef(null)
  const prefix = useRef(`feedback-${Date.now().toString(36)}-${value}`)
  const report = details => window.__DIO_PEN_QA_REPORT__({ ...window.__DIO_PERF_CASE__, value, ...details })
  const nextId = () => `${prefix.current}-${++sequence.current}`
  useEffect(() => {
    const ack = event => {
      const r = event.detail
      if (r.type !== 'feedback' || r.recordId !== latest.current) return
      setStatus(r.ok && r.stored ? '서버 저장 확인' : '전송/저장 실패 · 다시 눌러주세요')
    }
    window.addEventListener('dio-performance-ack', ack)
    return () => window.removeEventListener('dio-performance-ack', ack)
  }, [])
  return <button type="button" aria-label={label} data-dio-qa-feedback={value}
    onPointerDown={event => {
      contact.current = nextId(); setStatus('누름 감지 · 손을 떼주세요')
      report({ type: 'feedback-contact', phase: 'down', recordId: contact.current, pointerType: event.pointerType })
    }}
    onPointerCancel={() => {
      report({ type: 'feedback-contact', phase: 'cancel', recordId: contact.current })
      contact.current = null; setStatus('누름 취소 · 다시 눌러주세요')
    }}
    onClick={() => {
      const id = contact.current ?? nextId()
      contact.current = null; latest.current = id
      setCount(n => n + 1); setStatus('전송 중')
      report({ type: 'feedback', recordId: id })
    }}
    style={{ minHeight: 40, padding: '6px 12px', borderRadius: 8, border: '1px solid #CBD1DB', background: count ? '#DCE6FA' : '#FFF', color: '#253352', fontSize: 13, touchAction: 'manipulation' }}>
    {label} · {count}회 / {status}
  </button>
}
