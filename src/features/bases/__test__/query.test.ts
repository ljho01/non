import { expect, test } from 'bun:test'
import { queryBase, summarize, csvFor } from '../model/query'
import type { Base } from '@/shared/contracts/base'
import type { BaseRow } from '@/shared/contracts/base-expression'
const rows: BaseRow[] = [3, 1, 2].map((price) => ({
  path: `${price}.md`,
  properties: { price, status: price === 2 ? 'done' : 'todo' },
  file: { name: `${price}`, ext: 'md' },
}))
test('base and view filters combine, sort numerically, group and limit after filtering', () => {
  const base: Base = {
    filters: { and: ['file.ext == "md"', 'price > 1'] },
    views: [
      {
        type: 'table',
        name: 'A',
        filters: { not: ['status == "done"'] },
        order: ['file.name', 'note.price'],
      },
    ],
  }
  expect(queryBase(rows, base, base.views[0]).rows.map((r) => r.row.path)).toEqual(['3.md'])
  const view = {
    ...base.views[0],
    filters: undefined,
    sort: [{ property: 'note.price', direction: 'DESC' as const }],
    limit: 1,
  }
  expect(queryBase(rows, base, view).rows.map((r) => r.row.path)).toEqual(['3.md'])
  expect(queryBase(rows, base, view).total).toBe(2)
  expect(queryBase(rows, base, view, '2').rows.map((r) => r.row.path)).toEqual(['2.md'])
})
test('invalid filters are surfaced instead of silently returning every record', () => {
  const base: Base = { views: [{ type: 'table', name: 'A', filters: 'window.alert(1)' }] }
  const result = queryBase(rows, base, base.views[0])
  expect(result.rows).toHaveLength(0)
  expect(result.warnings).toHaveLength(3)
})
test('summaries calculate values and CSV escapes multiline and quotes', () => {
  const base: Base = {
    summaries: { Rounded: 'values.mean().round(2)' },
    views: [{ type: 'table', name: 'A', order: ['note.price'] }],
  }
  expect(summarize([1, 2, 9, null], 'Average', base)).toBe(4)
  expect(summarize([1, 2, 9, null], 'Median', base)).toBe(2)
  expect(summarize([1, 2], 'Rounded', base, rows[0])).toBe(1.5)
  const result = queryBase(rows, base, base.views[0])
  result.rows[0].cells['note.price'] = 'a,"b"\nc'
  expect(csvFor(result.rows, ['note.price'], base)).toContain('"a,""b""\nc"')
})

test('new rows inherit only positive literal equalities and folder filters', async () => {
  const { defaultsForNewRow } = await import('../model/query')
  const base: Base = {
    filters: 'file.inFolder("Books")',
    views: [
      {
        name: 'Reading',
        type: 'table',
        filters: {
          and: [
            'note["status"] == "reading" && rating == 5',
            { or: ['author == "A"', 'author == "B"'] },
          ],
        },
      },
    ],
  }
  expect(defaultsForNewRow(base, base.views[0])).toEqual({
    folder: 'Books',
    properties: { status: 'reading', rating: 5 },
  })
})
