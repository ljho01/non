import type { ReactNode } from 'react'
export type BaseEmbedSpec = {
  target?: string
  source?: string
  start?: number
  end?: number
  blockId?: string
}
export type RenderBaseEmbed = (spec: BaseEmbedSpec) => ReactNode
/** Match fenced bases and stand-alone wiki embeds, excluding ordinary fenced code. */
export function baseEmbeds(source: string): BaseEmbedSpec[] {
  const results: BaseEmbedSpec[] = []
  const lines = source.match(/.*(?:\r?\n|$)/g) ?? []
  let offset = 0,
    fence: { char: string; size: number; start: number; body: number; base: boolean } | null = null
  for (const line of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line)
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence.char &&
        marker[1].length >= fence.size &&
        !marker[2].trim()
      ) {
        if (fence.base)
          results.push({
            source: source.slice(fence.body, offset),
            start: fence.start,
            end: offset + line.length,
          })
        fence = null
      }
    } else if (marker)
      fence = {
        char: marker[1][0],
        size: marker[1].length,
        start: offset,
        body: offset + line.length,
        base: marker[2].trim() === 'base',
      }
    else {
      const link = /^\s*!\[\[([^\]]+\.base(?:#[^\]|]+)?)(?:\|[^\]]*)?\]\]\s*$/.exec(line)
      if (link) results.push({ target: link[1], start: offset, end: offset + line.length })
    }
    offset += line.length
  }
  return results
}
