import { create } from 'zustand'
import { desktop } from '@/shared/api/desktop'
import { errorText } from '@/shared/lib/utils'
import type {
  TranscriptionLanguage,
  TranscriptionRuntimeStatus,
  TranscriptionSession,
} from '@/shared/contracts/transcription'

type TranscriptionState = {
  sessions: TranscriptionSession[]
  openIds: string[]
  activeId: string | null
  runtime: TranscriptionRuntimeStatus | null
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  create: (language: TranscriptionLanguage, folder?: string) => Promise<void>
  createLive: (language: TranscriptionLanguage, folder?: string) => Promise<void>
  rename: (id: string, name: string) => Promise<TranscriptionSession>
  move: (id: string, folder: string) => Promise<TranscriptionSession>
  remove: (id: string) => Promise<void>
  archive: (id: string) => Promise<void>
  setLanguage: (id: string, language: TranscriptionLanguage) => Promise<void>
  open: (id: string) => void
  close: (id: string) => void
  deactivate: () => void
  start: (id: string) => Promise<void>
  retranscribe: (id: string) => Promise<void>
  stop: (id: string) => Promise<void>
  installRuntime: () => Promise<void>
  clearError: () => void
}

let subscribed = false

function updateSession(sessions: TranscriptionSession[], session: TranscriptionSession) {
  const next = sessions.some((item) => item.id === session.id)
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [session, ...sessions]
  return next.sort((left, right) => right.createdAt - left.createdAt)
}

export const useTranscription = create<TranscriptionState>((set, get) => ({
  sessions: [],
  openIds: [],
  activeId: null,
  runtime: null,
  loading: false,
  error: null,
  initialize: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    if (!subscribed) {
      subscribed = true
      desktop.transcription.onEvent((event) => {
        if (event.type === 'runtime') set({ runtime: event.runtime })
        else if (event.type === 'removed')
          set((state) => ({
            sessions: state.sessions.filter((session) => session.id !== event.id),
            openIds: state.openIds.filter((id) => id !== event.id),
            activeId: state.activeId === event.id ? null : state.activeId,
          }))
        else set((state) => ({ sessions: updateSession(state.sessions, event.session) }))
      })
    }
    try {
      const [sessions, runtime] = await Promise.all([
        desktop.transcription.list(),
        desktop.transcription.runtimeStatus(),
      ])
      set({ sessions, runtime })
    } catch (error) {
      set({ error: errorText(error) })
    } finally {
      set({ loading: false })
    }
  },
  create: async (language, folder = '') => {
    try {
      const session = await desktop.transcription.create(language, folder)
      if (!session) return
      set((state) => ({
        sessions: updateSession(state.sessions, session),
        openIds: state.openIds.includes(session.id)
          ? state.openIds
          : [...state.openIds, session.id],
        activeId: session.id,
        error: null,
      }))
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  createLive: async (language, folder = '') => {
    try {
      const session = await desktop.transcription.createLive(language, folder)
      set((state) => ({
        sessions: updateSession(state.sessions, session),
        openIds: state.openIds.includes(session.id)
          ? state.openIds
          : [...state.openIds, session.id],
        activeId: session.id,
        error: null,
      }))
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  rename: async (id, name) => {
    const session = await desktop.transcription.rename(id, name)
    set((state) => ({ sessions: updateSession(state.sessions, session), error: null }))
    return session
  },
  move: async (id, folder) => {
    const session = await desktop.transcription.move(id, folder)
    set((state) => ({ sessions: updateSession(state.sessions, session), error: null }))
    return session
  },
  remove: async (id) => {
    try {
      await desktop.transcription.remove(id)
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== id),
        openIds: state.openIds.filter((openId) => openId !== id),
        activeId: state.activeId === id ? null : state.activeId,
        error: null,
      }))
    } catch (error) {
      set({ error: errorText(error) })
      throw error
    }
  },
  archive: async (id) => {
    try {
      await desktop.transcription.archive(id)
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== id),
        openIds: state.openIds.filter((openId) => openId !== id),
        activeId: state.activeId === id ? null : state.activeId,
        error: null,
      }))
    } catch (error) {
      set({ error: errorText(error) })
      throw error
    }
  },
  setLanguage: async (id, language) => {
    try {
      const session = await desktop.transcription.setLanguage(id, language)
      set((state) => ({ sessions: updateSession(state.sessions, session), error: null }))
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  open: (id) =>
    set((state) => ({
      openIds: state.openIds.includes(id) ? state.openIds : [...state.openIds, id],
      activeId: id,
    })),
  close: (id) =>
    set((state) => {
      const index = state.openIds.indexOf(id)
      const openIds = state.openIds.filter((openId) => openId !== id)
      return {
        openIds,
        activeId:
          state.activeId === id
            ? (openIds[Math.min(index, openIds.length - 1)] ?? null)
            : state.activeId,
      }
    }),
  deactivate: () => set({ activeId: null }),
  start: async (id) => {
    try {
      const session = await desktop.transcription.start(id)
      set((state) => ({ sessions: updateSession(state.sessions, session), error: null }))
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  retranscribe: async (id) => {
    try {
      const session = await desktop.transcription.retranscribe(id)
      set((state) => ({ sessions: updateSession(state.sessions, session), error: null }))
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  stop: async (id) => {
    try {
      const session = await desktop.transcription.stop(id)
      set((state) => ({ sessions: updateSession(state.sessions, session), error: null }))
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  installRuntime: async () => {
    try {
      const runtime = await desktop.transcription.installRuntime()
      set({ runtime, error: null })
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  clearError: () => set({ error: null }),
}))
