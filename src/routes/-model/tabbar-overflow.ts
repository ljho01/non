const SCROLL_TOLERANCE = 1

export type HorizontalScrollMetrics = {
  clientWidth: number
  scrollLeft: number
  scrollWidth: number
}

export function getTabbarOverflow({
  clientWidth,
  scrollLeft,
  scrollWidth,
}: HorizontalScrollMetrics) {
  const maximumScroll = Math.max(0, scrollWidth - clientWidth)
  const currentScroll = Math.max(0, Math.min(maximumScroll, scrollLeft))
  const overflow = maximumScroll > SCROLL_TOLERANCE

  return {
    overflow,
    overflowRight: overflow && maximumScroll - currentScroll > SCROLL_TOLERANCE,
  }
}
