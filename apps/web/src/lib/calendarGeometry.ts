/**
 * Calendar Month geometry (03-UX §5), in px. One source for the CSS (custom properties on the grid)
 * and for how many cards a cell shows, so the count always matches what physically fits.
 */
export const MONTH_CELL = {
  /** Fixed cell height: rows never jump as entries move or overflow opens. */
  height: 216,
  padding: 12,
  /** Date header row (the 28px date mark; its 44px hit area overflows into the padding). */
  header: 28,
  /** Fixed card height: inline time plus up to two title lines. */
  card: 44,
  gap: 8,
  /** The +N more control. */
  more: 28,
} as const

export type MonthCellGeometry = { [K in keyof typeof MONTH_CELL]: number }

/** Cards shown in a cell with `total` entries: all when they fit, else as many as fit beside +N more. */
export function monthVisibleCount(total: number, g: MonthCellGeometry = MONTH_CELL): number {
  const content = g.height - 2 * g.padding - g.header - g.gap
  const fit = (space: number) => Math.max(0, Math.floor((space + g.gap) / (g.card + g.gap)))
  const all = fit(content)
  if (total <= all) return total
  return Math.max(1, fit(content - g.more - g.gap))
}

/** The same numbers as CSS custom properties for the Month grid. */
export function monthCellStyle(g: MonthCellGeometry = MONTH_CELL): Record<string, string> {
  return {
    '--month-cell-h': `${g.height}px`,
    '--month-cell-pad': `${g.padding}px`,
    '--month-cell-header': `${g.header}px`,
    '--month-card-h': `${g.card}px`,
    '--month-card-gap': `${g.gap}px`,
    '--month-more-h': `${g.more}px`,
  }
}
