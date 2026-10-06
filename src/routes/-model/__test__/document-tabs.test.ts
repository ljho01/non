import { expect, test } from 'bun:test'
import { createNote, serializeNote } from '@/shared/contracts/note'
import {
  documentTabTitle,
  modWActionForTabCount,
  tabIndexForShortcut,
  workspaceTabTargetForShortcut,
} from '../document-tabs'

test('tab titles follow live JSON titles while Markdown and PDFs use filenames', () => {
  expect(
    documentTabTitle({
      path: 'Notes/Untitled.note.json',
      kind: 'note',
      content: serializeNote({ ...createNote('처음'), title: '바뀐 제목' }),
    }),
  ).toBe('바뀐 제목')
  expect(
    documentTabTitle({ path: 'Notes/Draft.md', kind: 'legacy', content: '# 문서 제목\n\n본문' }),
  ).toBe('Draft')
  expect(documentTabTitle({ path: 'Papers/Paper.pdf', kind: 'pdf', content: '' })).toBe(
    'Paper.pdf',
  )
  expect(
    documentTabTitle({ path: 'Maps/Research.excalidraw', kind: 'canvas', content: '{}' }),
  ).toBe('Research')
  expect(documentTabTitle({ path: 'Broken.note.json', kind: 'note', content: '{}' })).toBe(
    'Broken',
  )
})

test('Mod+1–8 select numbered tabs and Mod+9 selects the last tab', () => {
  expect(tabIndexForShortcut(1, 5)).toBe(0)
  expect(tabIndexForShortcut(4, 5)).toBe(3)
  expect(tabIndexForShortcut(8, 8)).toBe(7)
  expect(tabIndexForShortcut(9, 5)).toBe(4)
  expect(tabIndexForShortcut(6, 5)).toBeNull()
  expect(tabIndexForShortcut(0, 5)).toBeNull()
})

test('tab shortcuts follow the rendered transcription-then-document order', () => {
  const transcriptions = ['transcription-1', 'transcription-2']
  const documents = ['Notes/One.note.json', 'Notes/Two.note.json']

  expect(workspaceTabTargetForShortcut(1, transcriptions, documents)).toEqual({
    kind: 'transcription',
    id: 'transcription-1',
  })
  expect(workspaceTabTargetForShortcut(2, transcriptions, documents)).toEqual({
    kind: 'transcription',
    id: 'transcription-2',
  })
  expect(workspaceTabTargetForShortcut(3, transcriptions, documents)).toEqual({
    kind: 'document',
    path: 'Notes/One.note.json',
  })
  expect(workspaceTabTargetForShortcut(9, transcriptions, documents)).toEqual({
    kind: 'document',
    path: 'Notes/Two.note.json',
  })
  expect(workspaceTabTargetForShortcut(1, ['transcription-1'], [])).toEqual({
    kind: 'transcription',
    id: 'transcription-1',
  })
  expect(workspaceTabTargetForShortcut(2, ['transcription-1'], [])).toBeNull()
})

test('Mod+W closes a tab until the final tab, then hides the window', () => {
  expect(modWActionForTabCount(3)).toBe('close-tab')
  expect(modWActionForTabCount(2)).toBe('close-tab')
  expect(modWActionForTabCount(1)).toBe('hide-window')
  expect(modWActionForTabCount(0)).toBe('native')
})
