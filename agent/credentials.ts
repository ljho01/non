import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from '@earendil-works/pi-ai'

export type CredentialPersistence = {
  read(providerId: string): Promise<Credential | undefined>
  write(providerId: string, credential: Credential): Promise<void>
  delete(providerId: string): Promise<void>
}

function validCredential(value: unknown): value is Credential {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.type === 'api_key') return typeof record.key === 'string'
  return (
    record.type === 'oauth' &&
    typeof record.access === 'string' &&
    typeof record.refresh === 'string' &&
    typeof record.expires === 'number'
  )
}

function operationSignal(options?: AuthOperationOptions) {
  const signal = options?.signal ?? new AbortController().signal
  signal.throwIfAborted()
  return signal
}

export class PersistentCredentialStore implements CredentialStore {
  private readonly values = new Map<string, Credential>()
  private readonly chains = new Map<string, Promise<void>>()

  constructor(private readonly persistence: CredentialPersistence) {}

  async hydrate(providerIds: readonly string[]) {
    const entries = await Promise.all(
      providerIds.map(async (providerId) => [providerId, await this.persistence.read(providerId)] as const),
    )
    for (const [providerId, credential] of entries)
      if (credential) this.values.set(providerId, credential)
  }

  async read(providerId: string, options?: AuthOperationOptions) {
    operationSignal(options)
    return this.values.get(providerId)
  }

  async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    operationSignal(options)
    return [...this.values].map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }))
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ) {
    return this.enqueue(providerId, async () => {
      const signal = operationSignal(options)
      const current = this.values.get(providerId)
      const next = await fn(current)
      signal.throwIfAborted()
      if (next !== undefined) {
        await this.persistence.write(providerId, next)
        signal.throwIfAborted()
        this.values.set(providerId, next)
        return next
      }
      return current
    })
  }

  delete(providerId: string, options?: AuthOperationOptions) {
    return this.enqueue(providerId, async () => {
      const signal = operationSignal(options)
      await this.persistence.delete(providerId)
      signal.throwIfAborted()
      this.values.delete(providerId)
    })
  }

  private enqueue<T>(providerId: string, operation: () => Promise<T>) {
    const previous = this.chains.get(providerId) ?? Promise.resolve()
    const queued = previous.catch(() => undefined).then(operation)
    const tail = queued.then(
      () => undefined,
      () => undefined,
    )
    this.chains.set(providerId, tail)
    void tail.then(() => {
      if (this.chains.get(providerId) === tail) this.chains.delete(providerId)
    })
    return queued
  }
}

type ParentPort = {
  postMessage(value: unknown): void
}

type ParentReply = {
  type: 'credential:result'
  requestId: string
  data?: unknown
  error?: string
}

export class ParentCredentialPersistence implements CredentialPersistence {
  private readonly waiting = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()

  constructor(private readonly port: ParentPort) {}

  handle(value: unknown) {
    if (!value || typeof value !== 'object') return false
    const reply = value as Partial<ParentReply>
    if (reply.type !== 'credential:result' || typeof reply.requestId !== 'string') return false
    const pending = this.waiting.get(reply.requestId)
    if (!pending) return true
    this.waiting.delete(reply.requestId)
    if (reply.error) pending.reject(new Error(reply.error))
    else pending.resolve(reply.data)
    return true
  }

  async read(providerId: string) {
    const value = await this.request('read', providerId)
    return validCredential(value) ? value : undefined
  }

  async write(providerId: string, credential: Credential) {
    await this.request('write', providerId, credential)
  }

  async delete(providerId: string) {
    await this.request('delete', providerId)
  }

  private request(action: 'read' | 'write' | 'delete', providerId: string, credential?: Credential) {
    const requestId = randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      this.waiting.set(requestId, { resolve, reject })
      this.port.postMessage({
        type: 'credential:request',
        requestId,
        action,
        providerId,
        ...(credential ? { credential } : {}),
      })
    })
  }
}

export function fileCredentialPersistence(dataDir: string): CredentialPersistence {
  const path = join(dataDir, 'credentials.json')
  let loaded: Promise<Map<string, Credential>> | null = null

  const values = () => {
    loaded ??= readFile(path, 'utf8')
      .then((text) => {
        const parsed = JSON.parse(text) as unknown
        if (validCredential(parsed)) return new Map([['openai-codex', parsed]])
        if (!parsed || typeof parsed !== 'object') return new Map<string, Credential>()
        return new Map(
          Object.entries(parsed as Record<string, unknown>).flatMap(([providerId, credential]) =>
            validCredential(credential) ? [[providerId, credential] as const] : [],
          ),
        )
      })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return new Map<string, Credential>()
        throw error
      })
    return loaded
  }

  const persist = async (entries: Map<string, Credential>) => {
    const temp = `${path}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify(Object.fromEntries(entries)), { mode: 0o600 })
    await rename(temp, path)
  }

  return {
    read: async (providerId) => (await values()).get(providerId),
    write: async (providerId, credential) => {
      const entries = await values()
      entries.set(providerId, credential)
      await persist(entries)
    },
    delete: async (providerId) => {
      const entries = await values()
      entries.delete(providerId)
      if (entries.size) await persist(entries)
      else await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    },
  }
}
