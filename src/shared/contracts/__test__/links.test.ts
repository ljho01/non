import { expect, test } from 'bun:test'
import { createNote } from '../note'
import { noteLinks, resolveNoteLink, type IndexedDocument } from '../links'

test('link extraction follows canonical rich content, ignores code and preserved historical payloads', () => {
  const note = createNote('Source')
  note.blocks = [
    { id: 'a', type: 'paragraph', text: '[[Target|별명]] \\[[escaped]]' },
    { id: 'b', type: 'code', text: '[[ignored]]' },
    {
      id: 'c',
      type: 'tiptap',
      text: '[[stale cache]]',
      mergedSources: [{ text: '[[old]]' }],
      content: {
        type: 'paragraph',
        content: [
          { type: 'text', text: '[[Tar', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'get]]' },
          { type: 'text', text: '[[code]]', marks: [{ type: 'code' }] },
          { type: 'wikiLink', attrs: { target: 'id:stable', label: 'Stable' } },
        ],
      },
    },
    {
      id: 'd',
      type: 'tiptap',
      content: { type: 'codeBlock', content: [{ type: 'text', text: '[[ignore]]' }] },
    },
  ]
  expect(noteLinks(note).map((link) => link.target)).toEqual(['Target', 'Target', 'id:stable'])
})

test('document links resolve paths, aliases and IDs without guessing ambiguous titles', () => {
  const doc = (path: string, title: string, id: string): IndexedDocument => ({
    path,
    title,
    id,
    kind: 'note',
    aliases: [],
    modified: 0,
    text: '',
  })
  const documents = [
    doc('a/one.note.json', 'Same', 'one'),
    doc('b/two.note.json', 'Same', 'two'),
    { ...doc('other.note.json', 'Other', 'other'), aliases: ['Alias'] },
  ]
  expect(resolveNoteLink(documents, 'a/source.note.json', './one')).toMatchObject({
    path: 'a/one.note.json',
  })
  expect(resolveNoteLink(documents, 'a/source.note.json', '../other#heading')).toMatchObject({
    path: 'other.note.json',
  })
  expect(resolveNoteLink(documents, '', 'Alias')).toMatchObject({ path: 'other.note.json' })
  expect(resolveNoteLink(documents, '', 'Same')).toMatchObject({ status: 'ambiguous', path: null })
  expect(resolveNoteLink(documents, '', 'id:two')).toMatchObject({ path: 'b/two.note.json' })
  for (const target of [
    '../../outside',
    '.non/private',
    'https://example.com',
    'file:///etc/passwd',
  ])
    expect(resolveNoteLink(documents, '', target).status).toBe('missing')
})
