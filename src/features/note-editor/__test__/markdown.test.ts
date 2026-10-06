import { expect, test } from 'bun:test'
import { Editor } from '@tiptap/react'
import { Window } from 'happy-dom'
import {
  MARKDOWN_PLACEHOLDER,
  markdownExtensions,
  markdownFromEditor,
  markdownToEditor,
} from '../model/markdown'
import { noteFilename } from '@/shared/contracts/note'

test('Markdown source editing preserves syntax, whitespace, line endings and undo', () => {
  const browser = new Window({ url: 'http://localhost' })
  const keys = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'KeyboardEvent',
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
    const source =
      '\uFEFF---\r\ncustom: [one, two]\r\n---\r\n# 제목\r\n\r\n**bold**  \r\n[[Target]]\r\n| A | B |\r\n| - | - |\r\n\r\n<div>keep</div>\r\n```js\r\nconst x = 1\r\n```\r\n'
    editor = new Editor({
      element: document.createElement('div'),
      extensions: markdownExtensions,
      content: markdownToEditor(source),
      enableInputRules: false,
      enablePasteRules: false,
    })
    expect(markdownFromEditor(editor.state.doc.textContent, source)).toBe(source)
    expect(editor.state.doc.childCount).toBe(1)
    const end = editor.state.doc.content.size - 1
    editor.commands.setTextSelection(end)
    editor.commands.keyboardShortcut('Enter')
    expect(editor.state.doc.textContent).toBe(source.replaceAll('\r\n', '\n') + '\n')
    editor.commands.keyboardShortcut('Tab')
    expect(editor.state.doc.textContent.endsWith('\n\t')).toBe(true)
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(editor.state.doc.textContent).toBe('')
    expect(editor.state.doc.childCount).toBe(1)
    const emptySource = editor.view.dom.querySelector('.markdown-source')
    expect(emptySource?.getAttribute('data-placeholder')).toBe(MARKDOWN_PLACEHOLDER)
    expect(emptySource?.classList.contains('is-empty')).toBe(true)
    editor.commands.undo()
    expect(editor.state.doc.textContent).toContain('custom: [one, two]')
    expect(editor.getHTML()).not.toContain('<h1>')
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

test('new note format defaults to JSON and honors explicit Markdown extensions', () => {
  expect(noteFilename('Folder/New')).toBe('Folder/New.note.json')
  expect(noteFilename('Folder/New', 'markdown')).toBe('Folder/New.md')
  expect(noteFilename('Existing.MD')).toBe('Existing.MD')
  expect(noteFilename('existing.json', 'markdown')).toBe('existing.json')
})
