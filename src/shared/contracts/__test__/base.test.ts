import { expect, test } from 'bun:test'
import { parseBase, serializeBase, createBase } from '../base'
import { readProperties, writeProperty } from '../properties'
import { createNote, parseNote, serializeNote } from '../note'
import { evaluateExpression, type BaseRow } from '../base-expression'
const row: BaseRow = {
  path: 'Books/one.md',
  properties: { price: 4, quantity: 3, status: 'done', tags: ['books'] },
  file: { name: 'one', folder: 'Books', tags: ['books/fiction'] },
}

test('base YAML preserves extension fields and rejects ambiguous or invalid input', () => {
  const source =
    '# keep\nplugin: {x: 12}\nviews:\n  - type: table\n    name: Table\n    columnSize: {file.name: 200}\n'
  const base = parseBase(source)
  expect(parseBase(serializeBase({ ...base, filters: 'price > 2' }, source)).plugin).toEqual({
    x: 12,
  })
  expect(serializeBase(base, source)).toContain('# keep')
  expect(parseBase(createBase()).views[0].type).toBe('table')
  expect(() => parseBase('views: []')).toThrow()
  expect(() => parseBase('views: []\nviews: []')).toThrow()
  expect(parseBase(serializeBase({ ...base, filters: undefined }, source)).filters).toBeUndefined()
})
test('property edits preserve Markdown body bytes, BOM, CRLF, comments and unknown fields', () => {
  const body = '# title\r\n\r\n```yaml\r\nx: 2\r\n```\r\n**bold**  \r\n'
  const source =
    '\uFEFF---\r\n# keep this\r\nprice: 4 # dollars\r\ncustom: {x: [a, b]}\r\n---\r\n' + body
  const edited = writeProperty('a.md', source, 'price', 8)
  expect(edited.endsWith(body)).toBe(true)
  expect(edited.startsWith('\uFEFF---\r\n')).toBe(true)
  expect(edited).toContain('# keep this')
  expect(readProperties('a.md', edited)).toEqual({ price: 8, custom: { x: ['a', 'b'] } })
  expect(readProperties('a.md', writeProperty('a.md', edited, 'price', undefined))).toEqual({
    custom: { x: ['a', 'b'] },
  })
  expect(() => writeProperty('a.md', '---\na: [broken\n---\nbody', 'a', 2)).toThrow()
})
test('property editing retains all unknown JSON note and block extensions', () => {
  const note = {
    ...createNote('A'),
    custom: { plugin: true },
    metadata: { cover: 'fog', properties: { cost: 2 } },
  }
  note.blocks[0].custom = 'unchanged'
  const updated = parseNote(writeProperty('a.note.json', serializeNote(note), 'cost', 6))
  expect(updated.custom).toEqual({ plugin: true })
  expect(updated.blocks).toEqual(note.blocks)
  expect(updated.metadata).toEqual({ cover: 'fog', properties: { cost: 6 } })
})
test('expressions calculate formulas, lazy branches, nested properties and file predicates', () => {
  const context = {
    row,
    formulas: { subtotal: 'price * quantity', label: '"$" + formula.subtotal' },
  }
  expect(evaluateExpression('formula.label', context)).toBe('$12')
  expect(evaluateExpression('if(price > 0, formula.subtotal, 1 / 0)', context)).toBe(12)
  expect(evaluateExpression('file.inFolder("Books") && file.hasTag("books")', context)).toBe(true)
  expect(evaluateExpression('note["status"].upper()', context)).toBe('DONE')
  expect(evaluateExpression('missing.isEmpty()', context)).toBe(true)
  expect(evaluateExpression('false && unknown()', context)).toBe(false)
})
test('expressions cannot execute JavaScript or access prototypes and detect cycles', () => {
  for (const expr of [
    'file.constructor',
    'note["__proto__"]',
    'window.alert(1)',
    'eval("1")',
    'price = 4',
    '1; 2',
  ])
    expect(() => evaluateExpression(expr, { row })).toThrow()
  expect(() =>
    evaluateExpression('formula.a', { row, formulas: { a: 'formula.b', b: 'formula.a' } }),
  ).toThrow('순환')
})

test('date arithmetic supports calendar durations and chained formatting', () => {
  expect(
    evaluateExpression('(date("2025-01-01T12:00:00") + "1M").format("YYYY-MM-DD")', { row }),
  ).toBe('2025-02-01')
  expect(
    evaluateExpression('date("2025-01-08T00:00:00Z") - date("2025-01-01T00:00:00Z")', { row }),
  ).toBe(7 * 86400000)
  expect(
    evaluateExpression('(date("2025-01-08T12:00:00") - "1 week").format("YYYY-MM-DD")', { row }),
  ).toBe('2025-01-01')
})
