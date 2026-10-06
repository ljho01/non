import { test, expect } from 'bun:test'
import { mkdtemp, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  safePath,
  atomicWrite,
  listAgentFiles,
  notes,
  readAgentFile,
  readNote,
  writeAgentFile,
} from './vault'
import { createNote, serializeNote } from '../src/shared/contracts/note'

test('agent file tools reject traversal and symbolic links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-agent-test-'))
  await expect(safePath(root, '../outside.md')).rejects.toThrow()
  await symlink(tmpdir(), join(root, 'link'))
  await expect(safePath(root, 'link/outside.md')).rejects.toThrow()
})
test('agent reads JSON and Markdown notes but excludes unrelated JSON and hidden memories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-memory-test-'))
  const note = createNote('hello')
  note.blocks[0].text = 'Korean answers'
  await atomicWrite(root, 'Research/note.note.json', serializeNote(note))
  await atomicWrite(root, 'package.json', '{"name":"not a note"}')
  await atomicWrite(root, 'legacy.md', 'preserve me')
  await atomicWrite(root, '.non/memory/one.md', '# Writing\nUse Korean answers')
  await atomicWrite(root, '.non/memory/two.md', '# Stack\nUse Tauri for desktop')
  expect((await notes(root)).sort()).toEqual(['Research/note.note.json', 'legacy.md'])
  expect(await readNote(root, 'Research/note.note.json')).toBe('hello\n\nKorean answers')
  expect(await readFile(join(root, 'legacy.md'), 'utf8')).toBe('preserve me')
  expect(await readNote(root, 'legacy.md')).toBe('preserve me')
  await expect(readNote(root, 'package.json')).rejects.toThrow()
})

test('agent sandbox confines file reads and writes to the vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-agent-sandbox-'))
  const outside = await mkdtemp(join(tmpdir(), 'non-agent-outside-'))
  const outsideFile = join(outside, 'outside.txt')

  expect(await writeAgentFile(root, 'inside.txt', 'first', undefined, true)).toBe('inside.txt')
  expect(await readAgentFile(root, 'inside.txt', true)).toBe('first')
  expect(await listAgentFiles(root, '', true)).toContain('file\tinside.txt')
  await expect(readAgentFile(root, outsideFile, true)).rejects.toThrow()
  await expect(writeAgentFile(root, outsideFile, 'blocked', undefined, true)).rejects.toThrow()
})

test('disabled agent sandbox permits guarded writes outside the vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-agent-root-'))
  const outside = await mkdtemp(join(tmpdir(), 'non-agent-unrestricted-'))
  const outsideFile = join(outside, 'outside.txt')

  expect(await writeAgentFile(root, outsideFile, 'first', undefined, false)).toBe(outsideFile)
  expect(await readAgentFile(root, outsideFile, false)).toBe('first')
  await expect(writeAgentFile(root, outsideFile, 'second', 'stale', false)).rejects.toThrow(
    'File changed',
  )
  expect(await writeAgentFile(root, outsideFile, 'second', 'first', false)).toBe(outsideFile)
  expect(await readAgentFile(root, outsideFile, false)).toBe('second')
})
