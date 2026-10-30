// Fit every prompt on one sheet. The guide font is always half the inner cell size.
export function manuscriptLayout(width, height, count = 36) {
  const availableWidth = Math.max(1, width), availableHeight = Math.max(1, height)
  let best = { columns: 1, rows: count, cell: 1, gap: .25, score: 0 }
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)
    const cell = Math.min(100, availableWidth / columns, availableHeight / (rows + (rows - 1) / 4))
    // Prefer rectangular sheets over a mostly empty final line when sizes are close.
    const score = cell * (count % columns === 0 ? 1 : .94)
    if (score > best.score) best = { columns, rows, cell, gap: cell / 4, score }
  }
  return { ...best, width: best.columns * best.cell, height: best.rows * best.cell + (best.rows - 1) * best.gap }
}
