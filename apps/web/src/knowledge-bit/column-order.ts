export function applyColumnOrder(saved: readonly string[] | null, defaults: readonly string[]): string[] {
  const known = (saved ?? []).filter((id, index, all) => defaults.includes(id) && all.indexOf(id) === index)
  const missing = defaults.filter((id) => !known.includes(id))

  return [...known, ...missing]
}

export function moveColumn(order: readonly string[], fromId: string, toId: string): string[] {
  const from = order.indexOf(fromId)
  const to = order.indexOf(toId)

  if (from === -1 || to === -1 || from === to) {
    return [...order]
  }

  const next = [...order]
  const [moved] = next.splice(from, 1)

  next.splice(to, 0, moved as string)

  return next
}
