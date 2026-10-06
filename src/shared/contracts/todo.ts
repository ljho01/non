import { noteText, type Note, type NoteBlock } from './note'

type RichNode = {
  type?: string
  attrs?: Record<string, unknown>
  text?: string
  content?: unknown[]
  [key: string]: unknown
}
function richNode(value: unknown): RichNode | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RichNode)
    : null
}
export type NoteTodo = {
  id: string
  blockId: string
  text: string
  checked: boolean
  /** todoListItem nesting depth inside the document; 0 is a root item. */
  depth: number
}
export function noteTodos(note: Note): NoteTodo[] {
  const todos: NoteTodo[] = []
  const visitNode = (value: unknown, block: NoteBlock, depth = 0, todoDepth = 0) => {
    const node = richNode(value)
    if (!node || depth > 64) return
    let nextDepth = todoDepth
    if (node.type === 'todoListItem' && typeof node.attrs?.todoId === 'string') {
      // Only the item's own text; nested Todos remain separate rows.
      const text = noteText({
        ...note,
        title: '',
        blocks: [
          {
            id: block.id,
            type: 'tiptap',
            content: {
              type: 'doc',
              content: node.content?.filter((child) => richNode(child)?.type !== 'todoList'),
            },
          },
        ],
      }).trim()
      todos.push({
        id: node.attrs.todoId,
        blockId: block.id,
        text,
        checked: node.attrs.checked === true,
        depth: todoDepth,
      })
      nextDepth = todoDepth + 1
    }
    if (Array.isArray(node.content))
      node.content.forEach((child) => visitNode(child, block, depth + 1, nextDepth))
  }
  const visit = (blocks: NoteBlock[]) =>
    blocks.forEach((block) => {
      if (block.type === 'tiptap') visitNode(block.content, block)
      if (block.children) visit(block.children)
    })
  visit(note.blocks)
  return todos
}
export function setNoteTodoChecked(note: Note, id: string, checked: boolean): Note {
  let matches = 0
  const patchNode = (value: unknown, depth = 0): unknown => {
    const node = richNode(value)
    if (!node || depth > 64) return value
    const match = node.type === 'todoListItem' && node.attrs?.todoId === id
    if (match) matches += 1
    return {
      ...node,
      ...(match ? { attrs: { ...node.attrs, checked } } : {}),
      ...(Array.isArray(node.content)
        ? { content: node.content.map((child) => patchNode(child, depth + 1)) }
        : {}),
    }
  }
  const patchBlocks = (blocks: NoteBlock[]): NoteBlock[] =>
    blocks.map((block) => {
      const before = matches
      const next = {
        ...block,
        ...(block.type === 'tiptap' ? { content: patchNode(block.content) } : {}),
        ...(block.children ? { children: patchBlocks(block.children) } : {}),
      }
      if (block.type === 'tiptap' && matches > before)
        next.text = noteText({ ...note, title: '', blocks: [next] })
      return next
    })
  const blocks = patchBlocks(note.blocks)
  if (matches !== 1)
    throw new Error('할 일이 변경되었거나 삭제되었습니다. 목록을 새로 확인해 주세요.')
  return { ...note, blocks, updatedAt: new Date().toISOString() }
}
