import { expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { desktop } from '@/shared/api/desktop'
import { useVault } from '@/entities/vault'
import { readDocument, saveDocument, listEntries } from '../../../../electron/vault'
import { PropertyHistory } from '../model/edits'
import { recordFor, indexRecords } from '../model/records'

test('bulk property edits undo/redo across native revisions and reject external changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-base-history-'))
  const original = '---\r\nprice: 1\r\n# comment\r\n---\r\n**body**  \r\n'
  await saveDocument(root, 'one.md', original, null)
  await saveDocument(root, 'two.md', original, null)
  const saved = { read: desktop.read, save: desktop.save, list: desktop.list },
    state = useVault.getState()
  desktop.read = (p) => readDocument(root, p)
  desktop.save = (p, c, r) => saveDocument(root, p, c, r)
  desktop.list = () => listEntries(root)
  useVault.setState({ path: root, tabs: [], entries: await listEntries(root) })
  const records = async () =>
    Promise.all(
      (await listEntries(root)).map(async (entry) => {
        const data = await readDocument(root, entry.path)
        return recordFor(entry, data.content, data.revision)
      }),
    )
  try {
    const history = new PropertyHistory()
    await history.apply(
      (await records()).map((record) => ({ record, property: 'note.price', value: 5 })),
    )
    expect((await readDocument(root, 'one.md')).content).toContain('price: 5')
    await history.apply([{ record: (await records())[0], property: 'note.price', value: 9 }])
    await history.travel()
    expect((await readDocument(root, 'one.md')).content).toContain('price: 5')
    await history.travel()
    expect((await readDocument(root, 'one.md')).content).toBe(original)
    expect((await readDocument(root, 'two.md')).content).toBe(original)
    await history.travel(true)
    await history.travel(true)
    expect((await readDocument(root, 'one.md')).content).toContain('price: 9')
    await writeFile(join(root, 'one.md'), 'external edit')
    await expect(history.travel()).rejects.toThrow('외부 변경')
    expect((await readDocument(root, 'one.md')).content).toBe('external edit')
    const stale = await records().catch(() => [])
    expect(stale).toHaveLength(2)
  } finally {
    Object.assign(desktop, saved)
    useVault.setState(state)
  }
})

test('record index resolves relative wikilinks, typed frontmatter links and backlinks', () => {
  const entry = (path: string) => ({
    path,
    name: path.split('/').at(-1)!,
    kind: 'legacy' as const,
    modified: 1000,
    created: 500,
    size: 20,
  })
  const first = recordFor(
    entry('Books/one.md'),
    '---\nauthor: "[[two]]"\n---\n[[two]]\n![[cover.png]]\n`[[ignored]]`',
  )
  const second = recordFor(entry('Books/two.md'), '# Two')
  indexRecords([first, second])
  expect(first.resolve?.('two')?.path).toBe('Books/two.md')
  expect(first.file.name).toBe('one.md')
  expect(first.file.basename).toBe('one')
  expect(second.file.backlinks).toEqual([{ path: 'Books/one.md' }])
  expect(first.file.embeds).toEqual([{ path: 'cover.png' }])
  expect(first.file.links).toHaveLength(2)
})
