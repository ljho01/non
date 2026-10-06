import { expect, test } from 'bun:test'
import { Editor, type JSONContent } from '@tiptap/react'
import { Window } from 'happy-dom'
import { editorExtensions, editorToNote, noteToEditor } from '../model/tiptap'
import { createNote } from '@/shared/contracts/note'
import { noteTodos } from '@/shared/contracts/todo'

function withEditor(run: (editor: Editor) => void) {
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
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: noteToEditor(createNote('Input rules')),
  })
  try {
    run(editor)
  } finally {
    editor.destroy()
    for (const key of keys) {
      const descriptor = previous.get(key)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    void browser.happyDOM.close()
  }
}
function type(editor: Editor, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, character, () =>
        editor.state.tr.insertText(character, from, to),
      ),
    )
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(character, from, to))
  }
}
test('parentheses create stable collected Todos and brackets create only local checklist items', () => {
  for (const [prefix, list, item, checked] of [
    ['() ', 'todoList', 'todoListItem', false],
    ['( ) ', 'todoList', 'todoListItem', false],
    ['(x) ', 'todoList', 'todoListItem', true],
    ['(X) ', 'todoList', 'todoListItem', true],
    ['[] ', 'taskList', 'taskItem', false],
    ['[ ] ', 'taskList', 'taskItem', false],
    ['[x] ', 'taskList', 'taskItem', true],
    ['[X] ', 'taskList', 'taskItem', true],
  ] as const)
    withEditor((editor) => {
      type(editor, prefix)
      const first = editor.getJSON().content?.[0]
      expect(first?.type).toBe(list)
      expect(first?.content?.[0].type).toBe(item)
      expect((first?.content?.[0] as JSONContent | undefined)?.attrs?.checked).toBe(checked)
      type(editor, 'Keep this text')
      const saved = editorToNote(createNote('Input rules'), editor.getJSON())
      expect(noteToEditor(saved).content?.[0].type).toBe(list)
      const todos = noteTodos(saved)
      if (item === 'todoListItem') {
        expect(todos).toMatchObject([{ checked, text: 'Keep this text' }])
        expect(todos[0].id.length).toBeGreaterThan(0)
      } else expect(todos).toEqual([])
    })
})
test('inline, incomplete and code syntax stays literal', () => {
  for (const value of ['ordinary () ', 'ordinary [] ', '()', '[]', '(y) ', '[y] '])
    withEditor((editor) => {
      type(editor, value)
      expect(editor.getJSON().content?.[0].type).toBe('paragraph')
      expect(editor.getText()).toBe(value)
    })
  withEditor((editor) => {
    editor.commands.setCodeBlock()
    type(editor, '() [] ')
    expect(editor.getJSON().content?.[0].type).toBe('codeBlock')
    expect(editor.getText()).toBe('() [] ')
  })
})
test('Backspace can undo the automatic list conversion without losing the shortcut', () => {
  for (const shortcut of ['() ', '[] '])
    withEditor((editor) => {
      type(editor, shortcut)
      expect(editor.commands.undoInputRule()).toBe(true)
      expect(editor.getJSON().content?.[0].type).toBe('paragraph')
      expect(editor.getText()).toBe(shortcut)
    })
})
