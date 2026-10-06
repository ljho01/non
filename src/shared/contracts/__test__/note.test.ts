import { expect, test } from 'bun:test'
import {
  createBlock,
  createNote,
  duplicateNote,
  noteCover,
  noteText,
  parseNote,
  serializeNote,
  updateBlock,
} from '../note'

test('block edits and round trips preserve unknown extensions and nested blocks', () => {
  const note = createNote('Title')
  note.future = { graph: ['reference'] }
  note.blocks[0].annotations = [{ color: 'sage' }]
  note.blocks[0].children = [
    {
      ...createBlock('future-canvas'),
      layout: { x: 1 },
      content: [{ type: 'link', href: 'local:123' }],
    },
  ]
  const child = note.blocks[0].children[0]
  const edited = parseNote(
    serializeNote(updateBlock(note, note.blocks[0].id, { text: 'Written text' })),
  )
  expect(edited.future).toEqual(note.future)
  expect(edited.blocks[0].annotations).toEqual(note.blocks[0].annotations)
  expect(edited.blocks[0].children?.[0]).toEqual(child)
  expect(noteText(edited)).toBe('Title\n\nWritten text')
  const copied = duplicateNote(edited)
  expect(copied.id).not.toBe(note.id)
  expect(copied.blocks[0].children?.[0].id).not.toBe(child.id)
  expect(copied.blocks[0].children?.[0].layout).toEqual(child.layout)
})
test('note covers use known metadata values without disturbing extension data', () => {
  const note = createNote('Covered')
  note.metadata = { cover: 'moss', graph: { pinned: true } }
  const parsed = parseNote(serializeNote(note))
  expect(noteCover(parsed)).toBe('moss')
  expect(parsed.metadata?.graph).toEqual({ pinned: true })
  parsed.metadata = { ...parsed.metadata, cover: 'future-cover' }
  expect(noteCover(parsed)).toBeNull()
})
test('unsupported versions, invalid documents, and duplicate IDs cannot be edited', () => {
  expect(() => parseNote('{"format":"non.note","schemaVersion":2}')).toThrow('지원하지 않는')
  expect(() => parseNote('{"title":"plain JSON"}')).toThrow()
  const note = createNote('Title')
  note.blocks.push({ ...note.blocks[0] })
  expect(() => parseNote(serializeNote(note))).toThrow('중복')
})
