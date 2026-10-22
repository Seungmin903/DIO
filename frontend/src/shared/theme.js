// DIO 디자인 토큰 (docs/design-guide.md · 2장 색, 4장 모서리·그림자)
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
  surfaceMuted: '#EEF2F9', // 회색 판: 선택 안 된 칩·세그먼트, ± 버튼, 보조 버튼 바탕
  panel: 'rgba(255,255,255,0.72)',
  danger: '#E5484D',
  overlay: 'rgba(11,25,87,0.34)',
  scrim: 'rgba(11,25,87,0.28)', // 대화상자 뒤 어둡게 덮기
}

// 누를 수 없는 상태 (docs/design-guide.md 7장)
export const DISABLED_OPACITY = 0.4

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
