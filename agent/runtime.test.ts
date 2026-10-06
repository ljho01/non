import { test, expect } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { createNote, serializeNote } from '../src/shared/contracts/note'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'

test('compiled agent serves status and persistent memory without network/auth', async () => {
  const data = await mkdtemp(join(tmpdir(), 'non-rpc-data-'))
  const root = await mkdtemp(join(tmpdir(), 'non-rpc-vault-'))
  const electron = createRequire(import.meta.url)('electron') as string
  const child = spawn(
    electron,
    [join(import.meta.dir, '../scripts/electron-agent-harness.cjs'), '--data-dir', data],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  )
  type Reply = { id: string; type: string; data?: unknown; error?: string }
  const waiting = new Map<string, (reply: Reply) => void>()
  const reader = createInterface({ input: child.stdout })
  reader.on('line', (line) => {
    const event = JSON.parse(line) as Reply
    if (event.type === 'result' || event.type === 'error') {
      waiting.get(event.id)?.(event)
      waiting.delete(event.id)
    }
  })
  const request = (action: string, payload?: unknown, requestRoot: string | null = root) =>
    new Promise<Reply>((resolve, reject) => {
      const id = crypto.randomUUID()
      const timer = setTimeout(() => reject(new Error('Agent response timeout')), 5000)
      waiting.set(id, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
      child.stdin.write(`${JSON.stringify({ id, action, root: requestRoot, payload })}\n`)
    })
  try {
    const status = await request('status')
    expect(status.type).toBe('result')
    const data = status.data as {
      connected: boolean
      models: { id: string; input: ('text' | 'image')[] }[]
    }
    expect(data.connected).toBe(false)
    expect(data.models.length).toBeGreaterThan(0)
    expect(data.models.some((model) => model.input.includes('image'))).toBe(true)
    const saved = await request('memory:save', { content: '# Preference\nPrefer Korean answers.' })
    expect(saved.type).toBe('result')
    const items = saved.data as { id: string; content: string; scope: { kind: string } }[]
    expect(items).toHaveLength(1)
    expect(items[0].scope).toEqual({ kind: 'global' })
    expect((await request('memory:list', {}, null)).data).toEqual(items)
    const otherRoot = await mkdtemp(join(tmpdir(), 'non-other-library-'))
    expect((await request('memory:list', {}, otherRoot)).data).toEqual(items)
    const stale = await request('memory:save', {
      id: items[0].id,
      content: 'Changed',
      original: 'stale',
    })
    expect(stale.type).toBe('error')
    const removed = await request('memory:delete', { id: items[0].id, original: items[0].content })
    expect(removed.data).toEqual([])
    const note = createNote('Indexed without login')
    note.blocks[0].text = 'Searchable offline content [[Missing]]'
    await writeFile(join(root, 'offline.note.json'), serializeNote(note))
    expect((await request('index:query', { path: 'offline.note.json' })).data).toMatchObject({
      documents: 1,
      links: 1,
      outgoing: [{ target: 'Missing', status: 'missing' }],
    })
    expect((await request('index:search', { query: 'offline' })).data).toMatchObject([
      { path: 'offline.note.json' },
    ])
    expect((await request('index:resolve', { target: `id:${note.id}` })).data).toMatchObject({
      path: 'offline.note.json',
      status: 'resolved',
    })
    expect((await request('index:rebuild', {})).type).toBe('result')
    expect((await request('index:query', {}, null)).type).toBe('error')
    const prompt = await request('prompt', {
      chatId: crypto.randomUUID(),
      text: 'Hello',
      model: data.models[0].id,
    })
    expect(prompt.error).toContain('Connect your ChatGPT account')
    const invalidImage = await request('prompt', {
      chatId: crypto.randomUUID(),
      text: '',
      model: data.models.find((model) => model.input.includes('image'))?.id,
      images: [{ data: 'not-base64', mimeType: 'image/png' }],
    })
    expect(invalidImage.error).toContain('Invalid base64 image data')
    const imageOnly = await request('prompt', {
      chatId: crypto.randomUUID(),
      text: '',
      model: data.models.find((model) => model.input.includes('image'))?.id,
      images: [{ data: Buffer.from('image fixture').toString('base64'), mimeType: 'image/png' }],
    })
    expect(imageOnly.error).toContain('Connect your ChatGPT account')
  } finally {
    reader.close()
    child.kill()
  }
}, 15_000)
