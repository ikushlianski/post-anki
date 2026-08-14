export function reorderAfterDrag(
  ids: string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) {
    return ids;
  }

  if (!ids.includes(activeId) || !ids.includes(overId)) {
    return ids;
  }

  const newIds = [...ids];
  const activeIndex = newIds.indexOf(activeId);
  const overIndex = newIds.indexOf(overId);

  newIds.splice(activeIndex, 1);
  newIds.splice(overIndex, 0, activeId);

  return newIds;
}
