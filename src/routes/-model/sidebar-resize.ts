export const SIDEBAR_COLLAPSE_THRESHOLD = 200
export const SIDEBAR_REOPEN_THRESHOLD = 220

export function sidebarVisibilityForResize(width: number, visible: boolean) {
  if (visible && width <= SIDEBAR_COLLAPSE_THRESHOLD) return false
  if (!visible && width >= SIDEBAR_REOPEN_THRESHOLD) return true
  return visible
}
