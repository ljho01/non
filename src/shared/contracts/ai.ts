export const AI_PROVIDER_IDS = [
  'openai-codex',
  'claude-code',
  'openai',
  'anthropic-api',
] as const

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]
export type AiAuthType = 'api_key' | 'oauth'

export type AiProviderStatus = {
  id: AiProviderId
  name: string
  connected: boolean
  authType: AiAuthType | null
}

export type AiModel = {
  key: string
  id: string
  provider: AiProviderId
  providerName: string
  name: string
  input: ('text' | 'image')[]
}

export type AiStatus = {
  connected: boolean
  providers: AiProviderStatus[]
  models: AiModel[]
}

export function isAiProviderId(value: unknown): value is AiProviderId {
  return AI_PROVIDER_IDS.some((provider) => provider === value)
}

export function aiModelKey(provider: AiProviderId, model: string) {
  return `${provider}/${model}`
}

export function parseAiModelKey(value: string): { provider: AiProviderId; model: string } | null {
  const separator = value.indexOf('/')
  if (separator <= 0 || separator === value.length - 1) return null
  const provider = value.slice(0, separator)
  if (!isAiProviderId(provider)) return null
  return { provider, model: value.slice(separator + 1) }
}
