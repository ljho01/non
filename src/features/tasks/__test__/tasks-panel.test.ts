import { expect, spyOn, test } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Window } from 'happy-dom'
import { useVault } from '@/entities/vault'
import { desktop } from '@/shared/api/desktop'
import { createNote, parseNote, serializeNote } from '@/shared/contracts/note'
import { noteTodos } from '@/shared/contracts/todo'
import { TasksPanel } from '../ui/tasks-panel'

function todo(id: string, text: string) {
  return {
    type: 'todoListItem',
    attrs: { todoId: id, checked: false },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}
test('Tasks saves closed documents with revisions, retains newly edited Todos after close, and reports conflicts', async () => {
  const browser = new Window({ url: 'http://localhost' })
  const values: Record<string, unknown> = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    Node: browser.Node,
    localStorage: browser.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { value, configurable: true })
  }
  const initialState = useVault.getState()
  const note = createNote('Document')
  note.blocks = [
    {
      id: 'list',
      type: 'tiptap',
      content: { type: 'todoList', content: [todo('alpha', 'Alpha')] },
    },
  ]
  let content = serializeNote(note)
  let revision = '1'
  let conflict = false
  const entry = {
    path: 'tasks.note.json',
    name: 'tasks.note.json',
    kind: 'note' as const,
    size: content.length,
    modified: 1,
  }
  const read = spyOn(desktop, 'read').mockImplementation(async () => {
    const result = { content, revision }
    if (conflict) revision = 'external-change'
    return result
  })
  const save = spyOn(desktop, 'save').mockImplementation(async (_path, next, expected) => {
    if (expected !== revision) throw new Error('CONFLICT: external change')
    content = next
    revision = `${revision}+`
    return revision
  })
  const list = spyOn(desktop, 'list').mockImplementation(async () => [
    { ...entry, size: content.length, modified: revision.length },
  ])
  useVault.setState({ path: '/notes', entries: [entry], tabs: [], active: null, loading: false })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const reactRoot = createRoot(container)
  try {
    await act(async () => {
      reactRoot.render(createElement(TasksPanel, { onOpen: () => {} }))
    })
    expect(container.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe('false')
    await act(async () => {
      ;(container.querySelector('[role="checkbox"]') as HTMLButtonElement).click()
    })
    expect(noteTodos(parseNote(content))[0].checked).toBe(true)
    expect(save.mock.calls[0][2]).toBe('1')
    await act(async () => {
      await useVault.getState().openFile(entry.path)
    })
    const current = parseNote(content)
    current.blocks.push({
      id: 'second',
      type: 'tiptap',
      content: { type: 'todoList', content: [todo('beta', 'New beta')] },
    })
    await act(async () => {
      useVault.getState().edit(entry.path, serializeNote(current))
    })
    expect(container.textContent).toContain('New beta')
    await act(async () => {
      await useVault.getState().close(entry.path)
    })
    expect(useVault.getState().tabs).toHaveLength(0)
    expect(container.textContent).toContain('New beta')
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(2)
    conflict = true
    const original = content
    await act(async () => {
      ;(container.querySelector('[aria-label="New beta"]') as HTMLButtonElement).click()
    })
    expect(content).toBe(original)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('CONFLICT')
  } finally {
    await act(async () => {
      reactRoot.unmount()
    })
    useVault.setState(initialState)
    read.mockRestore()
    save.mockRestore()
    list.mockRestore()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    await browser.happyDOM.close()
  }
})
