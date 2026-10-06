import { expect, test } from 'bun:test'
import { aiModelKey, parseAiModelKey } from '../ai'

test('AI model keys keep credential providers distinct', () => {
  expect(aiModelKey('openai-codex', 'gpt-6-astra')).toBe('openai-codex/gpt-6-astra')
  expect(parseAiModelKey('claude-code/claude-sonnet-5')).toEqual({
    provider: 'claude-code',
    model: 'claude-sonnet-5',
  })
  expect(parseAiModelKey('unknown/model')).toBeNull()
  expect(parseAiModelKey('openai/')).toBeNull()
})
