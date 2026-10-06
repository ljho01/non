import { z } from 'zod'

export type NoteBlock = {
  id: string
  type: string
  text?: string
  props?: Record<string, unknown>
  children?: NoteBlock[]
  [extension: string]: unknown
}

const blockSchema: z.ZodType<NoteBlock> = z.lazy(() =>
  z.looseObject({
    id: z.string().min(1),
    type: z.string().min(1),
    text: z.string().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(blockSchema).optional(),
  }),
)

export const noteSchema = z.looseObject({
  format: z.literal('non.note'),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  blocks: z.array(blockSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Note = z.infer<typeof noteSchema>
export const noteCoverIds = ['fog', 'sea', 'moss', 'dusk', 'clay', 'ink'] as const
export type NoteCoverId = (typeof noteCoverIds)[number]

export function noteCover(note: Note): NoteCoverId | null {
  const value = note.metadata?.cover
  return noteCoverIds.some((cover) => cover === value) ? (value as NoteCoverId) : null
}

export const blockTypes = [
  'paragraph',
  'heading',
  'list-item',
  'task',
  'quote',
  'code',
  'divider',
] as const

export function createBlock(type = 'paragraph'): NoteBlock {
  return {
    id: crypto.randomUUID(),
    type,
    text: '',
    props: type === 'heading' ? { level: 2 } : type === 'task' ? { checked: false } : {},
  }
}
export function createNote(title: string): Note {
  const now = new Date().toISOString()
  return {
    format: 'non.note',
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    blocks: [createBlock()],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  }
}
export function parseNote(content: string): Note {
  const value: unknown = JSON.parse(content)
  if (
    value &&
    typeof value === 'object' &&
    'format' in value &&
    value.format === 'non.note' &&
    'schemaVersion' in value &&
    value.schemaVersion !== 1
  ) {
    throw new Error(
      `지원하지 않는 노트 버전입니다: ${String(value.schemaVersion)}. 원본은 변경하지 않았습니다.`,
    )
  }
  const note = noteSchema.parse(value)
  const ids = new Set<string>()
  const visit = (blocks: NoteBlock[], depth: number) => {
    if (depth > 64) throw new Error('노트 블록 계층이 너무 깊습니다.')
    for (const block of blocks) {
      if (ids.has(block.id)) throw new Error(`중복된 블록 ID: ${block.id}`)
      ids.add(block.id)
      if (block.children) visit(block.children, depth + 1)
    }
  }
  visit(note.blocks, 0)
  return note
}
export function serializeNote(note: Note) {
  return `${JSON.stringify(note, null, 2)}\n`
}
export function noteText(note: Note) {
  const richText = (value: unknown, depth = 0): string => {
    if (!value || typeof value !== 'object' || depth > 64) return ''
    const node = value as {
      type?: string
      text?: string
      content?: unknown[]
      attrs?: { checked?: boolean; label?: string; target?: string }
    }
    if (node.type === 'text') return typeof node.text === 'string' ? node.text : ''
    if (node.type === 'wikiLink') return node.attrs?.label || node.attrs?.target || ''
    if (node.type === 'hardBreak') return '\n'
    const text = Array.isArray(node.content)
      ? node.content
          .map((child) => richText(child, depth + 1))
          .join(['paragraph', 'heading', 'codeBlock'].includes(node.type ?? '') ? '' : '\n')
      : ''
    return ['taskItem', 'todoListItem'].includes(node.type ?? '')
      ? `${node.attrs?.checked ? '[x]' : '[ ]'} ${text}`
      : text
  }
  const visit = (blocks: NoteBlock[]): string[] =>
    blocks.flatMap((block) => [
      block.type === 'tiptap'
        ? richText(block.content)
        : block.type === 'task'
          ? `${block.props?.checked ? '[x]' : '[ ]'} ${block.text ?? ''}`
          : (block.text ?? ''),
      ...visit(block.children ?? []),
    ])
  return [note.title, ...visit(note.blocks)].filter(Boolean).join('\n\n')
}
export function updateBlock(note: Note, id: string, patch: Partial<NoteBlock>): Note {
  const visit = (blocks: NoteBlock[]): NoteBlock[] =>
    blocks.map((block) => ({
      ...block,
      ...(block.id === id ? patch : {}),
      ...(block.children ? { children: visit(block.children) } : {}),
    }))
  return { ...note, updatedAt: new Date().toISOString(), blocks: visit(note.blocks) }
}
export function removeBlock(note: Note, id: string): Note {
  const visit = (blocks: NoteBlock[]): NoteBlock[] =>
    blocks
      .filter((block) => block.id !== id)
      .map((block) => ({
        ...block,
        ...(block.children ? { children: visit(block.children) } : {}),
      }))
  return { ...note, updatedAt: new Date().toISOString(), blocks: visit(note.blocks) }
}
export function duplicateNote(note: Note): Note {
  const visit = (blocks: NoteBlock[]): NoteBlock[] =>
    blocks.map((block) => ({
      ...block,
      id: crypto.randomUUID(),
      ...(block.children ? { children: visit(block.children) } : {}),
    }))
  return {
    ...note,
    id: crypto.randomUUID(),
    blocks: visit(note.blocks),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
export function noteFilename(title: string, format: 'json' | 'markdown' = 'json') {
  return /\.(json|md)$/i.test(title)
    ? title
    : `${title}${format === 'markdown' ? '.md' : '.note.json'}`
}
export function displayFilename(path: string) {
  return (path.split('/').at(-1) ?? path).replace(/(?:\.note)?\.json$|\.md$|\.excalidraw$|\.base$/i, '')
}
export function parentFolder(path: string) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}
