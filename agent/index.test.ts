import { expect, test } from 'bun:test'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  unlink,
  symlink,
  readdir,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VaultIndex } from './index'
import { createNote, serializeNote } from '../src/shared/contracts/note'
import type { IndexSnapshot, SearchHit } from '../src/shared/contracts/links'

test('derived SQLite index searches content, maintains backlinks on edits/renames/deletion and rebuilds without writing source files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-index-vault-'))
  const cache = await mkdtemp(join(tmpdir(), 'non-index-cache-'))
  const target = createNote('대상 문서')
  target.metadata = { aliases: ['별칭'] }
  target.blocks[0].text = '한국어 부분검색 테스트 고유본문'
  const source = createNote('출발 문서')
  source.blocks[0].text = `[[별칭|참고]] [[없는 문서]]`
  source.blocks.push({
    id: 'rich',
    type: 'tiptap',
    content: {
      type: 'paragraph',
      content: [{ type: 'wikiLink', attrs: { target: `id:${target.id}`, label: '안정적인 연결' } }],
    },
  })
  await writeFile(join(root, 'target.note.json'), serializeNote(target))
  await writeFile(join(root, 'source.note.json'), serializeNote(source))
  await mkdir(join(root, '.non'))
  await writeFile(join(root, '.non', 'private.md'), '[[target]]')
  await writeFile(join(root, 'unrelated.json'), '{"keep":true}')
  await writeFile(join(root, 'paper.pdf'), '%PDF-fake-test')
  await symlink(join(root, 'source.note.json'), join(root, 'skip.note.json'))
  const index = new VaultIndex(root, join(cache, 'index.sqlite'))
  try {
    let result = (await index.request('index:query', { path: 'target.note.json' })) as IndexSnapshot
    expect(result.documents).toBe(3)
    expect(result.backlinks).toHaveLength(2)
    expect(result.warnings).toEqual([])
    const hits = (await index.request('index:search', { query: '부분검' })) as SearchHit[]
    expect(hits.map((hit) => hit.path)).toEqual(['target.note.json'])
    expect(await index.request('index:search', { query: '" OR * - ( )' })).toEqual([])
    expect(
      ((await index.request('index:search', { query: '안정적인' })) as SearchHit[])[0].path,
    ).toBe('source.note.json')
    await rename(join(root, 'target.note.json'), join(root, 'renamed.note.json'))
    result = (await index.request('index:query', { path: 'renamed.note.json' })) as IndexSnapshot
    expect(result.backlinks).toHaveLength(2)
    expect(
      await index.request('index:resolve', { path: 'source.note.json', target: `id:${target.id}` }),
    ).toMatchObject({ status: 'resolved', path: 'renamed.note.json' })
    expect(await index.request('index:resolve', { target: '../../etc/passwd' })).toMatchObject({
      status: 'missing',
    })
    const before = await readFile(join(root, 'source.note.json'), 'utf8')
    index.db.exec('DELETE FROM links; DELETE FROM search;')
    result = (await index.request('index:rebuild', { path: 'renamed.note.json' })) as IndexSnapshot
    expect(result.backlinks).toHaveLength(2)
    expect(await readFile(join(root, 'source.note.json'), 'utf8')).toBe(before)
    expect((await readdir(root)).some((name) => name.endsWith('.sqlite'))).toBe(false)
    source.blocks = [{ id: 'new', type: 'paragraph', text: '연결 제거' }]
    await writeFile(join(root, 'source.note.json'), serializeNote(source))
    result = (await index.request('index:query', { path: 'renamed.note.json' })) as IndexSnapshot
    expect(result.backlinks).toEqual([])
    await unlink(join(root, 'renamed.note.json'))
    expect(await index.request('index:search', { query: '고유본문' })).toEqual([])
    await writeFile(join(root, 'source.note.json'), '{broken')
    result = (await index.request('index:query', {})) as IndexSnapshot
    expect(result.documents).toBe(1)
    expect(result.warnings[0]).toContain('source.note.json')
  } finally {
    index.close()
  }
}, 15_000)

test('indexes are isolated per vault and duplicate IDs remain ambiguous', async () => {
  const first = await mkdtemp(join(tmpdir(), 'non-index-first-'))
  const second = await mkdtemp(join(tmpdir(), 'non-index-second-'))
  const cache = await mkdtemp(join(tmpdir(), 'non-index-isolation-'))
  const note = createNote('Shared title')
  await writeFile(join(first, 'a.note.json'), serializeNote(note))
  await writeFile(join(first, 'b.note.json'), serializeNote(note))
  const a = new VaultIndex(first, join(cache, 'a.sqlite'))
  const b = new VaultIndex(second, join(cache, 'b.sqlite'))
  try {
    expect(await a.request('index:resolve', { target: `id:${note.id}` })).toMatchObject({
      status: 'ambiguous',
      path: null,
    })
    expect(await b.request('index:search', { query: '' })).toEqual([])
    const parallel = (await Promise.all([
      a.request('index:query', {}),
      a.request('index:rebuild', {}),
    ])) as IndexSnapshot[]
    expect(parallel.map((result) => result.documents)).toEqual([2, 2])
  } finally {
    a.close()
    b.close()
  }
})
