import { expect, test } from 'bun:test'
import { Editor } from '@tiptap/react'
import { Window } from 'happy-dom'
import { noteLinks } from '@/shared/contracts/links'
import {
  editorExtensions,
  editorToNote,
  NOTE_PLACEHOLDER,
  noteToEditor,
  replaceEditorDocument,
} from '../model/tiptap'
import { EditorState } from '@tiptap/pm/state'
import {
  createBlock,
  createNote,
  noteText,
  parseNote,
  serializeNote,
} from '@/shared/contracts/note'

test('Tiptap adapter preserves rich marks, stable IDs, document metadata, and opaque extensions', () => {
  const note = createNote('Research')
  note.metadata = { graph: ['keep'] }
  note.blocks[0].annotations = [{ key: 'keep' }]
  note.blocks[0].text = '**literal text**'
  const opaque = { ...createBlock('canvas'), content: { custom: true }, children: [createBlock()] }
  note.blocks.push(opaque)
  const editorDoc = noteToEditor(note)
  editorDoc.content![0].content![0].marks = [{ type: 'bold' }]
  const next = parseNote(serializeNote(editorToNote(note, editorDoc)))
  expect(next.metadata).toEqual(note.metadata)
  expect(next.blocks[0].id).toBe(note.blocks[0].id)
  expect(next.blocks[0].annotations).toEqual(note.blocks[0].annotations)
  expect(next.blocks[1]).toEqual(opaque)
  expect(noteToEditor(next).content![0].content![0].marks).toEqual([{ type: 'bold' }])
  expect(noteText(next)).toContain('**literal text**')
})
test('unknown Tiptap nodes, marks, attributes, and nested legacy blocks are opaque', () => {
  for (const content of [
    { type: 'future-node' },
    { type: 'paragraph', future: 'keep' },
    { type: 'paragraph', attrs: { future: 'keep' } },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'text', marks: [{ type: 'future-mark' }] }],
    },
  ]) {
    const note = createNote('Future')
    note.blocks = [{ id: 'keep', type: 'tiptap', content }]
    expect(noteToEditor(note).content![0].type).toBe('nonOpaque')
    expect(editorToNote(note, noteToEditor(note)).blocks).toEqual(note.blocks)
  }
})
test('real Tiptap transactions support lists, formatting, undo, IDs, and protected blocks', () => {
  const browser = new Window({ url: 'http://localhost' })
  const keys = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ] as const
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const key of keys) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      value: key === 'window' ? browser : browser[key],
      configurable: true,
    })
  }
  let editor: Editor | undefined
  try {
    const note = createNote('Editor')
    note.blocks[0].text = 'First'
    note.blocks[0].custom = { preserve: true }
    note.blocks.push({ ...createBlock(), text: 'Second', extra: ['keep'] })
    const firstId = note.blocks[0].id
    editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: noteToEditor(note),
    })
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.toggleBold()
    expect(editor.getJSON().content![0].content![0].marks).toEqual([{ type: 'bold' }])
    editor.commands.undo()
    expect(editor.getJSON().content![0].content![0].marks).toBeUndefined()
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 })
    editor.commands.toggleBulletList()
    const saved = editorToNote(note, editor.getJSON())
    expect(saved.blocks[0].id).toBe(firstId)
    expect(saved.blocks[0].custom).toEqual({ preserve: true })
    expect(saved.blocks[0].mergedSources).toEqual([note.blocks[1]])
    expect(noteText(saved)).toContain('Second')
    editor.commands.undo()
    const restored = editorToNote(saved, editor.getJSON())
    expect(restored.blocks[1].extra).toEqual(['keep'])
    editor.commands.setTextSelection(1)
    editor.commands.insertContent({
      type: 'wikiLink',
      attrs: { target: 'id:destination', label: 'Linked note' },
    })
    const linked = editorToNote(restored, editor.getJSON())
    expect(noteLinks(linked)).toMatchObject([{ target: 'id:destination', label: 'Linked note' }])
    expect(noteText(linked)).toContain('Linked note')
    expect(noteToEditor(linked).content![0].type).toBe('paragraph')
    expect(editor.getHTML()).toContain('data-non-target="id:destination"')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertContent(' [[Destination|Shown]')
    const position = editor.state.selection.from
    editor.view.someProp('handleTextInput', (handler) =>
      handler(editor!.view, position, position, ']', () =>
        editor!.state.tr.insertText(']', position),
      ),
    )
    const typed = editorToNote(linked, editor.getJSON())
    expect(
      noteLinks(typed).some((link) => link.target === 'Destination' && link.label === 'Shown'),
    ).toBe(true)
    expect(noteText(typed)).not.toContain('[[')
    expect(noteText(typed)).toContain('Shown')
    editor.view.updateState(
      EditorState.create({
        schema: editor.schema,
        plugins: editor.state.plugins,
        doc: replaceEditorDocument(noteToEditor(typed), editor.schema),
      }),
    )
    expect(editor.state.doc.type.schema).toBe(editor.schema)
    editor.commands.setTextSelection(1)
    editor.commands.insertContent({
      type: 'wikiLink',
      attrs: { target: 'AfterReload', label: 'After reload' },
    })
    expect(
      noteLinks(editorToNote(typed, editor.getJSON())).some(
        (link) => link.target === 'AfterReload',
      ),
    ).toBe(true)
    editor.commands.setTextSelection(1)
    editor.commands.toggleList('todoList', 'todoListItem')
    const todoIds: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'todoListItem') todoIds.push(node.attrs.todoId as string)
    })
    expect(todoIds.length).toBeGreaterThan(0)
    expect(todoIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    const todoDoc = editorToNote(typed, editor.getJSON())
    expect(noteToEditor(todoDoc).content?.[0].type).toBe('todoList')
    editor.commands.setTextSelection(3)
    editor.commands.splitListItem('todoListItem')
    const splitIds: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'todoListItem') splitIds.push(node.attrs.todoId as string)
    })
    expect(splitIds.length).toBeGreaterThan(todoIds.length)
    expect(new Set(splitIds).size).toBe(splitIds.length)
    editor.destroy()
    const emptyNote = createNote('')
    editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: noteToEditor(emptyNote),
    })
    const emptyParagraph = editor.view.dom.querySelector('p')
    expect(emptyParagraph?.getAttribute('data-placeholder')).toBe(NOTE_PLACEHOLDER)
    expect(emptyParagraph?.classList.contains('is-empty')).toBe(true)
    editor.destroy()
    const protectedNote = createNote('Protected')
    protectedNote.blocks.push({ ...createBlock('future'), content: { data: 'keep' } })
    editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: noteToEditor(protectedNote),
    })
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(editor.getJSON().content?.some((node) => node.type === 'nonOpaque')).toBe(true)
  } finally {
    editor?.destroy()
    for (const key of keys) {
      const descriptor = previous.get(key)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    void browser.happyDOM.close()
  }
})
