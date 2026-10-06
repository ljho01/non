import { isMap } from 'yaml'
import { baseText, BaseLink } from './base-values'
import { parseNote, serializeNote } from './note'
import { yamlDocument } from './base'

export type Properties = Record<string, unknown>
export function propertyObject(value: unknown): Properties {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Properties)
    : {}
}
function frontmatter(source: string) {
  const opening = /^(\uFEFF?---[ \t]*\r?\n)/.exec(source)
  if (!opening) return null
  const start = opening[0].length
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(source.slice(start))
  if (!closing) throw new Error('YAML 속성의 닫는 구분자가 없습니다.')
  const end = start + closing.index
  return { start, end, body: source.slice(end + closing[0].length), closing: closing[0] }
}
export function readProperties(path: string, source: string): Properties {
  if (path.toLowerCase().endsWith('.json'))
    return propertyObject(parseNote(source).metadata?.properties)
  if (!path.toLowerCase().endsWith('.md')) return {}
  const parts = frontmatter(source)
  if (!parts) return {}
  const doc = yamlDocument(source.slice(parts.start, parts.end))
  if (doc.contents && !isMap(doc.contents))
    throw new Error('YAML 속성은 키와 값의 목록이어야 합니다.')
  return propertyObject(doc.toJS({ maxAliasCount: 30 }) as unknown)
}
export function writeProperty(path: string, source: string, name: string, value: unknown): string {
  value = propertySourceValue(value)
  if (!name.trim() || ['__proto__', 'constructor', 'prototype'].includes(name))
    throw new Error('잘못된 속성 이름입니다.')
  if (path.toLowerCase().endsWith('.json')) {
    const note = parseNote(source)
    const properties = { ...propertyObject(note.metadata?.properties) }
    if (value === undefined) delete properties[name]
    else properties[name] = value
    return serializeNote({
      ...note,
      metadata: { ...note.metadata, properties },
      updatedAt: new Date().toISOString(),
    })
  }
  if (!path.toLowerCase().endsWith('.md')) throw new Error('이 파일의 속성은 읽기 전용입니다.')
  const parts = frontmatter(source)
  // Only frontmatter is serialized; Markdown body bytes never pass through an editor.
  readProperties(path, source)
  const doc = yamlDocument(parts ? source.slice(parts.start, parts.end) : '')
  if (value === undefined) doc.delete(name)
  else doc.set(name, value)
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const yaml = doc.toString().replace(/\r?\n/g, eol)
  return parts
    ? source.slice(0, parts.start) + yaml + parts.closing + parts.body
    : `${source.startsWith('\uFEFF') ? '\uFEFF' : ''}---${eol}${yaml}---${eol}${source.replace(/^\uFEFF/, '')}`
}
export function propertyText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  const special = baseText(value)
  if (special !== undefined) return special
  if (Array.isArray(value)) return value.map(propertyText).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function propertySourceValue(value: unknown): unknown {
  if (value instanceof BaseLink)
    return `[[${value.path}${value.display === undefined ? '' : `|${propertyText(value.display)}`}]]`
  if (Array.isArray(value)) return value.map(propertySourceValue)
  return value
}
