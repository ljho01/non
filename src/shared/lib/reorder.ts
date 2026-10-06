export function reorderById<T>(
  items: readonly T[],
  id: string,
  toIndex: number,
  getId: (item: T) => string,
): T[] {
  const fromIndex = items.findIndex((item) => getId(item) === id)
  if (fromIndex < 0) return [...items]

  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  const boundedIndex = Math.max(0, Math.min(toIndex, next.length))
  next.splice(boundedIndex, 0, item)
  return next
}
