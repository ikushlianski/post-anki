export interface DigestStatTileProps {
  label: string
  value: string
}

export function DigestStatTile({ label, value }: DigestStatTileProps) {
  return (
    <div
      data-testid="digest-stat-tile"
      className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
    </div>
  )
}
