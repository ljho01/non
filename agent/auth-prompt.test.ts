import { expect, test } from 'bun:test'
import { automaticAuthPromptAnswer } from './auth-prompt'

test('subscription login automatically selects the browser flow', () => {
  const prompt = {
      type: 'select',
      message: 'Select login method',
      options: [
        { id: 'browser', label: 'Browser login' },
        { id: 'device_code', label: 'Device code login' },
      ],
    } as const

  expect(automaticAuthPromptAnswer('openai-codex', prompt)).toBe('browser')
  expect(automaticAuthPromptAnswer('claude-code', prompt)).toBe('browser')
})

test('API key providers and other auth prompts remain interactive', () => {
  expect(
    automaticAuthPromptAnswer('openai', {
      type: 'select',
      message: 'Select login method',
      options: [{ id: 'browser', label: 'Browser login' }],
    }),
  ).toBeUndefined()
  expect(
    automaticAuthPromptAnswer('openai-codex', {
      type: 'manual_code',
      message: 'Paste the redirect URL',
    }),
  ).toBeUndefined()
})
