// MVP1 디자인 토큰 (docs: DIO MVP1 UI/UX 명세 · 2. 디자인 토큰)
export const colors = {
  surface: '#FFFFFF',
  surfaceSoft: '#CED9EE',
  primary: '#6E92C6',
  secondary: '#9FB6D9',
  text: '#0B1957',
  textMuted: 'rgba(11,25,87,0.68)',
  border: 'rgba(11,25,87,0.16)',
  // 위 토큰에서 파생한 보조 값
  primarySoft: 'rgba(110,146,198,0.18)',
  panel: 'rgba(255,255,255,0.72)',
  danger: '#E5484D',
  overlay: 'rgba(11,25,87,0.34)',
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 }

export const shadow = {
  card: {
    shadowColor: '#0B1957',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  float: {
    shadowColor: '#0B1957',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
}
