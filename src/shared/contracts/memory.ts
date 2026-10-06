import { z } from 'zod'
export const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global') }),
  z.object({ kind: z.literal('folder'), path: z.string() }),
])
export type MemoryScope = z.infer<typeof scopeSchema>
export type Memory = { id: string; scope: MemoryScope; content: string; updated: number }
export const globalScope: MemoryScope = { kind: 'global' }
export function memoryKey(memory: Pick<Memory, 'id' | 'scope'>) {
  return `${memory.scope.kind === 'global' ? 'global' : `folder:${memory.scope.path}`}:${memory.id}`
}
export function scopeLabel(scope: MemoryScope) {
  return scope.kind === 'global' ? '전역' : scope.path || '폴더 루트'
}
export function scopeFolders(folder: string) {
  return [
    '',
    ...(folder ? folder.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')) : []),
  ]
}
