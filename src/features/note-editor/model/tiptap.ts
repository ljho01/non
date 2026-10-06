import { Extension, Node, getSchema, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import { ChecklistItem } from './checklist'
import Placeholder from '@tiptap/extension-placeholder'
import { Plugin } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import type { Note, NoteBlock } from '@/shared/contracts/note'
import { WikiLink } from './wiki-link'
import { TodoList, TodoListItem } from './todo'
import { preserveInputRuleUndo } from './list-input-rules'

export const NOTE_PLACEHOLDER = "내용을 입력하거나 '/'로 명령을 여세요"

const blockNodes = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'todoList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
]
const Identity = Extension.create({
  name: 'nonIdentity',
  addGlobalAttributes: () => [
    {
      types: blockNodes,
      attributes: { nonId: { default: null, rendered: false, parseHTML: () => null } },
    },
  ],
  addProseMirrorPlugins: () => [
    new Plugin({
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some((transaction) => transaction.docChanged)) return null
        const seen = new Set<string>()
        const tr = state.tr
        state.doc.forEach((node, position) => {
          if (node.type.name === 'nonOpaque') return
          let id = node.attrs.nonId as string | null
          if (!id || seen.has(id)) {
            id = null
            node.descendants((child) => {
              if (!id && typeof child.attrs.nonId === 'string' && !seen.has(child.attrs.nonId))
                id = child.attrs.nonId
            })
            id ??= crypto.randomUUID()
            tr.setNodeMarkup(position, undefined, { ...node.attrs, nonId: id })
          }
          seen.add(id)
        })
        if (!tr.docChanged) return null
        preserveInputRuleUndo(tr, state)
        return tr
      },
    }),
  ],
})
const Opaque = Node.create({
  name: 'nonOpaque',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({
    nonId: { default: null, rendered: false },
    label: { default: '확장 블록', rendered: false },
  }),
  parseHTML: () => [],
  renderHTML: ({ node }) => [
    'div',
    {
      class:
        'tiptap-opaque my-4 rounded-lg border border-dashed border-border px-4.5 py-4.5 text-xs text-muted-foreground select-none',
      contenteditable: 'false',
    },
    `${String(node.attrs.label)} · 원본 보존 (읽기 전용)`,
  ],
  addProseMirrorPlugins: () => [
    new Plugin({
      filterTransaction: (tr, state) => {
        if (!tr.docChanged || tr.getMeta('nonExternal')) return true
        const protectedIds = new Set<string>()
        state.doc.forEach((node) => {
          if (node.type.name === 'nonOpaque') protectedIds.add(node.attrs.nonId)
        })
        tr.doc.forEach((node) => {
          if (node.type.name === 'nonOpaque') protectedIds.delete(node.attrs.nonId)
        })
        return protectedIds.size === 0
      },
    }),
  ],
})
export const editorExtensions = [
  StarterKit.configure({ link: false, underline: false, trailingNode: false }),
  TaskList,
  TodoList,
  TodoListItem,
  ChecklistItem,
  Placeholder.configure({ placeholder: NOTE_PLACEHOLDER }),
  Identity,
  Opaque,
  WikiLink,
]
const schema = getSchema(editorExtensions)
const inlineText = (text = ''): JSONContent[] =>
  text
    .split('\n')
    .flatMap((line, index) => [
      ...(index ? [{ type: 'hardBreak' }] : []),
      ...(line ? [{ type: 'text', text: line }] : []),
    ])
function editableNode(block: NoteBlock): JSONContent | null {
  if (block.children?.length) return null
  if (block.type === 'tiptap') {
    try {
      const raw = block.content as JSONContent
      const validate = (node: JSONContent, depth = 0) => {
        if (
          depth > 64 ||
          !node ||
          typeof node.type !== 'string' ||
          node.type === 'nonOpaque' ||
          !schema.nodes[node.type]
        )
          throw new Error('Unsupported node')
        if (
          Object.keys(node).some(
            (key) => !['type', 'attrs', 'content', 'marks', 'text'].includes(key),
          )
        )
          throw new Error('Unknown node extension')
        const spec = schema.nodes[node.type].spec.attrs ?? {}
        if (Object.keys(node.attrs ?? {}).some((key) => key === 'nonId' || !(key in spec)))
          throw new Error('Unknown attributes')
        for (const mark of node.marks ?? []) {
          const markSpec = schema.marks[mark.type]
          if (
            !markSpec ||
            Object.keys(mark).some((key) => key !== 'type' && key !== 'attrs') ||
            Object.keys(mark.attrs ?? {}).some((key) => !(key in (markSpec.spec.attrs ?? {})))
          )
            throw new Error('Unknown mark')
        }
        node.content?.forEach((child) => validate(child, depth + 1))
      }
      validate(raw)
      const parsed = schema.nodeFromJSON(raw)
      parsed.check()
      if (!blockNodes.includes(parsed.type.name)) return null
      return raw
    } catch {
      return null
    }
  }
  if ('content' in block) return null
  const content = inlineText(block.text)
  switch (block.type) {
    case 'paragraph':
      return { type: 'paragraph', content }
    case 'heading':
      return { type: 'heading', attrs: { level: Number(block.props?.level) || 2 }, content }
    case 'list-item':
      return {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content }] }],
      }
    case 'task':
      return {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: block.props?.checked === true },
            content: [{ type: 'paragraph', content }],
          },
        ],
      }
    case 'quote':
      return { type: 'blockquote', content: [{ type: 'paragraph', content }] }
    case 'code':
      return { type: 'codeBlock', attrs: {language: block.props?.language ?? null}, content: block.text ? [{ type: 'text', text: block.text }] : [] }
    case 'divider':
      return { type: 'horizontalRule' }
    default:
      return null
  }
}
export function noteToEditor(note: Note): JSONContent {
  return {
    type: 'doc',
    content: note.blocks.length
      ? note.blocks.map((block) => {
          const node = editableNode(block)
          return node
            ? { ...node, attrs: { ...node.attrs, nonId: block.id } }
            : { type: 'nonOpaque', attrs: { nonId: block.id, label: block.type } }
        })
      : [{ type: 'paragraph', attrs: { nonId: crypto.randomUUID() } }],
  }
}
function cleanNode(node: JSONContent): JSONContent {
  const { nonId: _id, ...attrs } = node.attrs ?? {}
  return {
    ...node,
    ...(node.attrs ? { attrs } : {}),
    ...(node.content ? { content: node.content.map(cleanNode) } : {}),
  }
}
function textContent(node: JSONContent): string {
  if (node.type === 'wikiLink') return node.attrs?.label || node.attrs?.target || ''
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  const text = (node.content ?? [])
    .map(textContent)
    .join(['paragraph', 'heading', 'codeBlock'].includes(node.type ?? '') ? '' : '\n')
  return ['taskItem', 'todoListItem'].includes(node.type ?? '')
    ? `${node.attrs?.checked ? '[x]' : '[ ]'} ${text}`
    : text
}
export function editorToNote(note: Note, doc: JSONContent): Note {
  const originals = new Map(note.blocks.map((block) => [block.id, block]))
  const rememberSources = (block: NoteBlock, depth = 0) => {
    if (depth > 64 || !Array.isArray(block.mergedSources)) return
    for (const source of block.mergedSources) {
      if (
        !source ||
        typeof source !== 'object' ||
        typeof source.id !== 'string' ||
        typeof source.type !== 'string'
      )
        continue
      if (!originals.has(source.id)) originals.set(source.id, source as NoteBlock)
      rememberSources(source as NoteBlock, depth + 1)
    }
  }
  note.blocks.forEach((block) => rememberSources(block))
  const seen = new Set<string>()
  const blocks = (doc.content ?? []).map((node) => {
    const rawId = typeof node.attrs?.nonId === 'string' ? node.attrs.nonId : ''
    const original = originals.get(rawId)
    const id = rawId && !seen.has(rawId) ? rawId : crypto.randomUUID()
    seen.add(id)
    if (node.type === 'nonOpaque') {
      if (!original) throw new Error('확장 블록 원본을 찾을 수 없습니다.')
      return original
    }
    const mergedSources = new Map<string, NoteBlock>()
    const collect = (value: JSONContent) => {
      const source = originals.get(value.attrs?.nonId as string)
      if (source && source.id !== rawId) mergedSources.set(source.id, source)
      value.content?.forEach(collect)
    }
    collect(node)
    return {
      ...original,
      id,
      type: 'tiptap',
      text: textContent(node),
      content: cleanNode(node),
      ...(mergedSources.size
        ? {
            mergedSources: [
              ...(Array.isArray(original?.mergedSources) ? original.mergedSources : []),
              ...mergedSources.values(),
            ],
          }
        : {}),
    }
  })
  return { ...note, blocks, updatedAt: new Date().toISOString() }
}
export function replaceEditorDocument(doc: JSONContent, editorSchema: Schema): ProseMirrorNode {
  // Node type identity belongs to the live editor; a separately built schema cannot be mixed in.
  return editorSchema.nodeFromJSON(doc)
}
