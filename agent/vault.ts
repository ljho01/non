import { lstat, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { noteText, parseNote } from '../src/shared/contracts/note'

export async function safePath(root: string, path: string) {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).some((p) => !p || p === '..' || p === '.'))
    throw new Error('Invalid vault path')
  const target = resolve(root, path)
  if (relative(root, target).startsWith('..')) throw new Error('Path outside vault')
  let cursor = root
  for (const part of path.split('/')) {
    cursor = join(cursor, part)
    const meta = await lstat(cursor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (meta?.isSymbolicLink()) throw new Error('Symbolic links are not supported')
  }
  return target
}

export async function notes(root: string, folder = '', depth = 0): Promise<string[]> {
  if (depth > 20) return []
  const entries = await readdir(folder ? await safePath(root, folder) : root, {
    withFileTypes: true,
  })
  const output: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink())
      continue
    const path = folder ? `${folder}/${entry.name}` : entry.name
    if (entry.isDirectory()) output.push(...(await notes(root, path, depth + 1)))
    else if (entry.isFile() && /\.md$/i.test(entry.name)) output.push(path)
    else if (entry.isFile() && /\.json$/i.test(entry.name)) {
      try {
        if (parseNote(await readText(root, path)).format === 'non.note') output.push(path)
      } catch {
        /* Other JSON files and unsupported formats are not agent notes. */
      }
    }
    if (output.length > 5000) break
  }
  return output.slice(0, 5000)
}
export async function readText(root: string, path: string) {
  const target = await safePath(root, path)
  if ((await stat(target)).size > 2_000_000) throw new Error('Note exceeds agent read limit')
  return await readFile(target, 'utf8')
}
export async function readNote(root: string, path: string) {
  if (/\.md$/i.test(path)) return (await readText(root, path)).slice(0, 60_000)
  if (!/\.json$/i.test(path))
    throw new Error('Only Non JSON and Markdown notes can be read with this tool')
  return noteText(parseNote(await readText(root, path))).slice(0, 60_000)
}
export async function atomicWrite(root: string, path: string, content: string) {
  const target = await safePath(root, path)
  await atomicWriteTarget(target, content)
}

async function atomicWriteTarget(target: string, content: string) {
  const parent = dirname(target)
  await mkdir(parent, { recursive: true })
  const temp = join(parent, `.non-${randomUUID()}.tmp`)
  await writeFile(temp, content, { flag: 'wx', mode: 0o600 })
  await rename(temp, target)
}

export async function agentFilePath(root: string, path: string, sandboxed: boolean) {
  if (sandboxed) return path ? safePath(root, path) : root
  const expanded =
    path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
  return resolve(isAbsolute(expanded) ? expanded : join(root, expanded || '.'))
}

export async function listAgentFiles(root: string, path: string, sandboxed: boolean) {
  const target = await agentFilePath(root, path, sandboxed)
  const metadata = await stat(target)
  if (!metadata.isDirectory()) throw new Error('Path is not a directory')
  const entries = (await readdir(target, { withFileTypes: true })).slice(0, 500)
  return entries.map((entry) => {
    const absolute = join(target, entry.name)
    const display = sandboxed ? relative(root, absolute) : absolute
    const kind = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other'
    return `${kind}\t${display}`
  })
}

export async function readAgentFile(root: string, path: string, sandboxed: boolean) {
  const target = await agentFilePath(root, path, sandboxed)
  const metadata = await stat(target)
  if (!metadata.isFile()) throw new Error('Path is not a regular file')
  if (metadata.size > 2_000_000) throw new Error('File exceeds the 2 MB agent read limit')
  return readFile(target, 'utf8')
}

export async function writeAgentFile(
  root: string,
  path: string,
  content: string,
  expectedContent: string | undefined,
  sandboxed: boolean,
) {
  if (Buffer.byteLength(content, 'utf8') > 2_000_000)
    throw new Error('File exceeds the 2 MB agent write limit')
  const target = await agentFilePath(root, path, sandboxed)
  const before = await readFile(target, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (before !== null && expectedContent === undefined)
    throw new Error('Read the existing file first and provide expectedContent before overwriting it')
  if (before !== null && before !== expectedContent)
    throw new Error('File changed after it was read; read it again before writing')
  if (before === null && expectedContent !== undefined && expectedContent !== '')
    throw new Error('File no longer exists; read the directory again before writing')

  const parent = dirname(target)
  await mkdir(parent, { recursive: true })
  const temp = join(parent, `.non-${randomUUID()}.tmp`)
  const mode = await stat(target)
    .then((metadata) => metadata.mode & 0o777)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return 0o600
      throw error
    })
  await writeFile(temp, content, { flag: 'wx', mode })
  try {
    const latest = await readFile(target, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (latest !== before) throw new Error('File changed while it was being written; retry after reading it')
    await rename(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
  return sandboxed ? relative(root, target) : target
}
