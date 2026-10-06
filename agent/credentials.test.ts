import { expect, test } from 'bun:test'
import type { Credential } from '@earendil-works/pi-ai'
import { PersistentCredentialStore, type CredentialPersistence } from './credentials'

test('persistent credentials keep BYOK and subscriptions isolated by provider', async () => {
  const persisted = new Map<string, Credential>([
    [
      'openai-codex',
      { type: 'oauth', access: 'chatgpt-access', refresh: 'refresh', expires: Date.now() },
    ],
  ])
  const persistence: CredentialPersistence = {
    read: async (providerId) => persisted.get(providerId),
    write: async (providerId, credential) => {
      persisted.set(providerId, credential)
    },
    delete: async (providerId) => {
      persisted.delete(providerId)
    },
  }
  const store = new PersistentCredentialStore(persistence)
  await store.hydrate(['openai-codex', 'claude-code', 'openai', 'anthropic-api'])
  await store.modify('openai', async () => ({ type: 'api_key', key: 'sk-openai' }))
  await store.modify('anthropic-api', async () => ({ type: 'api_key', key: 'sk-ant-test' }))

  expect(await store.list()).toEqual([
    { providerId: 'openai-codex', type: 'oauth' },
    { providerId: 'openai', type: 'api_key' },
    { providerId: 'anthropic-api', type: 'api_key' },
  ])
  expect(JSON.stringify(await store.list())).not.toContain('sk-')

  await store.delete('openai')
  expect(await store.read('openai')).toBeUndefined()
  expect(await store.read('openai-codex')).toBeDefined()
  expect(await store.read('anthropic-api')).toBeDefined()
})
