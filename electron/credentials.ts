import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'

export type CredentialCrypto = {
  encrypt(value: string): Uint8Array
  decrypt(value: Buffer): string
}

type CredentialRecord = Record<string, Record<string, unknown>>

function credential(value: unknown): value is Record<string, unknown> {
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

function credentialRecord(value: unknown): CredentialRecord {
  if (!value || typeof value !== 'object') return {}
  if (credential(value)) return { 'openai-codex': value }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([providerId, item]) =>
      /^[a-z][a-z0-9-]{0,63}$/.test(providerId) && credential(item)
        ? [[providerId, item]]
        : [],
    ),
  )
}

export class EncryptedCredentialVault {
  private loaded: Promise<CredentialRecord> | null = null

  constructor(
    private readonly path: string,
    private readonly crypto: CredentialCrypto,
    private readonly legacyPath?: string,
  ) {}

  async read(providerId: string) {
    this.validateProvider(providerId)
    return (await this.values())[providerId]
  }

  async write(providerId: string, value: unknown) {
    this.validateProvider(providerId)
    if (!credential(value)) throw new Error('Invalid AI credential')
    const values = await this.values()
    values[providerId] = value
    await this.persist(values)
  }

  async delete(providerId: string) {
    this.validateProvider(providerId)
    const values = await this.values()
    delete values[providerId]
    if (Object.keys(values).length) await this.persist(values)
    else {
      await unlink(this.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }

  private validateProvider(providerId: string) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(providerId)) throw new Error('Invalid AI provider')
  }

  private values() {
    this.loaded ??= this.load()
    return this.loaded
  }

  private async load() {
    const encrypted = await readFile(this.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (encrypted) return credentialRecord(JSON.parse(this.crypto.decrypt(encrypted)) as unknown)
    if (!this.legacyPath) return {}

    const legacy = await readFile(this.legacyPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!legacy) return {}
    const migrated = credentialRecord(JSON.parse(legacy) as unknown)
    if (Object.keys(migrated).length) {
      await this.persist(migrated)
      await unlink(this.legacyPath)
    }
    return migrated
  }

  private async persist(values: CredentialRecord) {
    const temp = `${this.path}.${randomUUID()}.tmp`
    const encrypted = this.crypto.encrypt(JSON.stringify(values))
    await writeFile(temp, encrypted, { mode: 0o600 })
    await rename(temp, this.path)
  }
}
