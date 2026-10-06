import { create } from 'zustand'
import { agentRequest, desktop, type AgentEvent } from '@/shared/api/desktop'
import {
  type AiModel,
  type AiProviderId,
  type AiProviderStatus,
  type AiStatus,
} from '@/shared/contracts/ai'
import { errorText } from '@/shared/lib/utils'

type Auth = AiStatus & {
  loadingProvider: AiProviderId | null
  loginUrl: string | null
  prompt: string | null
  error: string | null
  check: () => Promise<void>
  login: (provider?: 'openai-codex' | 'claude-code') => Promise<void>
  setApiKey: (provider: 'openai' | 'anthropic-api') => Promise<void>
  logout: (provider: AiProviderId) => Promise<void>
  answer: (code: string) => Promise<void>
  cancel: () => Promise<void>
}

const initialStatus: Pick<Auth, 'connected' | 'providers' | 'models'> = {
  connected: false,
  providers: [] satisfies AiProviderStatus[],
  models: [] satisfies AiModel[],
}

function openLoginUrl(value: string) {
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      (url.hostname === 'auth.openai.com' || url.hostname === 'claude.ai')
    )
      void desktop.openExternal(url.toString())
  } catch {
    // Keep malformed or untrusted targets inside the app.
  }
}

export const useAgent = create<Auth>((set) => {
  const authenticate = async (
    provider: AiProviderId,
    action: 'auth:login' | 'auth:api-key',
  ) => {
    set({ loadingProvider: provider, error: null, loginUrl: null, prompt: null })
    try {
      const status = await agentRequest<AiStatus>(action, { provider }, (event: AgentEvent) => {
        if (event.type === 'auth_url' && event.url) {
          set({ loginUrl: event.url })
          openLoginUrl(event.url)
        }
        if (event.type === 'auth_prompt')
          set({ prompt: event.message ?? '인증을 완료해 주세요.' })
      })
      set({ ...status, loginUrl: null, prompt: null })
    } catch (error) {
      set({ error: errorText(error) })
    } finally {
      set({ loadingProvider: null })
    }
  }

  return {
    ...initialStatus,
    loadingProvider: null,
    loginUrl: null,
    prompt: null,
    error: null,
    check: async () => {
      try {
        set({ ...(await agentRequest<AiStatus>('status')), error: null })
      } catch (error) {
        set({ error: errorText(error) })
      }
    },
    login: (provider = 'openai-codex') => authenticate(provider, 'auth:login'),
    setApiKey: (provider) => authenticate(provider, 'auth:api-key'),
    logout: async (provider) => {
      set({ loadingProvider: provider, error: null })
      try {
        set({ ...(await agentRequest<AiStatus>('auth:logout', { provider })) })
      } catch (error) {
        set({ error: errorText(error) })
      } finally {
        set({ loadingProvider: null })
      }
    },
    answer: async (code) => {
      await agentRequest('login:answer', code)
    },
    cancel: async () => {
      await agentRequest('login:cancel')
    },
  }
})
