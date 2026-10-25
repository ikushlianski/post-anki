import { applyColumnOrder } from './column-order'

export interface ColumnLayout<Id extends string = string> {
  order: Id[]
  hidden: Id[]
}

export interface SavedColumnLayout {
  order: string[] | null
  hidden: string[] | null
}

export function resolveColumnLayout<Id extends string>(
  saved: SavedColumnLayout | null,
  defaults: readonly Id[],
): ColumnLayout<Id> {
  const order = applyColumnOrder(saved?.order ?? null, defaults) as Id[]
  const hidden = defaults.filter((id) => saved?.hidden?.includes(id))

  return { order, hidden: hidden.length >= defaults.length ? [] : hidden }
}

export function visibleColumns<Id extends string>(layout: ColumnLayout<Id>): Id[] {
  return layout.order.filter((id) => !layout.hidden.includes(id))
}

export function toggleColumn<Id extends string>(layout: ColumnLayout<Id>, id: Id): ColumnLayout<Id> {
  if (layout.hidden.includes(id)) {
    return { ...layout, hidden: layout.hidden.filter((hiddenId) => hiddenId !== id) }
  }

  if (visibleColumns(layout).length <= 1) {
    return layout
  }

  return { ...layout, hidden: [...layout.hidden, id] }
}

export function reorderVisible<Id extends string>(
  layout: ColumnLayout<Id>,
  nextVisible: readonly Id[],
): ColumnLayout<Id> {
  const queue = [...nextVisible]
  const order = layout.order.map((id) => (layout.hidden.includes(id) ? id : (queue.shift() ?? id)))

  return { ...layout, order }
}

export function isDefaultLayout<Id extends string>(
  layout: ColumnLayout<Id>,
  defaults: readonly Id[],
): boolean {
  return layout.hidden.length === 0 && layout.order.every((id, index) => id === defaults[index])
}
