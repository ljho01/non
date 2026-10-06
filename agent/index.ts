import { mkdir, readdir, readFile, stat, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { noteText, parseNote, displayFilename } from '../src/shared/contracts/note'
import {
  noteLinks,
  resolveNoteLink,
  wikiLinks,
  type IndexedDocument,
  type IndexedLink,
  type IndexSnapshot,
  type NoteLink,
  type SearchHit,
} from '../src/shared/contracts/links'
import { safePath } from './vault'

type Row = {
  path: string
  id: string | null
  title: string
  kind: IndexedDocument['kind']
  aliases: string
  modified: number
  text: string
  fingerprint: string
}
type LinkRow = { source: string; target: string; label: string; context: string }
type SqliteStatement = {
  all(...values: unknown[]): unknown[]
  get(...values: unknown[]): unknown
  run(...values: unknown[]): unknown
}
type SqliteDatabase = {
  exec(sql: string): void
  close(): void
  prepare?(sql: string): SqliteStatement
  query?(sql: string): SqliteStatement
}
type SqliteConstructor = new (file: string, options?: { create?: boolean }) => SqliteDatabase
const runtimeRequire = createRequire(import.meta.url)
const sqlite = runtimeRequire(process.versions.bun ? 'bun:sqlite' : 'node:sqlite') as {
  Database?: SqliteConstructor
  DatabaseSync?: SqliteConstructor
}
function sqliteConstructor() {
  const constructor = sqlite.Database ?? sqlite.DatabaseSync
  if (!constructor) throw new Error('SQLite is unavailable in this runtime')
  return constructor
}
const Sqlite = sqliteConstructor()
const schema = `
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS documents(path TEXT PRIMARY KEY, id TEXT, title TEXT NOT NULL, kind TEXT NOT NULL, aliases TEXT NOT NULL, modified REAL NOT NULL, text TEXT NOT NULL, fingerprint TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS document_id ON documents(id);
  CREATE TABLE IF NOT EXISTS links(source TEXT NOT NULL, target TEXT NOT NULL, label TEXT NOT NULL, context TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS link_source ON links(source);
  CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(path UNINDEXED,title,text,tokenize='unicode61');
  PRAGMA user_version=1;
`
export class VaultIndex {
  readonly db: SqliteDatabase
  private tail: Promise<unknown> = Promise.resolve()
  private updated = 0
  private warnings: string[] = []
  constructor(
    readonly root: string,
    readonly file: string,
  ) {
    this.db = process.versions.bun ? new Sqlite(file, { create: true }) : new Sqlite(file)
    this.db.exec(schema)
  }
  close() {
    this.db.close()
  }
  private statement(sql: string) {
    const statement = this.db.prepare?.(sql) ?? this.db.query?.(sql)
    if (!statement) throw new Error('SQLite statement API is unavailable')
    return statement
  }
  private async scan() {
    const files: { path: string; fingerprint: string; modified: number; size: number }[] = []
    const walk = async (folder: string, depth: number) => {
      if (depth > 24 || files.length > 20_000)
        throw new Error('폴더 인덱스 크기 제한을 초과했습니다.')
      for (const item of await readdir(folder ? await safePath(this.root, folder) : this.root, {
        withFileTypes: true,
      })) {
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.isSymbolicLink())
          continue
        const path = folder ? `${folder}/${item.name}` : item.name
        if (item.isDirectory()) await walk(path, depth + 1)
        else if (item.isFile() && /\.(json|md|pdf)$/i.test(path)) {
          if (files.length >= 20_000) throw new Error('폴더 인덱스 크기 제한을 초과했습니다.')
          const meta = await stat(await safePath(this.root, path))
          files.push({
            path,
            fingerprint: `${meta.mtimeMs}:${meta.ctimeMs}:${meta.size}`,
            modified: meta.mtimeMs,
            size: meta.size,
          })
        }
      }
    }
    await walk('', 0)
    return files
  }
  private async sync(force: boolean) {
    const files = await this.scan()
    const previous = new Map(
      (this.statement('SELECT * FROM documents').all() as Row[]).map((row) => [row.path, row]),
    )
    const changed: { doc: Row; links: NoteLink[] }[] = []
    const invalid: string[] = []
    const warnings: string[] = []
    for (const file of files) {
      if (!force && previous.get(file.path)?.fingerprint === file.fingerprint) continue
      try {
        const kind = /\.pdf$/i.test(file.path)
          ? 'pdf'
          : /\.md$/i.test(file.path)
            ? 'legacy'
            : 'note'
        if (kind !== 'pdf' && file.size > 8 * 1024 * 1024) throw new Error('8MB 텍스트 크기 제한')
        const content =
          kind === 'pdf' ? '' : await readFile(await safePath(this.root, file.path), 'utf8')
        // Retry on the next refresh if a cloud writer changed the file while it was read.
        const after = await stat(await safePath(this.root, file.path))
        if (`${after.mtimeMs}:${after.ctimeMs}:${after.size}` !== file.fingerprint)
          throw new Error('파일이 변경되는 중입니다.')
        const note = kind === 'note' ? parseNote(content) : null
        const text = note ? noteText(note) : content
        const aliases = Array.isArray(note?.metadata?.aliases)
          ? note.metadata.aliases.filter((item): item is string => typeof item === 'string')
          : []
        const links = note
          ? noteLinks(note)
          : kind === 'legacy'
            ? wikiLinks(content.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`]*`/g, ''))
            : []
        changed.push({
          doc: {
            ...file,
            id: note?.id ?? null,
            kind,
            title: note?.title || displayFilename(file.path),
            aliases: JSON.stringify(aliases),
            text,
          },
          links,
        })
      } catch (error) {
        invalid.push(file.path)
        if (
          !/\.json$/i.test(file.path) ||
          /\.note\.json$/i.test(file.path) ||
          previous.has(file.path)
        )
          warnings.push(`${file.path}: ${error instanceof Error ? error.message : '읽기 실패'}`)
      }
    }
    const present = new Set(files.map((file) => file.path))
    const remove = [...previous.keys()].filter(
      (path) => !present.has(path) || invalid.includes(path),
    )
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (force) {
        this.db.exec('DELETE FROM documents; DELETE FROM links; DELETE FROM search;')
      }
      const deleteDoc = this.statement('DELETE FROM documents WHERE path=?')
      const deleteLinks = this.statement('DELETE FROM links WHERE source=?')
      const deleteSearch = this.statement('DELETE FROM search WHERE path=?')
      const insert = this.statement('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?,?,?,?)')
      const insertLink = this.statement('INSERT INTO links VALUES(?,?,?,?)')
      for (const path of [...remove, ...changed.map((item) => item.doc.path)]) {
        deleteDoc.run(path)
        deleteLinks.run(path)
        deleteSearch.run(path)
      }
      for (const { doc, links } of changed) {
        insert.run(
          doc.path,
          doc.id,
          doc.title,
          doc.kind,
          doc.aliases,
          doc.modified,
          doc.text,
          doc.fingerprint,
        )
        this.statement('INSERT INTO search VALUES(?,?,?)').run(doc.path, doc.title, doc.text)
        for (const link of links)
          insertLink.run(doc.path, link.target, link.label, link.context.slice(0, 300))
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    this.updated = Date.now()
    this.warnings = warnings.slice(0, 30)
  }
  private documents(): IndexedDocument[] {
    return (this.statement('SELECT * FROM documents ORDER BY path').all() as Row[])
      .map((row) => ({ ...row, aliases: JSON.parse(row.aliases) as string[] }))
  }
  private resolved(documents: IndexedDocument[]): IndexedLink[] {
    const titles = new Map(documents.map((doc) => [doc.path, doc.title]))
    return (this.statement('SELECT * FROM links ORDER BY source').all() as LinkRow[])
      .map((link) => ({
        ...link,
        sourceTitle: titles.get(link.source) ?? link.source,
        ...resolveNoteLink(documents, link.source, link.target),
      }))
  }
  async request(
    action: string,
    payload: { path?: string; query?: string; target?: string; force?: boolean },
  ) {
    const work = this.tail
      .catch(() => {})
      .then(async () => {
        await this.sync(payload.force === true || action === 'index:rebuild')
        const documents = this.documents()
        if (action === 'index:resolve')
          return resolveNoteLink(documents, payload.path ?? '', payload.target ?? '')
        if (action === 'index:search') {
          const query = (payload.query ?? '').trim().toLocaleLowerCase()
          const words = query.split(/\s+/).filter(Boolean)
          // Literal substring matching keeps Korean partial words usable; FTS ranks token matches first.
          const fts = query
            ? (this.statement(
                'SELECT path FROM search WHERE search MATCH ? ORDER BY rank LIMIT 100',
              ).all(words.map((word) => `"${word.replaceAll('"', '""')}"*`).join(' AND ')) as {
                path: string
              }[])
                .map((row) => row.path)
            : []
          const ranking = new Map(fts.map((path, index) => [path, index]))
          return documents
            .filter(
              (doc) =>
                !query ||
                ranking.has(doc.path) ||
                words.every((word) =>
                  `${doc.title}\n${doc.path}\n${doc.text}\n${doc.aliases.join(' ')}`
                    .toLocaleLowerCase()
                    .includes(word),
                ),
            )
            .sort(
              (a, b) =>
                (ranking.get(a.path) ?? 1000) - (ranking.get(b.path) ?? 1000) ||
                a.title.localeCompare(b.title),
            )
            .slice(0, 100)
            .map((doc) => ({
              id: doc.id,
              path: doc.path,
              title: doc.title,
              kind: doc.kind,
              snippet: doc.text.slice(
                Math.max(0, doc.text.toLocaleLowerCase().indexOf(words[0] ?? '') - 40),
                Math.max(0, doc.text.toLocaleLowerCase().indexOf(words[0] ?? '') - 40) + 180,
              ),
            })) satisfies SearchHit[]
        }
        const links = this.resolved(documents)
        return {
          documents: documents.length,
          links: links.length,
          updated: this.updated,
          warnings: this.warnings,
          backlinks: links.filter(
            (link) => link.path === payload.path && link.source !== payload.path,
          ),
          outgoing: links.filter((link) => link.source === payload.path),
        } satisfies IndexSnapshot
      })
    this.tail = work
    return work
  }
}
const indexes = new Map<string, Promise<VaultIndex>>()
export function getIndex(dataDir: string, root: string) {
  const key = `${dataDir}\0${root}`
  if (!indexes.has(key))
    indexes.set(
      key,
      (async () => {
        const folder = join(dataDir, 'indexes', createHash('sha256').update(root).digest('hex'))
        await mkdir(folder, { recursive: true, mode: 0o700 })
        const file = join(folder, 'index.sqlite')
        const index = new VaultIndex(root, file)
        await chmod(file, 0o600)
        return index
      })().catch((error) => {
        indexes.delete(key)
        throw error
      }),
    )
  return indexes.get(key)!
}
