import type { AuthPrompt } from '@earendil-works/pi-ai'
import type { AiProviderId } from '../src/shared/contracts/ai'

const BROWSER_LOGIN_OPTION = 'browser'
const SUBSCRIPTION_PROVIDERS = new Set<AiProviderId>(['openai-codex', 'claude-code'])

export function automaticAuthPromptAnswer(
  providerId: AiProviderId,
  prompt: AuthPrompt,
): string | undefined {
  if (!SUBSCRIPTION_PROVIDERS.has(providerId) || prompt.type !== 'select') return undefined
  return prompt.options.some((option) => option.id === BROWSER_LOGIN_OPTION)
    ? BROWSER_LOGIN_OPTION
    : undefined
}
