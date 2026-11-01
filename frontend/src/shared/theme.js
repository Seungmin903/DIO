// DIO 디자인 토큰 (docs/디자인 가이드.md · 2장 색, 4장 모서리·그림자)
export const colors = {
  surface: '#FFFFFF',
  surfaceSoft: '#F7F8FD', // 앱 바탕: 옅은 페리윙클 종이(1020 감성 점검 B안 '사진부 아카이브', 질감 없음)
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
  dangerSoft: 'rgba(224,77,111,0.08)',
  dangerStrong: '#B52E52', // 흰 바탕 위 작은 오류 글자 · 흰 글자를 올리는 영구 삭제 버튼(흰색 대비 6.0:1). danger(3.85:1)는 아이콘 · 테두리에만 쓴다
  // 색 규칙(docs/앱 감성 리뉴얼/06 §1.1): 메인은 UI 색상 계열(페리윙클~네이비), 보조는 캐릭터 노랑 하나. 그 밖의 색상 계열은 UI 층에서 쓰지 않는다.
  lavender100: '#DBDCF9', // 두리 목도리 색 · 라벤더 테이프 · 보조 카드 면
  cardBorder: '#D9DCEF', // 카드 · 프레임 경계(장식, 의미 전달에는 쓰지 않는다)
  primaryText: '#525FAD', // 회색 바탕(surfaceSoft) 위 파란 글자(primaryStrong 4.47:1 → 5.27:1)
  butter: '#FEF0BF', // 디오 몸 색. 작은 면 · 상태 칩. 큰 면(바탕 · 카드 · 배너) 금지, 위 글자는 항상 text
  butterTape: '#FBE5A3', // 마스킹테이프
  butterStrong: '#B98208', // 노랑 점 · 고리(흰색 위 3.35:1)
  notifyPink: '#B63F7C', // 알림 점(읽지 않음) 전용 쿨톤 핑크. 사용자 지시로 색 규칙의 유일한 예외다(흰색 위 5.26:1 · 앱 바탕 위 4.75:1). 위험색(dangerStrong)과 섞어 쓰지 않는다
  overlay: 'rgba(11,23,102,0.34)',
  scrim: 'rgba(0,0,0,0.32)', // 대화상자 뒤 어둡게 덮기. 사이드 메뉴를 펼칠 때 덮는 막(railScrimTint)과 같은 검정
}

// 누를 수 없는 상태 (docs/design-guide.md 7장)
export const DISABLED_OPACITY = 0.4

// B안 모서리: 사진 틀 8 · 버튼 10 · 카드 12. 큰 판(시트 · 대화 상자)만 16
export const radius = { sm: 8, md: 10, lg: 12, xl: 16 }

export const shadow = {
  // B안: 그림자는 거의 쓰지 않는다. 사진 · 표지 카드만 6% · 아래 6 · 흐림 16, 떠 있는 판은 그보다 조금 진하게
  card: {
    shadowColor: '#0B1766',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  float: {
    shadowColor: '#0B1766',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
}

// 버튼 옆에 뜨는 작은 메뉴(말풍선, 꼬리 없음)의 면: 홈 ⋯ 동작 · 보관함 옵션 · 페이지 작업 메뉴가 같은 모양을 쓴다
export const bubble = {
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.cardBorder,
  backgroundColor: colors.surface,
  boxShadow: '0px 6px 16px rgba(11, 23, 102, 0.08)',
}
