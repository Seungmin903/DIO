// DIO 디자인 토큰 (docs/디자인 가이드.md · 2장 색, 4장 모서리·그림자)
export const colors = {
  surface: '#FFFFFF',
  surfaceSoft: '#F3F3F7',
  primary: '#818AC3',
  primaryStrong: '#606BB2', // 흰 글자·아이콘을 올리는 채운 주요 버튼
  secondary: '#ABB1D8',
  text: '#0B1766',
  textMuted: 'rgba(11,23,102,0.68)',
  border: 'rgba(11,23,102,0.16)',
  // 위 토큰에서 파생한 보조 값
  primarySoft: 'rgba(129,138,195,0.18)',
  surfaceMuted: '#F0F1F9', // 회색 판: 선택 안 된 칩·세그먼트, ± 버튼, 보조 버튼 바탕
  panel: 'rgba(255,255,255,0.72)',
  danger: '#E04D6F',
  overlay: 'rgba(11,23,102,0.34)',
  scrim: 'rgba(11,23,102,0.28)', // 대화상자 뒤 어둡게 덮기
}

// 누를 수 없는 상태 (docs/design-guide.md 7장)
export const DISABLED_OPACITY = 0.4

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 }

export const shadow = {
  card: {
    shadowColor: '#0B1766',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  float: {
    shadowColor: '#0B1766',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
}
