/*
 * domain/pie-chart.ts — turns per-category totals into pie slices:
 * the share of each category and the color it is drawn with.
 */

export const PIE_COLORS: readonly string[] = [
  '#00E5A0', '#4F8EF7', '#F7C948', '#FF6B6B', '#A78BFA',
  '#38BDF8', '#FB923C', '#F472B6', '#34D399', '#94A3B8',
]

export interface PieSlice {
  label: string
  /** Glyph drawn next to the label in the legend. */
  icon?: string
  amount: number
  /** Share of the whole, between 0 and 1. */
  fraction: number
  color: string
}

/** Slices in the given order; entries with no positive amount are dropped. */
export function buildPieSlices(entries: readonly { label: string, icon?: string, amount: number }[]): PieSlice[] {
  const kept = entries.filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
  const total = kept.reduce((sum, entry) => sum + entry.amount, 0)
  if (total === 0) return []
  return kept.map((entry, index) => ({
    label: entry.label,
    icon: entry.icon,
    amount: entry.amount,
    fraction: entry.amount / total,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }))
}
