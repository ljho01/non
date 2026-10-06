import type { SearchHit } from '@/shared/contracts/links'

export type WikiLinkQuery = {
  from: number
  to: number
  query: string
}

export function matchWikiLinkQuery(
  textBeforeCursor: string,
  cursor: number,
): WikiLinkQuery | null {
  const opening = textBeforeCursor.lastIndexOf('[[')
  if (opening < 0) return null

  const query = textBeforeCursor.slice(opening + 2)
  if (query.length > 200 || /[\[\]\n]/u.test(query)) return null

  let escapingBackslashes = 0
  for (let index = opening - 1; index >= 0 && textBeforeCursor[index] === '\\'; index -= 1)
    escapingBackslashes += 1
  if (escapingBackslashes % 2 === 1 || textBeforeCursor[opening - 1] === '[') return null

  return {
    from: cursor - query.length - 2,
    to: cursor,
    query,
  }
}

export function wikiLinkTarget(hit: SearchHit) {
  return hit.id ? `id:${hit.id}` : hit.path
}

export function markdownWikiLink(hit: SearchHit) {
  const target = wikiLinkTarget(hit)
  return target === hit.title ? `[[${target}]]` : `[[${target}|${hit.title}]]`
}
