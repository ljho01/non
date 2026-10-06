import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseNote } from '../src/shared/contracts/note'
import { parseBase } from '../src/shared/contracts/base'
import { parseCanvas } from '../src/shared/contracts/canvas'

export type Entry = {
  path: string
  name: string
  kind: 'note' | 'canvas' | 'base' | 'pdf' | 'legacy' | 'transcription' | 'folder' | 'attachment'
  created?: number
  modified: number
  size: number
  sessionId?: string
}

export type ArchivedEntry = Entry & {
  id: string
  originalPath: string
  archivedAt: number
}

const TEXT_LIMIT = 8 * 1024 * 1024
const PDF_LIMIT = 50 * 1024 * 1024
const ARCHIVE_DIRECTORY = '.archive'
const ARCHIVE_ITEMS_DIRECTORY = `${ARCHIVE_DIRECTORY}/items`
const ARCHIVE_INDEX = `${ARCHIVE_DIRECTORY}/index.json`
const archiveOperations = new Map<string, Promise<void>>()

function revision(content: Uint8Array | string) {
  return createHash('sha256').update(content).digest('hex')
}

export async function ensureDefaultVault(documentsFolder: string) {
  const target = join(documentsFolder, 'non')
  await mkdir(target, { recursive: true, mode: 0o700 })
  const root = await realpath(target)
  if (!(await stat(root)).isDirectory()) throw new Error('Default Non folder is unavailable')
  await ensureArchive(root)
  return root
}

export async function openVault(path: string) {
  const root = await realpath(path)
  if (!(await stat(root)).isDirectory()) throw new Error('Choose a folder')
  await ensureArchive(root)
  return { path: root, entries: await listEntries(root) }
}

async function ensureArchive(root: string) {
  await mkdir(join(root, ARCHIVE_ITEMS_DIRECTORY), { recursive: true, mode: 0o700 })
}

function archiveEntryKind(name: string, directory: boolean): Entry['kind'] {
  if (directory) return 'folder'
  const lower = name.toLowerCase()
  return lower.endsWith('.base') ? 'base' : lower.endsWith('.pdf')
    ? 'pdf'
    : lower.endsWith('.md')
      ? 'legacy'
      : lower.endsWith('.excalidraw')
        ? 'canvas'
        : 'note'
}

function archivedEntry(value: unknown): ArchivedEntry | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(item.id) ||
    typeof item.originalPath !== 'string' ||
    !item.originalPath ||
    typeof item.name !== 'string' ||
    !['note', 'canvas', 'base', 'pdf', 'legacy', 'folder'].includes(String(item.kind)) ||
    typeof item.modified !== 'number' ||
    typeof item.size !== 'number' ||
    typeof item.archivedAt !== 'number'
  )
    return null
  return {
    id: item.id,
    originalPath: item.originalPath,
    name: item.name,
    kind: item.kind as ArchivedEntry['kind'],
    modified: item.modified,
    size: item.size,
    archivedAt: item.archivedAt,
    path: item.originalPath,
  }
}

async function readArchiveIndex(root: string) {
  await ensureArchive(root)
  try {
    const value = JSON.parse(await readFile(join(root, ARCHIVE_INDEX), 'utf8')) as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      const parsed = archivedEntry(item)
      return parsed ? [parsed] : []
    })
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') return []
    throw error
  }
}

async function writeArchiveIndex(root: string, entries: ArchivedEntry[]) {
  await ensureArchive(root)
  const target = join(root, ARCHIVE_INDEX)
  const temporary = join(root, ARCHIVE_DIRECTORY, `.index-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function withArchiveLock<T>(root: string, operation: () => Promise<T>) {
  const previous = archiveOperations.get(root) ?? Promise.resolve()
  let release: () => void = () => undefined
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  archiveOperations.set(root, queued)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (archiveOperations.get(root) === queued) archiveOperations.delete(root)
  }
}

export async function listArchivedEntries(root: string) {
  return withArchiveLock(root, async () => {
    const entries = await readArchiveIndex(root)
    const existing: ArchivedEntry[] = []
    for (const entry of entries) {
      const target = join(root, ARCHIVE_ITEMS_DIRECTORY, entry.id)
      if (await lstat(target).catch(() => null)) existing.push(entry)
    }
    return existing.sort((left, right) => right.archivedAt - left.archivedAt)
  })
}

export async function archiveEntry(root: string, path: string) {
  return withArchiveLock(root, async () => {
    if (path === ARCHIVE_DIRECTORY || path.startsWith(`${ARCHIVE_DIRECTORY}/`))
      throw new Error('The archive cannot be archived')
    const source = await resolveVaultPath(root, path)
    const metadata = await lstat(source)
    if (!metadata.isDirectory() && !metadata.isFile())
      throw new Error('Only files and folders can be archived')
    const id = randomUUID()
    const entry: ArchivedEntry = {
      id,
      path,
      originalPath: path,
      name: basename(path),
      kind: archiveEntryKind(path, metadata.isDirectory()),
      modified: metadata.mtimeMs,
      size: metadata.isFile() ? metadata.size : 0,
      archivedAt: Date.now(),
    }
    const entries = await readArchiveIndex(root)
    const target = join(root, ARCHIVE_ITEMS_DIRECTORY, id)
    await rename(source, target)
    try {
      await writeArchiveIndex(root, [entry, ...entries])
    } catch (error) {
      await rename(target, source).catch(() => undefined)
      throw error
    }
    return entry
  })
}

export async function restoreArchivedEntry(root: string, id: string) {
  return withArchiveLock(root, async () => {
    const entries = await readArchiveIndex(root)
    const entry = entries.find((item) => item.id === id)
    if (!entry) throw new Error('보관된 항목을 찾을 수 없습니다.')
    const source = join(root, ARCHIVE_ITEMS_DIRECTORY, id)
    const target = await resolveVaultPath(root, entry.originalPath)
    if (await lstat(target).catch(() => null))
      throw new Error('CONFLICT: 원래 위치에 같은 이름의 항목이 있습니다.')
    await mkdir(dirname(target), { recursive: true })
    await rename(source, target)
    try {
      await writeArchiveIndex(
        root,
        entries.filter((item) => item.id !== id),
      )
    } catch (error) {
      await rename(target, source).catch(() => undefined)
      throw error
    }
    return entry.originalPath
  })
}

export async function deleteArchivedEntry(root: string, id: string) {
  return withArchiveLock(root, async () => {
    const entries = await readArchiveIndex(root)
    if (!entries.some((item) => item.id === id))
      throw new Error('보관된 항목을 찾을 수 없습니다.')
    await rm(join(root, ARCHIVE_ITEMS_DIRECTORY, id), { recursive: true, force: true })
    await writeArchiveIndex(
      root,
      entries.filter((item) => item.id !== id),
    )
  })
}

export async function resolveVaultPath(root: string, path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid vault path')

  const target = resolve(root, path)
  const outside = relative(root, target)
  if (outside === '..' || outside.startsWith(`..${sep}`) || isAbsolute(outside))
    throw new Error('Path outside vault')

  let cursor = root
  for (const part of path.split(/[\\/]/)) {
    cursor = join(cursor, part)
    const metadata = await lstat(cursor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (metadata?.isSymbolicLink()) throw new Error('Symbolic links are not supported in a vault')
  }
  return target
}

export async function listEntries(root: string, includeAttachments = false) {
  const entries: Entry[] = []
  async function walk(folder: string, depth: number) {
    if (depth > 24 || entries.length > 20_000)
      throw new Error('Vault exceeds the file/depth limit')
    const directory = folder ? await resolveVaultPath(root, folder) : root
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === 'node_modules' || item.isSymbolicLink())
        continue
      const path = folder ? `${folder}/${item.name}` : item.name
      if (item.isDirectory()) {
        entries.push({ path, name: item.name, kind: 'folder', modified: 0, size: 0 })
        await walk(path, depth + 1)
        continue
      }
      if (!item.isFile() || (!includeAttachments && !/\.(json|md|pdf|excalidraw|base)$/i.test(item.name))) continue
      const target = await resolveVaultPath(root, path)
      const metadata = await stat(target)
      const lower = item.name.toLowerCase()
      let attachment = !/\.(json|md|pdf|excalidraw|base)$/i.test(lower)
      if (lower.endsWith('.json') && !lower.endsWith('.note.json')) {
        if (metadata.size > TEXT_LIMIT) continue
        try {
          parseNote(await readFile(target, 'utf8'))
        } catch {
          if (!includeAttachments) continue
          attachment = true
        }
      }
      if (lower.endsWith('.excalidraw')) {
        if (metadata.size > TEXT_LIMIT) continue
        try {
          parseCanvas(await readFile(target, 'utf8'))
        } catch {
          continue
        }
      }
      entries.push({
        path,
        name: item.name,
        kind: attachment ? 'attachment' : lower.endsWith('.base') ? 'base' : lower.endsWith('.pdf')
          ? 'pdf'
          : lower.endsWith('.md')
            ? 'legacy'
            : lower.endsWith('.excalidraw')
              ? 'canvas'
              : 'note',
        created: metadata.birthtimeMs,
        modified: metadata.mtimeMs,
        size: metadata.size,
      })
      if (entries.length > 20_000) throw new Error('Vault exceeds the file/depth limit')
    }
  }
  await walk('', 0)
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

export async function readDocument(root: string, path: string) {
  const target = await resolveVaultPath(root, path)
  const metadata = await stat(target)
  if (metadata.size > TEXT_LIMIT) throw new Error('Text file exceeds 8 MB')
  const content = await readFile(target, 'utf8')
  return { content, revision: revision(content) }
}

const documentWrites = new Map<string, Promise<unknown>>()
export async function saveDocument(root: string, path: string, content: string, previousRevision: string | null) {
  const key = `${root}/${path}`
  const previous = documentWrites.get(key) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(() => saveDocumentUnlocked(root, path, content, previousRevision))
  documentWrites.set(key, operation)
  try { return await operation }
  finally { if (documentWrites.get(key) === operation) documentWrites.delete(key) }
}

async function saveDocumentUnlocked(
  root: string,
  path: string,
  content: string,
  previousRevision: string | null,
) {
  if (Buffer.byteLength(content) > TEXT_LIMIT) throw new Error('Text file exceeds 8 MB')
  if (path.toLowerCase().endsWith('.base')) parseBase(content)
  else if (path.toLowerCase().endsWith('.json')) parseNote(content)
  else if (path.toLowerCase().endsWith('.excalidraw')) parseCanvas(content)
  else if (!path.toLowerCase().endsWith('.md'))
    throw new Error('Only Non notes, Markdown, Bases, and Excalidraw files can be written')

  const target = await resolveVaultPath(root, path)
  const current = await readFile(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (current && previousRevision !== revision(current))
    throw new Error('CONFLICT: File changed outside Non. Save a copy to keep your edits.')
  if (!current && previousRevision !== null)
    throw new Error('CONFLICT: File was removed outside Non. Save a copy.')

  await mkdir(dirname(target), { recursive: true })
  const temporary = join(dirname(target), `.non-${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(content)
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  return revision(content)
}

export async function createFolder(root: string, path: string) {
  const target = await resolveVaultPath(root, path)
  if (await lstat(target).catch(() => null))
    throw new Error('CONFLICT: A file or folder already exists at this path')
  if (!(await stat(dirname(target))).isDirectory()) throw new Error('Parent folder does not exist')
  await mkdir(target)
}

export async function readPdf(root: string, path: string) {
  if (!path.toLowerCase().endsWith('.pdf')) throw new Error('Not a PDF')
  const target = await resolveVaultPath(root, path)
  if ((await stat(target)).size > PDF_LIMIT) throw new Error('PDF exceeds 50 MB')
  return new Uint8Array(await readFile(target))
}

export async function importPdf(root: string, source: string, folder = '') {
  if (!source.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file')
  if ((await stat(source)).size > PDF_LIMIT) throw new Error('PDF exceeds 50 MB')
  const path = folder ? `${folder}/${basename(source)}` : basename(source)
  const target = await resolveVaultPath(root, path)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target, constants.COPYFILE_EXCL)
  return path
}

export async function vaultAbsolutePath(root: string, path: string) {
  const target = await resolveVaultPath(root, path)
  await lstat(target)
  return target
}

export async function renameEntry(root: string, path: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed))
    throw new Error('Invalid name')
  if (trimmed.startsWith('.')) throw new Error('Names cannot start with a dot')
  if (trimmed.length > 200) throw new Error('Name is too long')

  const source = await resolveVaultPath(root, path)
  const metadata = await lstat(source)
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const current = path.slice(folder ? folder.length + 1 : 0)

  // Keep the document format: the tree edits the display name, never the extension.
  const extension = metadata.isDirectory()
    ? ''
    : (current.match(/\.note\.json$|\.(?:json|md|pdf|excalidraw|base)$/i)?.[0] ?? '')
  const base = extension && trimmed.toLowerCase().endsWith(extension.toLowerCase())
    ? trimmed.slice(0, trimmed.length - extension.length)
    : trimmed
  if (!base) throw new Error('Invalid name')
  const nextPath = folder ? `${folder}/${base}${extension}` : `${base}${extension}`
  if (nextPath === path) return path

  const target = await resolveVaultPath(root, nextPath)
  if (await lstat(target).catch(() => null))
    throw new Error('CONFLICT: A file or folder already exists at this path')
  await rename(source, target)
  return nextPath
}

export async function moveEntry(root: string, path: string, targetFolder: string) {
  const source = await resolveVaultPath(root, path)
  const metadata = await lstat(source)
  const normalizedTargetFolder = targetFolder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (
    targetFolder &&
    (normalizedTargetFolder !== targetFolder.replaceAll('\\', '/') ||
      normalizedTargetFolder.split('/').some((part) => !part || part === '.' || part === '..'))
  )
    throw new Error('Invalid target folder')
  if (
    metadata.isDirectory() &&
    (normalizedTargetFolder === path || normalizedTargetFolder.startsWith(`${path}/`))
  )
    throw new Error('A folder cannot be moved into itself')

  const currentFolder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  if (currentFolder === normalizedTargetFolder) return path
  const targetDirectory = normalizedTargetFolder
    ? await resolveVaultPath(root, normalizedTargetFolder)
    : root
  if (!(await stat(targetDirectory)).isDirectory()) throw new Error('Target folder does not exist')

  const nextPath = normalizedTargetFolder
    ? `${normalizedTargetFolder}/${basename(path)}`
    : basename(path)
  const target = await resolveVaultPath(root, nextPath)
  if (await lstat(target).catch(() => null))
    throw new Error('CONFLICT: A file or folder already exists at this path')
  await rename(source, target)
  return nextPath
}

export async function readAsset(root: string, path: string) {
  const mime: Record<string,string> = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml'}
  const type = mime[path.split('.').at(-1)?.toLowerCase() ?? '']
  if (!type) throw new Error('Unsupported image format')
  const target = await resolveVaultPath(root,path)
  if ((await stat(target)).size > 8*1024*1024) throw new Error('Image exceeds 8 MB')
  return `data:${type};base64,${(await readFile(target)).toString('base64')}`
}

export async function readPropertyTypes(root: string): Promise<Record<string,string>> {
  const path=await resolveVaultPath(root,'.obsidian/types.json')
  const metadata=await stat(path).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error})
  if(!metadata)return {}
  if(metadata.size>1024*1024)throw new Error('Property type registry exceeds 1 MB')
  const parsed:unknown=JSON.parse(await readFile(path,'utf8'))
  if(!parsed||typeof parsed!=='object'||!('types' in parsed)||!parsed.types||typeof parsed.types!=='object')return {}
  return Object.fromEntries(Object.entries(parsed.types).filter(([name,type])=>!['__proto__','constructor','prototype'].includes(name)&&typeof type==='string'))
}
