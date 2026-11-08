// 스와이프 카드의 크기 · 높이 변화(옆 카드 → 가운데 카드). 카드는 위를 기준(transformOrigin: center top)으로 커지고 작아지며 위아래로 오른다.

export const CAROUSEL_SCALE = [0.84, 1.06, 0.84] // 옆 · 가운데 · 옆 카드의 크기
export const CAROUSEL_LIFT = [30, -12, 30] // 옆 · 가운데 · 옆 카드의 아래로 내려간 거리(px)


// 가운데가 아닌 옆 카드의 불투명도 (1이면 가운데 카드와 같다)
export const SIDE_CARD_OPACITY = 1 // 옆 카드도 실제 표지다(반투명 유령 · 어두운 막 없음). 멀어 보이는 건 크기 · 높이 차이만 맡는다

// 카드 위치(index)마다 스크롤 위치에 따라 크기·높이가 바뀌는 애니메이션 스타일.
// 3D 기울기(rotateY)는 쓰지 않는다. 위를 기준으로 줄이면 기울기 축도 위로 가서 옆 카드 아랫변이 비뚤게 보인다.
// 옆 카드는 카드 자체를 반투명하게 한다(흰 막을 덮으면 표지 위에 흰 층이 티가 난다). 안드로이드가 자식마다 따로 투명하게 하지 않도록 DiaryCard 가 카드를 한 장으로 합쳐 그린다.
// 가운데와 양옆 한 권씩만 보이고, 두 칸 떨어진 다이어리는 숨는다(넘기는 동안 서서히 나타난다).
// scale · lift 를 바꾸면 같은 움직임을 다른 기준(예: 펼쳐서는 가운데 = 1 · 0)으로 쓴다.
export function carouselMotion(scrollX, index, step, scale = CAROUSEL_SCALE, lift = CAROUSEL_LIFT) {
  const inputRange = [(index - 1) * step, index * step, (index + 1) * step]
  const along = (outputRange) => scrollX.interpolate({ inputRange, outputRange, extrapolate: 'clamp' })
  return {
    card: {
      zIndex: 1,
      opacity: scrollX.interpolate({ inputRange: [(index - 2) * step, (index - 1) * step, index * step, (index + 1) * step, (index + 2) * step], outputRange: [0, SIDE_CARD_OPACITY, 1, SIDE_CARD_OPACITY, 0], extrapolate: 'clamp' }),
      // 카드 높이가 달라도(맨 끝 '새 다이어리' 카드는 정보 줄이 없어 짧다) 윗변이 한 줄에 오도록 위를 기준으로 줄이고 키운다.
      transformOrigin: 'center top',
      transform: [
        { scale: along(scale) },
        { translateY: along(lift) },
      ],
    },
    info: { opacity: along([0.75, 1, 0.75]) }, // 옆 카드 정보 글자만 조금 흐리게
  }
}

// 펼쳐서 보기: 스와이프와 같은 움직임(옆 → 가운데의 크기 · 높이 차이)을 가운데 다이어리 = 원래 크기 · 자리로 맞춰 쓴다.
// 멈춰 있을 때 펼친 다이어리의 크기 · 높이(스와이프와 맞춘 값)는 그대로, 넘기는 동안만 옆 다이어리가 스와이프 옆 카드처럼 작아지고 내려간다.
export const OPEN_BOOK_SCALE = CAROUSEL_SCALE.map(value => value / CAROUSEL_SCALE[1])
export const OPEN_BOOK_LIFT = CAROUSEL_LIFT.map(value => value - CAROUSEL_LIFT[1])
