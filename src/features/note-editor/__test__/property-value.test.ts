import { expect, test } from 'bun:test'
import { markdownPropertyParts, readProperties, writeProperty } from '@/shared/contracts/properties'
import { parsePropertyDraft, propertyDraft } from '../model/property-value'

test('separate Markdown body edits preserve BOM, YAML comments, closing marker and CRLF', () => {
  const prefix = '\uFEFF---\r\n# Keep this comment\r\nstatus: "읽는 중"\r\n...\r\n'
  const body = '# Title\r\n\r\n```js\r\nconst x = 1\r\n```\r\n'
  const parts = markdownPropertyParts(prefix + body)
  expect(parts).toEqual({ prefix, body })
  expect(parts.prefix + parts.body.replace('x = 1', 'x = 2')).toBe(prefix + body.replace('x = 1', 'x = 2'))
  const updated = writeProperty('Title.md', prefix + body, 'status', '완료')
  expect(markdownPropertyParts(updated).body).toBe(body)
  expect(readProperties('Title.md', updated).status).toBe('완료')
  expect(updated).toContain('# Keep this comment')
})

test('ordinary separators in Markdown body are not treated as document properties', () => {
  const source = '# Title\n\n---\ntext\n'
  expect(markdownPropertyParts(source)).toEqual({ prefix: '', body: source })
  expect(() => markdownPropertyParts('---\nstatus: reading')).toThrow()
})

test('property editing preserves number and structured value types', () => {
  expect(parsePropertyDraft('42.5', 1)).toBe(42.5)
  expect(parsePropertyDraft('', 1)).toBeNull()
  expect(() => parsePropertyDraft('not a number', 1)).toThrow()
  const list = [1, true, { label: 'A' }]
  expect(parsePropertyDraft(propertyDraft(list), list)).toEqual(list)
  expect(() => parsePropertyDraft('{}', list)).toThrow()
  expect(parsePropertyDraft('{"nested": [1, 2]}', {})).toEqual({ nested: [1, 2] })
  expect(parsePropertyDraft('001', 'original')).toBe('001')
})
