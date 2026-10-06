import { expect, test } from 'bun:test'
import { createNote, noteText } from '@/shared/contracts/note'
import { noteTodos, setNoteTodoChecked } from '@/shared/contracts/todo'

function fixture() {
  const note = createNote('Tasks')
  note.metadata = { future: { preserve: true } }
  note.blocks = [
    {
      id: 'list',
      type: 'tiptap',
      extension: ['keep'],
      content: {
        type: 'todoList',
        content: [
          {
            type: 'todoListItem',
            attrs: { todoId: 'first', checked: false },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Parent', marks: [{ type: 'bold' }] }],
              },
              {
                type: 'todoList',
                content: [
                  {
                    type: 'todoListItem',
                    attrs: { todoId: 'nested', checked: true },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    { id: 'checklist', type: 'task', text: 'Local checkbox', props: { checked: false } },
    { id: 'future', type: 'custom', data: { keep: true } },
  ]
  return note
}
test('Todo aggregation excludes checklists, separates nested items', () => {
  const note = fixture()
  expect(noteTodos(note)).toEqual([
    { id: 'first', blockId: 'list', text: 'Parent', checked: false, depth: 0 },
    { id: 'nested', blockId: 'list', text: 'Child', checked: true, depth: 1 },
  ])
})
test('checking and unchecking preserves unrelated content and unknown fields', () => {
  const original = fixture()
  const checked = setNoteTodoChecked(original, 'first', true)
  expect(noteTodos(checked).every((todo) => todo.checked)).toBe(true)
  expect(noteText(checked)).toContain('[x] Parent')
  expect(checked.metadata).toEqual(original.metadata)
  expect(checked.blocks[0].extension).toEqual(['keep'])
  expect(checked.blocks.slice(1)).toEqual(original.blocks.slice(1))
  expect(noteTodos(setNoteTodoChecked(checked, 'first', false))[0].checked).toBe(false)
  expect(noteTodos(original)[0].checked).toBe(false)
  expect(() => setNoteTodoChecked(original, 'missing', true)).toThrow()
})
test('ambiguous Todo identifiers are rejected instead of updating multiple items', () => {
  const note = fixture()
  note.blocks.push({ ...note.blocks[0], id: 'duplicate' })
  expect(() => setNoteTodoChecked(note, 'first', true)).toThrow()
})
