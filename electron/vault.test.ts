import { expect, test } from 'bun:test'
import { mkdtemp, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNote, serializeNote } from '../src/shared/contracts/note'
import { createCanvas, serializeCanvas } from '../src/shared/contracts/canvas'
import {
  archiveEntry,
  createFolder,
  deleteArchivedEntry,
  ensureDefaultVault,
  listArchivedEntries,
  listEntries,
  moveEntry,
  readDocument,
  renameEntry,
  restoreArchivedEntry,
  resolveVaultPath,
  saveDocument,
} from './vault'

test('Electron creates and reuses Documents/non as the default vault', async () => {
  const documents = await mkdtemp(join(tmpdir(), 'non-electron-documents-'))
  const root = await ensureDefaultVault(documents)
  expect(root).toBe(join(await realpath(documents), 'non'))
  expect((await stat(root)).isDirectory()).toBe(true)
  expect(await ensureDefaultVault(documents)).toBe(root)
})

test('Electron vault blocks traversal and symbolic links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-electron-vault-'))
  await expect(resolveVaultPath(root, '../outside.md')).rejects.toThrow('Invalid vault path')
  await expect(resolveVaultPath(root, '/tmp/outside.md')).rejects.toThrow('Invalid vault path')
  await symlink('/tmp', join(root, 'link'))
  await expect(resolveVaultPath(root, 'link/outside.md')).rejects.toThrow('Symbolic links')
})

test('Electron vault preserves formats and refuses stale writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-electron-vault-'))
  const note = createNote('First')
  const source = serializeNote(note)
  const first = await saveDocument(root, 'Notes/first.note.json', source, null)
  await writeFile(join(root, 'Notes/first.note.json'), serializeNote(createNote('External')))
  await expect(
    saveDocument(root, 'Notes/first.note.json', serializeNote(createNote('Mine')), first),
  ).rejects.toThrow('CONFLICT')
  expect((await readDocument(root, 'Notes/first.note.json')).content).toContain('External')

  const markdown = '\ufeff---\r\ncustom: yes\r\n---\r\n# 제목\r\n[[Target]]  \r\n'
  const markdownRevision = await saveDocument(root, 'Notes/source.md', markdown, null)
  expect((await readDocument(root, 'Notes/source.md')).content).toBe(markdown)
  await saveDocument(root, 'Notes/source.md', `${markdown}\r\nmore`, markdownRevision)
  expect(await readFile(join(root, 'Notes/source.md'), 'utf8')).toBe(`${markdown}\r\nmore`)
})

test('Electron vault lists supported files and creates empty folders', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-electron-vault-'))
  await createFolder(root, 'Empty')
  await saveDocument(root, 'note.note.json', serializeNote(createNote('Note')), null)
  await saveDocument(root, 'board.excalidraw', serializeCanvas(createCanvas()), null)
  await writeFile(join(root, 'legacy.md'), '# Legacy')
  await writeFile(join(root, 'package.json'), '{}')
  const entries = await listEntries(root)
  expect(entries.map(({ path, kind }) => ({ path, kind }))).toEqual([
    { path: 'board.excalidraw', kind: 'canvas' },
    { path: 'Empty', kind: 'folder' },
    { path: 'legacy.md', kind: 'legacy' },
    { path: 'note.note.json', kind: 'note' },
  ])
})

test('Electron vault renames files and folders without changing document formats', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-electron-vault-'))
  await saveDocument(root, 'Notes/draft.note.json', serializeNote(createNote('Draft')), null)
  await saveDocument(root, 'Notes/source.md', '# Source', null)
  await saveDocument(root, 'Notes/board.excalidraw', serializeCanvas(createCanvas()), null)

  expect(await renameEntry(root, 'Notes/draft.note.json', 'Final')).toBe(
    'Notes/Final.note.json',
  )
  expect(await renameEntry(root, 'Notes/source.md', 'Reference.md')).toBe(
    'Notes/Reference.md',
  )
  expect(await renameEntry(root, 'Notes/board.excalidraw', 'Map')).toBe(
    'Notes/Map.excalidraw',
  )
  expect(await renameEntry(root, 'Notes', 'Archive')).toBe('Archive')
  expect((await readDocument(root, 'Archive/Final.note.json')).content).toContain('Draft')
  expect((await readDocument(root, 'Archive/Reference.md')).content).toBe('# Source')

  await createFolder(root, 'Occupied')
  await expect(renameEntry(root, 'Archive', 'Occupied')).rejects.toThrow('CONFLICT')
  await expect(renameEntry(root, 'Archive', '../Outside')).rejects.toThrow('Invalid name')
})

test('Electron vault moves files and folders without allowing cycles or collisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-electron-move-'))
  await createFolder(root, 'Inbox')
  await createFolder(root, 'Archive')
  await createFolder(root, 'Inbox/Nested')
  await saveDocument(root, 'Inbox/draft.note.json', serializeNote(createNote('Draft')), null)
  await saveDocument(root, 'Inbox/Nested/reference.md', '# Reference', null)

  expect(await moveEntry(root, 'Inbox/draft.note.json', 'Archive')).toBe(
    'Archive/draft.note.json',
  )
  expect((await readDocument(root, 'Archive/draft.note.json')).content).toContain('Draft')
  await expect(moveEntry(root, 'Inbox', 'Inbox/Nested')).rejects.toThrow('itself')

  await createFolder(root, 'Archive/Inbox')
  await expect(moveEntry(root, 'Inbox', 'Archive')).rejects.toThrow('CONFLICT')
})

test('Electron vault archives, restores, and permanently deletes entries outside the normal tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-electron-archive-'))
  await createFolder(root, 'Projects')
  await saveDocument(
    root,
    'Projects/plan.note.json',
    serializeNote(createNote('Plan')),
    null,
  )

  const archived = await archiveEntry(root, 'Projects')
  expect(archived).toMatchObject({
    name: 'Projects',
    kind: 'folder',
    originalPath: 'Projects',
  })
  expect(await listEntries(root)).toEqual([])
  expect(await listArchivedEntries(root)).toHaveLength(1)

  expect(await restoreArchivedEntry(root, archived.id)).toBe('Projects')
  expect((await listEntries(root)).map((entry) => entry.path)).toEqual([
    'Projects',
    'Projects/plan.note.json',
  ])
  expect(await listArchivedEntries(root)).toEqual([])

  const archivedAgain = await archiveEntry(root, 'Projects/plan.note.json')
  await deleteArchivedEntry(root, archivedAgain.id)
  expect(await listArchivedEntries(root)).toEqual([])
  await expect(restoreArchivedEntry(root, archivedAgain.id)).rejects.toThrow(
    '보관된 항목을 찾을 수 없습니다',
  )
})

test('Electron vault refuses to overwrite an occupied restore path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-electron-archive-conflict-'))
  await saveDocument(root, 'note.md', '# Original', null)
  const archived = await archiveEntry(root, 'note.md')
  await saveDocument(root, 'note.md', '# Replacement', null)

  await expect(restoreArchivedEntry(root, archived.id)).rejects.toThrow('CONFLICT')
  expect(await readFile(join(root, 'note.md'), 'utf8')).toBe('# Replacement')
  expect(await listArchivedEntries(root)).toHaveLength(1)
})

test('Bases participate in native file lifecycle with revision protection', async () => {
  const { createBase } = await import('../src/shared/contracts/base')
  const root = await mkdtemp(join(tmpdir(), 'non-bases-'))
  const source = createBase()
  const revision = await saveDocument(root, 'Books.base', source, null)
  expect((await listEntries(root))[0].kind).toBe('base')
  expect(await renameEntry(root, 'Books.base', 'Reading')).toBe('Reading.base')
  const archived = await archiveEntry(root, 'Reading.base')
  const entries = await listArchivedEntries(root)
  expect(entries[0].kind).toBe('base')
  await restoreArchivedEntry(root, entries[0].id)
  expect((await readDocument(root, 'Reading.base')).content).toBe(source)
  await writeFile(join(root, 'Reading.base'), source + '# external\n')
  await expect(saveDocument(root, 'Reading.base', source, revision)).rejects.toThrow('CONFLICT')
  await expect(saveDocument(root, '../outside.base', source, null)).rejects.toThrow()
  await expect(saveDocument(root, 'bad.base', 'views: broken', null)).rejects.toThrow()
})

test('concurrent database property writes cannot both consume the same revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-bases-concurrent-'))
  const first = await saveDocument(root, 'Book.md', '---\nrating: 1\n---\nBody\n', null)
  const results = await Promise.allSettled([
    saveDocument(root, 'Book.md', '---\nrating: 2\n---\nBody\n', first),
    saveDocument(root, 'Book.md', '---\nrating: 3\n---\nBody\n', first),
  ])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
})

test('database indexes attachments and created dates without broadening file-tree access', async () => {
  const {readAsset}=await import('./vault')
  const root=await mkdtemp(join(tmpdir(),'non-base-assets-'))
  await writeFile(join(root,'cover.png'),Buffer.from('89504e470d0a1a0a','hex'))
  await writeFile(join(root,'data.bin'),'binary')
  await symlink('/tmp',join(root,'escape'))
  expect(await listEntries(root)).toHaveLength(0)
  const entries=await listEntries(root,true)
  expect(entries).toHaveLength(2)
  expect(entries.every(e=>e.kind==='attachment' && typeof e.created==='number')).toBe(true)
  expect(await readAsset(root,'cover.png')).toStartWith('data:image/png;base64,')
  await expect(readAsset(root,'data.bin')).rejects.toThrow('Unsupported')
  await expect(readAsset(root,'../outside.png')).rejects.toThrow('Invalid')
  await expect(readAsset(root,'escape/outside.png')).rejects.toThrow('Symbolic')
})

test('Obsidian date type registry is bounded and read without changing it',async()=>{
 const {readPropertyTypes}=await import('./vault')
 const root=await mkdtemp(join(tmpdir(),'non-base-types-'))
 expect(await readPropertyTypes(root)).toEqual({})
 await createFolder(root,'.obsidian')
 await writeFile(join(root,'.obsidian/types.json'),'{"types":{"published":"date","rating":"number"},"custom":1}')
 expect(await readPropertyTypes(root)).toEqual({published:'date',rating:'number'})
 expect(await readFile(join(root,'.obsidian/types.json'),'utf8')).toContain('"custom":1')
})
