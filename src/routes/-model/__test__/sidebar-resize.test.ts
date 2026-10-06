import { expect, test } from 'bun:test'
import {
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_REOPEN_THRESHOLD,
  sidebarVisibilityForResize,
} from '../sidebar-resize'

test('sidebar resize collapses below its threshold and reopens during the same drag', () => {
  expect(sidebarVisibilityForResize(SIDEBAR_COLLAPSE_THRESHOLD + 1, true)).toBe(true)
  expect(sidebarVisibilityForResize(SIDEBAR_COLLAPSE_THRESHOLD, true)).toBe(false)
  expect(sidebarVisibilityForResize(SIDEBAR_REOPEN_THRESHOLD - 1, false)).toBe(false)
  expect(sidebarVisibilityForResize(SIDEBAR_REOPEN_THRESHOLD, false)).toBe(true)
})

test('sidebar resize uses hysteresis around the collapse boundary', () => {
  expect(sidebarVisibilityForResize(SIDEBAR_COLLAPSE_THRESHOLD + 1, false)).toBe(false)
  expect(sidebarVisibilityForResize(SIDEBAR_REOPEN_THRESHOLD - 1, true)).toBe(true)
})
