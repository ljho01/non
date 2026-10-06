import type { Note, NoteBlock } from './note'
export type IndexedDocument = {
  path: string
  id: string | null
  title: string
  kind: 'note' | 'legacy' | 'pdf'
  aliases: string[]
  modified: number
  text: string
}
export type NoteLink = { target: string; label: string; context: string }
export type LinkResolution = {
  status: 'resolved' | 'missing' | 'ambiguous'
  path: string | null
  candidates: string[]
}
export type IndexedLink = NoteLink & LinkResolution & { source: string; sourceTitle: string }
export type IndexSnapshot = {
  documents: number
  links: number
  updated: number
  warnings: string[]
  backlinks: IndexedLink[]
  outgoing: IndexedLink[]
}
export type SearchHit = Pick<IndexedDocument, 'id' | 'path' | 'title' | 'kind'> & {
  snippet: string
}
export function parseWikiTarget(value: string) {
  const separator = value.indexOf('|')
  const target = (separator < 0 ? value : value.slice(0, separator)).trim()
  return { target, label: separator < 0 ? target : value.slice(separator + 1).trim() || target }
}
export function wikiLinks(text: string): NoteLink[] {
  return [...text.matchAll(/(?<!\\)\[\[([^\[\]\n]{1,1000})\]\]/g)].map((match) => ({
    ...parseWikiTarget(match[1]),
    context: text
      .slice(Math.max(0, match.index! - 60), match.index! + match[0].length + 100)
      .trim(),
  }))
}
export function noteLinks(note: Note): NoteLink[] {
  const result: NoteLink[] = []
  const walkRich = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 64) return
    const node = value as {
      type?: string
      text?: string
      attrs?: { target?: string; label?: string }
      marks?: { type: string }[]
      content?: unknown[]
    }
    if (node.type === 'codeBlock' || node.marks?.some((mark) => mark.type === 'code')) return
    if (node.type === 'wikiLink' && typeof node.attrs?.target === 'string')
      result.push({
        target: node.attrs.target,
        label: node.attrs.label || node.attrs.target,
        context: node.attrs.label || node.attrs.target,
      })
    // Join adjacent inline text runs so bold/italic boundaries don't split a wikilink.
    if (['paragraph', 'heading'].includes(node.type ?? '') && Array.isArray(node.content)) {
      let run = ''
      const flush = () => {
        result.push(...wikiLinks(run))
        run = ''
      }
      for (const child of node.content) {
        const item = child as typeof node
        if (item.type === 'text' && !item.marks?.some((mark) => mark.type === 'code'))
          run += item.text ?? ''
        else {
          flush()
          walkRich(child, depth + 1)
        }
      }
      flush()
    } else if (Array.isArray(node.content))
      node.content.forEach((child) => walkRich(child, depth + 1))
  }
  const walk = (blocks: NoteBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'tiptap') walkRich(block.content)
      else if (['paragraph', 'heading', 'list-item', 'task', 'quote'].includes(block.type))
        result.push(...wikiLinks(block.text ?? ''))
      if (block.children) walk(block.children)
    }
  }
  walk(note.blocks)
  return result
}
const key = (value: string) => value.normalize('NFC').toLocaleLowerCase()
const withoutExtension = (value: string) => value.replace(/(?:\.note)?\.json$|\.md$/i, '')
function normalizedPath(value: string): string | null {
  const parts: string[] = []
  for (const part of value.replaceAll('\\', '/').split('/')) {
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
    } else if (part && part !== '.') {
      if (part.startsWith('.')) return null
      parts.push(part)
    }
  }
  return parts.join('/')
}
export function resolveNoteLink(
  documents: IndexedDocument[],
  source: string,
  rawTarget: string,
): LinkResolution {
  const target = rawTarget.split('#')[0].trim()
  const result = (items: IndexedDocument[]): LinkResolution => ({
    status: items.length === 1 ? 'resolved' : items.length ? 'ambiguous' : 'missing',
    path: items.length === 1 ? items[0].path : null,
    candidates: items.map((item) => item.path),
  })
  if (!target) return result(documents.filter((doc) => doc.path === source))
  if (target.startsWith('id:')) return result(documents.filter((doc) => doc.id === target.slice(3)))
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return result([])
  const parent = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) : ''
  const relative = normalizedPath(`${parent}${target}`)
  const absolute = normalizedPath(target)
  const byPath = (path: string | null) =>
    path === null
      ? []
      : documents.filter((doc) => key(withoutExtension(doc.path)) === key(withoutExtension(path)))
  const explicit = target.startsWith('./') || target.startsWith('../')
  if (explicit) return result(byPath(relative))
  const exact = byPath(absolute)
  if (exact.length) return result(exact)
  const nearby = byPath(relative)
  if (nearby.length) return result(nearby)
  if (target.includes('/') || target.includes('\\')) return result([])
  return result(
    documents.filter((doc) =>
      [doc.title, withoutExtension(doc.path.split('/').at(-1)!), ...doc.aliases].some(
        (name) => key(name) === key(withoutExtension(target)),
      ),
    ),
  )
}
