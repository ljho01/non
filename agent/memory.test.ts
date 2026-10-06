import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { folderLineage, inheritedMemories, rankMemories, saveMemory, trashMemory } from './memory'
import { memoryKey, type MemoryScope } from '../src/shared/contracts/memory'

test('global memories span libraries; folder inheritance excludes siblings and descendants', async () => {
  const data = await mkdtemp(join(tmpdir(), 'non-global-test-'))
  const root = await mkdtemp(join(tmpdir(), 'non-hierarchy-test-'))
  const other = await mkdtemp(join(tmpdir(), 'non-other-test-'))
  await mkdir(join(root, 'Research/Child/Deep'), { recursive: true })
  await mkdir(join(root, 'Sibling'))
  const scopes: MemoryScope[] = [
    { kind: 'global' },
    ...['', 'Research', 'Research/Child', 'Research/Child/Deep', 'Sibling'].map((path) => ({
      kind: 'folder' as const,
      path,
    })),
  ]
  for (const [i, scope] of scopes.entries())
    await saveMemory(data, root, { scope, content: `memory ${i}` })
  expect(await folderLineage(root, 'Research/Child')).toEqual(['', 'Research', 'Research/Child'])
  const inherited = await inheritedMemories(data, root, 'Research/Child')
  expect(inherited.map((m) => m.content)).toEqual(['memory 0', 'memory 1', 'memory 2', 'memory 3'])
  expect((await inheritedMemories(data, other)).map((m) => m.content)).toEqual(['memory 0'])
  expect((await inheritedMemories(data, null)).map((m) => m.content)).toEqual(['memory 0'])
  expect(
    rankMemories(
      [
        ...inherited,
        ...Array.from({ length: 12 }, (_, i) => ({
          ...inherited[3],
          id: `extra${i}`,
          content: 'keyword',
          updated: Date.now(),
        })),
      ],
      'keyword',
    ).map((m) => m.scope),
  ).toContainEqual({ kind: 'global' })
  const first = inherited[0]
  await expect(
    saveMemory(data, root, { ...first, original: 'stale', content: 'overwrite' }),
  ).rejects.toThrow('외부')
  await expect(trashMemory(data, root, first.id, first.scope, 'stale')).rejects.toThrow('외부')
  await saveMemory(data, null, { ...first, original: first.content, content: 'edited' })
  expect(await readFile(join(data, 'memory/global', `${first.id}.md`), 'utf8')).toBe('edited')
  await trashMemory(data, null, first.id, first.scope, 'edited')
  expect(await inheritedMemories(data, null)).toEqual([])
  expect(await readdir(join(data, 'memory/trash'))).toHaveLength(1)
  await expect(inheritedMemories(data, root, '../outside')).rejects.toThrow()
  await symlink(other, join(root, 'link'))
  await expect(inheritedMemories(data, root, 'link')).rejects.toThrow()
  expect(memoryKey({ id: 'same', scope: { kind: 'global' } })).not.toBe(
    memoryKey({ id: 'same', scope: { kind: 'folder', path: '' } }),
  )
})
