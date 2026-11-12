// 보관함 '펼쳐서' 보기의 펼친 다이어리 줄 배치(OpenBookShelf).

/**
 * 한 번에 한 권(스와이프 보기와 같다): 다이어리마다 화면 폭 한 칸의 가운데에 놓아 옆 다이어리는 화면 밖에 있다.
 * 다이어리마다 왼쪽 끝 x(lefts)와 그 다이어리가 가운데에 올 때의 스크롤 위치(offsets).
 * @param sizes 다이어리마다 { half } (책등에서 바깥 끝까지 = 한 면 폭)
 * @param width 화면(책상) 폭 = 한 칸 폭
 * @param single 한 면만 펼치는지(폰 · 세로 태블릿)
 */
export function rowOf(sizes, width, single) {
  const lefts = [], offsets = [];
  sizes.forEach((size, at) => {
    offsets[at] = Math.round(at * width);
    lefts[at] = at * width + (width - size.half * (single ? 1 : 2)) / 2;
  });
  return { lefts, offsets, content: Math.round(sizes.length * width) };
}

/** 스크롤 위치 x 에서 가운데에 가장 가까운 다이어리 */
export function nearestBook(offsets, x) {
  let best = 0;
  offsets.forEach((offset, at) => { if (Math.abs(offset - x) < Math.abs(offsets[best] - x)) best = at; });
  return best;
}
