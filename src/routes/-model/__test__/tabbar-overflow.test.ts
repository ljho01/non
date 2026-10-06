import { expect, test } from 'bun:test'
import { getTabbarOverflow } from '../tabbar-overflow'

test('reports whether tabs overflow and whether hidden tabs remain on the right', () => {
  expect(getTabbarOverflow({ clientWidth: 400, scrollLeft: 0, scrollWidth: 400 })).toEqual({
    overflow: false,
    overflowRight: false,
  })
  expect(getTabbarOverflow({ clientWidth: 400, scrollLeft: 0, scrollWidth: 680 })).toEqual({
    overflow: true,
    overflowRight: true,
  })
  expect(getTabbarOverflow({ clientWidth: 400, scrollLeft: 140, scrollWidth: 680 })).toEqual({
    overflow: true,
    overflowRight: true,
  })
  expect(getTabbarOverflow({ clientWidth: 400, scrollLeft: 280, scrollWidth: 680 })).toEqual({
    overflow: true,
    overflowRight: false,
  })
})
