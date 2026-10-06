import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NoteEditor } from '../ui/note-editor'
import { createBlock, createNote, serializeNote } from '@/shared/contracts/note'
import type { OpenDocument } from '@/entities/vault'

const doc = (content: string, kind: OpenDocument['kind'] = 'note'): OpenDocument => ({
  path: 'sample.note.json',
  content,
  saved: content,
  revision: '1',
  kind,
  saving: false,
  error: null,
  page: 1,
  pdfText: '',
})
test('JSON editor provides a client-only Tiptap surface instead of textareas', () => {
  const note = createNote('확장 노트')
  note.blocks = [
    { ...createBlock(), text: '**literal text**' },
    { ...createBlock('task'), text: '할 일' },
    { ...createBlock('canvas'), data: { custom: true } },
  ]
  const html = renderToStaticMarkup(
    createElement(NoteEditor, { document: doc(serializeNote(note)) }),
  )
  expect(html).toContain('노트 제목')
  expect(html).toContain('배경 추가')
  expect(html).toContain('Tiptap 편집기 여는 중')
  expect(html).not.toContain('<textarea')
  expect(html).not.toContain('노트 서식')
  expect(html).not.toContain('Non JSON')
})
test('future versions stay read-only while Markdown opens directly in source editing', () => {
  const future = renderToStaticMarkup(
    createElement(NoteEditor, { document: doc('{"format":"non.note","schemaVersion":2}') }),
  )
  expect(future).toContain('지원하지 않는 노트 버전')
  expect(future).not.toContain('aria-label="노트 제목"')
  const legacy = renderToStaticMarkup(
    createElement(NoteEditor, { document: doc('# Old note', 'legacy') }),
  )
  expect(legacy).toContain('Markdown 편집기 여는 중')
  expect(legacy).not.toContain('배경 추가')
  expect(legacy).not.toContain('읽기 모드')
  expect(legacy).not.toContain('편집 모드')
  expect(legacy).not.toContain('읽기 전용')
  expect(legacy).not.toContain('<textarea')
})
