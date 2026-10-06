import { expect, test } from 'bun:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EncryptedCredentialVault } from './credentials'

const crypto = {
  encrypt: (value: string) => Buffer.from(value).map((byte) => byte ^ 0x5a),
  decrypt: (value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0x5a)).toString('utf8'),
}

test('encrypted credential vault stores providers independently without plaintext', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'non-credentials-'))
  const path = join(directory, 'credentials.bin')
  const vault = new EncryptedCredentialVault(path, crypto)
  await vault.write('openai', { type: 'api_key', key: 'sk-openai-test' })
  await vault.write('claude-code', {
    type: 'oauth',
    access: 'sk-ant-oat-test',
    refresh: 'refresh-test',
    expires: Date.now() + 60_000,
  })

  expect(await vault.read('openai')).toEqual({ type: 'api_key', key: 'sk-openai-test' })
  expect(await vault.read('claude-code')).toMatchObject({ type: 'oauth' })
  expect((await readFile(path)).includes(Buffer.from('sk-openai-test'))).toBe(false)

  await vault.delete('openai')
  expect(await vault.read('openai')).toBeUndefined()
  expect(await vault.read('claude-code')).toBeDefined()
})

test('encrypted credential vault migrates the legacy ChatGPT credential', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'non-credentials-'))
  const path = join(directory, 'credentials.bin')
  const legacy = join(directory, 'credentials.json')
  await writeFile(
    legacy,
    JSON.stringify({
      type: 'oauth',
      access: 'legacy-access',
      refresh: 'legacy-refresh',
      expires: Date.now() + 60_000,
    }),
  )
  const vault = new EncryptedCredentialVault(path, crypto, legacy)
  expect(await vault.read('openai-codex')).toMatchObject({ access: 'legacy-access' })
  expect((await readFile(path)).includes(Buffer.from('legacy-access'))).toBe(false)
  await expect(readFile(legacy)).rejects.toMatchObject({ code: 'ENOENT' })
})
