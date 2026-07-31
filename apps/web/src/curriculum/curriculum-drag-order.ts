// course-priority-drag-reorder (issue #69) — pure reorder logic for a
// dnd-kit `onDragEnd` event, kept free of any drag library or DOM
// dependency so it can be unit-tested directly (Scenarios 1, 3). `subject-
// section.tsx` is the only caller: it feeds this the pre-drag id order plus
// the drag event's active/over ids, and uses the result as the new local
// render order before firing the `reorderCurricula` mutation.
export function reorderAfterDrag(
  ids: string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) {
    return ids
  }

  const activeIndex = ids.indexOf(activeId)
  const overIndex = ids.indexOf(overId)

  if (activeIndex === -1 || overIndex === -1) {
    return ids
  }

  const next = [...ids]
  const [moved] = next.splice(activeIndex, 1)

  next.splice(overIndex, 0, moved!)

  return next
}
