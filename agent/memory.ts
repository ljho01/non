import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { atomicWrite, readText, safePath } from './vault'
import { globalScope, type Memory, type MemoryScope } from '../src/shared/contracts/memory'
export { scopeSchema, memoryKey, type MemoryScope } from '../src/shared/contracts/memory'

export async function folderLineage(root: string, folder: string): Promise<string[]> {
  if (!folder) return ['']
  const target = await safePath(root, folder)
  if (!(await stat(target)).isDirectory()) throw new Error('Memory scope must be a folder')
  const parts = folder.split('/')
  return ['', ...parts.map((_, index) => parts.slice(0, index + 1).join('/'))]
}
async function location(dataDir: string, root: string | null | undefined, scope: MemoryScope) {
  if (scope.kind === 'global')
    return { base: dataDir, directory: 'memory/global', trash: 'memory/trash' }
  if (!root) throw new Error('폴더 기억을 사용하려면 먼저 폴더를 추가해 주세요.')
  await folderLineage(root, scope.path)
  const prefix = scope.path ? `${scope.path}/` : ''
  return { base: root, directory: `${prefix}.non/memory`, trash: `${prefix}.non/trash` }
}
export async function scopedMemories(
  dataDir: string,
  root: string | null | undefined,
  scope: MemoryScope,
): Promise<Memory[]> {
  const { base, directory } = await location(dataDir, root, scope)
  const files = await readdir(await safePath(base, directory)).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return []
    throw e
  })
  return Promise.all(
    files
      .filter((file) => /^[\w-]+\.md$/.test(file))
      .map(async (file) => ({
        id: file.slice(0, -3),
        scope,
        content: await readText(base, `${directory}/${file}`),
        updated: (await stat(await safePath(base, `${directory}/${file}`))).mtimeMs,
      })),
  )
}
export async function inheritedMemories(
  dataDir: string,
  root: string | null | undefined,
  folder = '',
) {
  const items = await scopedMemories(dataDir, root, globalScope)
  if (root) {
    for (const path of await folderLineage(root, folder))
      items.push(...(await scopedMemories(dataDir, root, { kind: 'folder', path })))
  }
  return items
}
export async function saveMemory(
  dataDir: string,
  root: string | null | undefined,
  item: { id?: string; scope: MemoryScope; content: string; original?: string },
) {
  const { base, directory } = await location(dataDir, root, item.scope)
  const id = item.id ?? randomUUID()
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid memory ID')
  const file = `${directory}/${id}.md`
  if (item.id) {
    const current = await readText(base, file)
    if (current !== item.original)
      throw new Error('기억이 외부에서 변경되었습니다. 새로고침 후 편집해 주세요.')
    await atomicWrite(base, file, item.content)
  } else {
    await mkdir(await safePath(base, directory), { recursive: true })
    await writeFile(await safePath(base, file), item.content, { flag: 'wx', mode: 0o600 })
  }
  return { id, scope: item.scope }
}
export async function trashMemory(
  dataDir: string,
  root: string | null | undefined,
  id: string,
  scope: MemoryScope,
  original: string,
) {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid memory ID')
  const { base, directory, trash } = await location(dataDir, root, scope)
  const source = await safePath(base, `${directory}/${id}.md`)
  if ((await readText(base, `${directory}/${id}.md`)) !== original)
    throw new Error('기억이 외부에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.')
  await mkdir(await safePath(base, trash), { recursive: true })
  await rename(source, await safePath(base, `${trash}/${id}-${randomUUID()}.md`))
}
export function rankMemories(items: Memory[], query: string, limit = 8) {
  const words = [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 1),
    ),
  ]
  const scored = items
    .map((item, index) => ({
      item,
      index,
      score: words.reduce(
        (sum, w) => sum + (item.content.toLocaleLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || b.item.updated - a.item.updated)
  // Reserve one representative per scope so a busy child cannot crowd out global/ancestor context.
  const representatives = new Map<string, (typeof scored)[number]>()
  for (const entry of scored) {
    const key = entry.item.scope.kind === 'global' ? 'global' : `folder:${entry.item.scope.path}`
    if (!representatives.has(key)) representatives.set(key, entry)
  }
  const chosen = [...representatives.values()].sort((a, b) => a.index - b.index).slice(0, limit)
  for (const entry of scored) {
    if (chosen.length >= limit) break
    if (!chosen.includes(entry)) chosen.push(entry)
  }
  return chosen.sort((a, b) => a.index - b.index).map((entry) => entry.item)
}
