import { useCallback, useEffect, useRef, useState } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { useChat, type UIMessage } from '@tanstack/ai-react'
import type { MultimodalContent } from '@tanstack/ai-client'
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  History,
  MessageSquare,
  Plus,
  Sparkles,
  Square,
  X,
} from '@/shared/ui/icon'
import { useVault } from '@/entities/vault'
import { useAgent } from '@/entities/agent'
import { useSettings } from '@/entities/settings'
import { agentRequest } from '@/shared/api/desktop'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Spinner } from '@/shared/ui/spinner'
import { Tip } from '@/shared/ui/tooltip'
import { Markdown } from '@/shared/ui/markdown'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { cn, errorText } from '@/shared/lib/utils'
import { PointerSensorPlugin } from '@/shared/lib/pointer-sensor'
import { RestrictToHorizontalAxis } from '@/shared/lib/restrict-to-horizontal-axis'
import { noteText, parseNote } from '@/shared/contracts/note'
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MAX_COUNT,
  CHAT_IMAGE_MAX_TOTAL_BYTES,
  CHAT_IMAGE_MIME_TYPES,
  type ChatImage,
  type ChatImageMimeType,
} from '@/shared/contracts/chat'
import {
  closeChatTab,
  newChatTab,
  openChatTab,
  parseChatTabSession,
  reorderChatTab,
  serializeChatTabSession,
  type ChatTabDescriptor,
  type ChatTabSession,
} from '../model/chat-tabs'
import { piConnection } from '../model/pi-connection'
import { ChatComposer } from './chat-composer'
import { useI18n } from '@/shared/lib/i18n'

type StoredMessage = { role: 'user' | 'assistant'; text: string; images?: ChatImage[] }
type Chat = { id: string; title: string; updated: number }
type DraftImage = ChatImage & { id: string; name: string; size: number }

type ChatTabDragData = Record<string, unknown> & {
  type: 'chat-tab'
  chatId: string
}

const MIME_BY_EXTENSION: Record<string, ChatImageMimeType> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function modelDisplayName(name: string) {
  return name.replace(/^(?:GPT|Claude)[\s-]+/i, '')
}

function storedMessagesToUI(messages: StoredMessage[]): UIMessage[] {
  return messages.map((message, index) => {
    const parts: UIMessage['parts'] = []
    if (message.text) parts.push({ type: 'text', content: message.text })
    for (const image of message.images ?? [])
      parts.push({
        type: 'image',
        source: { type: 'data', value: image.data, mimeType: image.mimeType },
      })
    return { id: `stored-${index}-${message.role}`, role: message.role, parts }
  })
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('')
}

function messageImages(message: UIMessage): ChatImage[] {
  return message.parts.flatMap((part) => {
    if (part.type !== 'image' || part.source.type !== 'data') return []
    if (!CHAT_IMAGE_MIME_TYPES.includes(part.source.mimeType as ChatImageMimeType)) return []
    return [{ data: part.source.value, mimeType: part.source.mimeType as ChatImageMimeType }]
  })
}

function readDraftImage(file: File) {
  return new Promise<DraftImage>((resolve, reject) => {
    const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
    const mimeType = CHAT_IMAGE_MIME_TYPES.includes(file.type as ChatImageMimeType)
      ? (file.type as ChatImageMimeType)
      : MIME_BY_EXTENSION[extension]
    if (!mimeType) {
      reject(new Error('PNG, JPEG, WebP, GIF 이미지만 첨부할 수 있습니다.'))
      return
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      reject(new Error('이미지 하나는 10MB를 넘을 수 없습니다.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.includes(',')) {
        reject(new Error('이미지를 읽지 못했습니다.'))
        return
      }
      resolve({
        id: crypto.randomUUID(),
        name: file.name || '이미지',
        size: file.size,
        data: reader.result.slice(reader.result.indexOf(',') + 1),
        mimeType,
      })
    }
    reader.readAsDataURL(file)
  })
}

function initialChatSession(root: string | null): ChatTabSession {
  const fallback = newChatTab()
  if (!root || typeof localStorage === 'undefined') {
    return { tabs: [fallback], activeId: fallback.id }
  }
  const saved = parseChatTabSession(localStorage.getItem(`non-flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none:${root}`))
  if (saved) return saved

  const legacyId = localStorage.getItem(`non-chat:${root}`)
  const legacy = legacyId
    ? parseChatTabSession(
        JSON.stringify({
          openedChatIds: [legacyId],
          activeChatId: legacyId,
          titles: {},
          newChatIds: [],
        }),
      )
    : null
  return legacy ?? { tabs: [fallback], activeId: fallback.id }
}

function isChatTabDragData(value: unknown): value is ChatTabDragData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return data.type === 'chat-tab' && typeof data.chatId === 'string'
}

function SortableChatTab({
  tab,
  index,
  active,
  streaming,
  closable,
  onActivate,
  onClose,
}: {
  tab: ChatTabDescriptor
  index: number
  active: boolean
  streaming: boolean
  closable: boolean
  onActivate: () => void
  onClose: () => void
}) {
  const sortable = useSortable<ChatTabDragData>({
    id: tab.id,
    index,
    group: 'chat-tabs',
    type: 'chat-tab',
    accept: 'chat-tab',
    data: { type: 'chat-tab', chatId: tab.id },
    transition: { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  })

  return (
    <div
      ref={sortable.ref}
      className={cn(
        'document-tab relative flex h-7 w-max min-w-[100px] max-w-[220px] flex-none rounded-lg text-muted-foreground data-[dragging]:z-4 data-[dragging]:opacity-45 data-[dragging]:shadow-[0_8px_20px_#0000001a]',
        active && 'selected bg-muted text-foreground',
      )}
      data-document-tab-active={active || undefined}
      data-dragging={sortable.isDragging || undefined}
      data-drop-target={sortable.isDropTarget || undefined}
      onMouseDown={onActivate}
    >
      <Button
        ref={sortable.handleRef}
        unstyled
        className="document-tab-handle cursor-default touch-none flex items-center flex-1 min-w-0 gap-1.5 px-2.5 text-xs text-left"
        role="tab"
        aria-selected={active}
        aria-busy={streaming || undefined}
        title={tab.title}
      >
        {streaming ? (
          <Spinner className="size-[11px] flex-none" />
        ) : (
          <MessageSquare size={14} className="flex-none" />
        )}
        <span className="truncate">{tab.title}</span>
      </Button>
      {closable && (
        <Button
          unstyled
          className="document-tab-close absolute z-[2] top-[3px] right-[3px] grid size-[22px] place-items-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground"
          aria-label={`${tab.title} 탭 닫기`}
          disabled={streaming}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <X size={12} />
        </Button>
      )}
    </div>
  )
}

export function AssistantPanel({
  className,
  onSettings,
  onBusy,
}: {
  className?: string
  onSettings: () => void
  onBusy: (busy: boolean) => void
}) {
  const { t } = useI18n()
  const root = useVault((state) => state.path)
  const [session, setSession] = useState<ChatTabSession>(() => initialChatSession(root))
  const [history, setHistory] = useState<Chat[]>([])
  const [runningChatId, setRunningChatId] = useState<string | null>(null)
  const [tabbarOverflowRight, setTabbarOverflowRight] = useState(false)
  const tabbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!root) return
    localStorage.setItem(`non-flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none:${root}`, serializeChatTabSession(session))
    localStorage.setItem(`non-chat:${root}`, session.activeId)
  }, [root, session])

  useEffect(() => {
    if (!root) return
    let cancelled = false
    void agentRequest<Chat[]>('chat:list')
      .then((items) => {
        if (cancelled) return
        setHistory(items)
        const byId = new Map(items.map((chat) => [chat.id, chat]))
        setSession((current) => ({
          ...current,
          tabs: current.tabs.map((tab) => {
            const saved = byId.get(tab.id)
            return saved ? { ...tab, title: saved.title, isNew: false } : tab
          }),
        }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [root])

  useEffect(
    () => () => {
      onBusy(false)
    },
    [onBusy],
  )

  useEffect(() => {
    const tabbar = tabbarRef.current
    if (!tabbar) {
      setTabbarOverflowRight(false)
      return
    }
    const updateOverflow = () => {
      const overflowRight = tabbar.scrollLeft + tabbar.clientWidth < tabbar.scrollWidth - 1
      setTabbarOverflowRight((current) =>
        current === overflowRight ? current : overflowRight,
      )
    }
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(tabbar)
    for (const child of tabbar.children) observer.observe(child)
    tabbar.addEventListener('scroll', updateOverflow, { passive: true })
    updateOverflow()
    return () => {
      observer.disconnect()
      tabbar.removeEventListener('scroll', updateOverflow)
    }
  }, [session.tabs.length])

  const refreshHistory = useCallback((items: Chat[]) => {
    setHistory(items)
    const byId = new Map(items.map((chat) => [chat.id, chat]))
    setSession((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => {
        const saved = byId.get(tab.id)
        return saved ? { ...tab, title: saved.title, isNew: false } : tab
      }),
    }))
  }, [])

  const updateTab = useCallback(
    (id: string, update: Partial<Pick<ChatTabDescriptor, 'title' | 'isNew'>>) => {
      setSession((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => (tab.id === id ? { ...tab, ...update } : tab)),
      }))
    },
    [],
  )

  const setRuntimeBusy = useCallback(
    (id: string, busy: boolean) => {
      setRunningChatId((current) => (busy ? id : current === id ? null : current))
      onBusy(busy)
    },
    [onBusy],
  )

  const createChat = () => {
    if (runningChatId) return
    const tab = newChatTab()
    setSession((current) => openChatTab(current, tab))
  }

  const closeTab = (id: string) => {
    if (runningChatId === id) return
    const fallback = newChatTab()
    setSession((current) => closeChatTab(current, id, fallback))
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-l border-border bg-workspace-surface',
        className,
      )}
    >
      <header className="flex h-11 min-h-11 items-center gap-1.5 overflow-hidden pr-(--right-sidebar-toggle-gutter) pl-2 text-xs select-none">
        <DragDropProvider
          sensors={[PointerSensorPlugin]}
          modifiers={[RestrictToHorizontalAxis]}
          onDragEnd={(event) => {
            if (event.canceled) return
            const { source } = event.operation
            if (!isSortable(source) || !isChatTabDragData(source.data)) return
            setSession((current) => reorderChatTab(current, source.data.chatId, source.index))
          }}
        >
          <div className="relative flex h-[30px] min-w-0 flex-1 overflow-hidden">
            <div
              ref={tabbarRef}
              className="flex h-[30px] min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] data-[overflow-right]:[mask-image:linear-gradient(to_right,#000_0,#000_calc(100%_-_28px),transparent_100%)] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="열린 AI 대화"
              data-overflow-right={tabbarOverflowRight || undefined}
            >
              {session.tabs.map((tab, index) => (
                <SortableChatTab
                  key={tab.id}
                  tab={tab}
                  index={index}
                  active={session.activeId === tab.id}
                  streaming={runningChatId === tab.id}
                  closable={session.tabs.length > 1 || !tab.isNew}
                  onActivate={() => setSession((current) => ({ ...current, activeId: tab.id }))}
                  onClose={() => closeTab(tab.id)}
                />
              ))}
            </div>
          </div>
        </DragDropProvider>
        <div className="flex flex-none items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-[26px]"
              aria-label={t('대화 기록')}
                disabled={Boolean(runningChatId)}
              >
                <History />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('이 폴더의 대화')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {history.map((chat) => (
                <DropdownMenuItem
                  key={chat.id}
                  onSelect={() =>
                    setSession((current) =>
                      openChatTab(current, { id: chat.id, title: chat.title, isNew: false }),
                    )
                  }
                >
                  <MessageSquare />
                  <span className="max-w-56 truncate">{chat.title}</span>
                </DropdownMenuItem>
              ))}
              {!history.length && (
                <DropdownMenuItem disabled>
                  {t('저장된 대화가 없습니다.')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tip label={t('새 대화')}>
            <Button
              variant="ghost"
              size="icon"
              className="size-[26px]"
              aria-label={t('새 대화')}
              disabled={Boolean(runningChatId)}
              onClick={createChat}
            >
              <Plus />
            </Button>
          </Tip>
        </div>
      </header>
      {session.tabs.map((tab) => (
        <ChatRuntime
          key={tab.id}
          tab={tab}
          active={session.activeId === tab.id}
          busyElsewhere={Boolean(runningChatId && runningChatId !== tab.id)}
          onSettings={onSettings}
          onBusy={(busy) => setRuntimeBusy(tab.id, busy)}
          onTitle={(title) => updateTab(tab.id, { title })}
          onSaved={() => updateTab(tab.id, { isNew: false })}
          onHistory={refreshHistory}
        />
      ))}
    </aside>
  )
}

function ChatRuntime({
  tab,
  active,
  busyElsewhere,
  onSettings,
  onBusy,
  onTitle,
  onSaved,
  onHistory,
}: {
  tab: ChatTabDescriptor
  active: boolean
  busyElsewhere: boolean
  onSettings: () => void
  onBusy: (busy: boolean) => void
  onTitle: (title: string) => void
  onSaved: () => void
  onHistory: (items: Chat[]) => void
}) {
  const { t } = useI18n()
  const root = useVault((state) => state.path)
  const folder = useVault((state) => state.selectedFolder)
  const doc = useVault((state) => state.tabs.find((item) => item.path === state.active))
  const connected = useAgent((state) => state.connected)
  const models = useAgent((state) => state.models)
  const providers = useAgent((state) => state.providers)
  const selectedModel = useSettings((state) => state.selectedModel)
  const agentSandbox = useSettings((state) => state.agentSandbox)
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<DraftImage[]>([])
  const [loading, setLoading] = useState(false)
  const [includeDoc, setIncludeDoc] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [activity, setActivity] = useState('')
  const [composerMultiline, setComposerMultiline] = useState(false)
  const loadOnMount = useRef(!tab.isNew)
  const scroll = useRef<HTMLDivElement>(null)
  const onBusyRef = useRef(onBusy)
  onBusyRef.current = onBusy
  const {
    messages,
    setMessages,
    sendMessage,
    isLoading: busy,
    error: chatError,
    stop,
  } = useChat({
    connection: piConnection,
    threadId: tab.id,
    queue: 'drop',
    onChunk: (chunk) => {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') setActivity('')
    },
    onCustomEvent: (name, value) => {
      if (name === 'non:activity' && typeof value === 'string') setActivity(value)
      if (name === 'non:memory-saved' && typeof value === 'string')
        setActivity(`기억했습니다: ${value}`)
      if (name === 'non:stream-error' && typeof value === 'string') setLocalError(value)
    },
    onFinish: () => {
      setActivity('')
      onSaved()
      void agentRequest<Chat[]>('chat:list').then(onHistory).catch(() => undefined)
    },
    onError: (nextError) => {
      setActivity('')
      setLocalError(errorText(nextError))
    },
  })
  const connectedProviders = new Set(
    providers.filter((provider) => provider.connected).map((provider) => provider.id),
  )
  const availableModels = models.filter((model) => connectedProviders.has(model.provider))
  const configuredModel = availableModels.find(
    (model) => model.key === selectedModel || model.id === selectedModel,
  )
  const textModel = configuredModel ?? availableModels[0]
  const imageModel =
    (configuredModel?.input.includes('image') ? configuredModel : undefined) ??
    availableModels.find((model) => model.input.includes('image'))
  const conversationHasImages = messages.some((message) => messageImages(message).length > 0)
  const requestModel = images.length || conversationHasImages ? imageModel : textModel
  const selectedModelName = requestModel?.name ?? configuredModel?.name
  const canAddImages = !availableModels.length || Boolean(imageModel?.input.includes('image'))

  useEffect(() => {
    onBusyRef.current(busy)
    return () => {
      if (busy) onBusyRef.current(false)
    }
  }, [busy])

  useEffect(() => {
    if (!root || !loadOnMount.current) return
    let cancelled = false
    setLoading(true)
    void agentRequest<StoredMessage[]>('chat:load', tab.id)
      .then((items) => {
        if (!cancelled) setMessages(storedMessagesToUI(items))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [root, tab.id])

  useEffect(() => {
    if (active && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [active, messages, activity])

  const addImages = async (files: File[]) => {
    if (!files.length || busy) return
    if (!canAddImages) {
      setLocalError(
        '현재 모델은 이미지 입력을 지원하지 않습니다. 설정에서 이미지 모델을 선택해 주세요.',
      )
      return
    }
    if (images.length + files.length > CHAT_IMAGE_MAX_COUNT) {
      setLocalError(`이미지는 한 번에 ${CHAT_IMAGE_MAX_COUNT}개까지 첨부할 수 있습니다.`)
      return
    }
    const totalBytes =
      images.reduce((total, image) => total + image.size, 0) +
      files.reduce((total, file) => total + file.size, 0)
    if (totalBytes > CHAT_IMAGE_MAX_TOTAL_BYTES) {
      setLocalError('한 메시지의 이미지는 합계 20MB를 넘을 수 없습니다.')
      return
    }
    try {
      const next = await Promise.all(files.map(readDraftImage))
      setImages((current) => [...current, ...next])
      setLocalError(null)
    } catch (nextError) {
      setLocalError(errorText(nextError))
    }
  }

  const send = async (text = draft) => {
    if ((!text.trim() && !images.length) || busy || busyElsewhere || !root) return
    if (!connected) {
      onSettings()
      return
    }
    if (!requestModel) {
      setLocalError('설정에서 사용할 AI 모델을 선택해 주세요.')
      return
    }
    if ((images.length || conversationHasImages) && !requestModel.input.includes('image')) {
      setLocalError(
        '현재 모델은 이미지 입력을 지원하지 않습니다. 설정에서 이미지 모델을 선택해 주세요.',
      )
      return
    }

    const previousMessages = messages
    const outgoingImages = images
    const nextTitle =
      messages.length === 0
        ? text.trim().replace(/\s+/g, ' ').slice(0, 60) || '이미지 대화'
        : tab.title
    onTitle(nextTitle)
    setDraft('')
    setImages([])
    setLocalError(null)
    setActivity(t('생각하는 중'))

    try {
      const context =
        includeDoc && doc
          ? doc.kind === 'note'
            ? `${doc.path}\n${noteText(parseNote(doc.content)).slice(0, 70_000)}`
            : doc.kind === 'legacy'
              ? `${doc.path}\n${doc.content.slice(0, 70_000)}`
              : `${doc.path}, page ${doc.page}\n${doc.pdfText.slice(0, 70_000)}`
          : undefined
      const contentParts: Exclude<MultimodalContent['content'], string> = []
      if (text.trim()) contentParts.push({ type: 'text', content: text })
      for (const image of outgoingImages)
        contentParts.push({
          type: 'image',
          source: { type: 'data', value: image.data, mimeType: image.mimeType },
        })
      await sendMessage(outgoingImages.length ? { content: contentParts } : text, {
        whenBusy: 'drop',
        body: {
          chatId: tab.id,
          text,
          model: requestModel.key,
          context,
          folder,
          sandboxed: agentSandbox,
          images: outgoingImages.map(({ data, mimeType }) => ({ data, mimeType })),
        },
      })
    } catch (nextError) {
      setMessages(previousMessages)
      setDraft(text)
      setImages(outgoingImages)
      setLocalError(errorText(nextError))
    } finally {
      setActivity('')
    }
  }

  const error = localError ?? chatError?.message ?? null
  const composerExpanded = composerMultiline || images.length > 0 || (includeDoc && !!doc)

  return (
    <section className="flex flex-1 min-w-0 min-h-0 flex-col" hidden={!active} aria-label={tab.title}>
      <div className="flex-1 min-h-0 overflow-auto" ref={scroll}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 min-h-40 text-muted-foreground text-xs">
            <Spinner />
            {t('대화 불러오는 중')}
          </div>
        ) : messages.length > 0 ? (
          <div className="px-4 pt-5 pb-6">
            {messages.map((message, index) => {
              const text = messageText(message)
              const messageImageList = messageImages(message)
              const isUser = message.role === 'user'
              const sameAsNext = messages[index + 1]?.role === message.role
              const imagesOnly = messageImageList.length > 0 && !text
              return (
                <div
                  className={cn(
                    'flex',
                    isUser ? 'justify-end' : 'justify-start',
                    isUser ? (sameAsNext ? 'mb-0.5' : 'mb-3') : sameAsNext ? 'mb-1.5' : 'mb-5',
                  )}
                  key={message.id}
                >
                  <div
                    className={cn(
                      isUser
                        ? cn(
                            'chat-bubble chat-user relative w-fit max-w-[78%] break-words bg-chat-user text-chat-user-foreground text-sm leading-normal',
                            imagesOnly ? 'p-0.5' : 'rounded-[19px] px-3.5 py-2',
                          )
                        : 'chat-plain w-full min-w-0 break-words text-sm leading-relaxed',
                    )}
                    data-anim={!message.id.startsWith('stored-') || undefined}
                    data-tail={(isUser && !sameAsNext && !imagesOnly) || undefined}
                  >
                    {!!messageImageList.length && (
                      <div
                        className={cn(
                          'grid grid-cols-2 gap-1 [&>img]:max-h-[220px] [&>img]:w-full [&>img]:rounded-[15px] [&>img]:bg-muted [&>img]:object-cover [&>img:only-child]:col-span-full [&>img:only-child]:object-contain',
                          text && 'mb-1.5',
                        )}
                      >
                        {messageImageList.map((image, imageIndex) => (
                          <img
                            alt={`첨부 이미지 ${imageIndex + 1}`}
                            key={`${message.id}-${imageIndex}`}
                            src={`data:${image.mimeType};base64,${image.data}`}
                          />
                        ))}
                      </div>
                    )}
                    {text && <Markdown text={text} />}
                  </div>
                </div>
              )
            })}
            {busy && messages.at(-1)?.role !== 'assistant' && (
              <div className="chat-plain" data-anim role="status" aria-label={activity || t('답변 작성 중')}>
                <span className="chat-typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
            {busy && activity && (
              <div className="mt-1.5 text-2xs text-muted-foreground">{activity}</div>
            )}
          </div>
        ) : null}
      </div>
      {error && (
        <Alert variant="destructive" className="mx-4 mb-3 w-auto">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="px-2.5 pt-2 pb-3">
        <form
          className={cn(
            '@container flex flex-col border border-border bg-muted/82 p-1 shadow-[0_1px_2px_#0000000a,inset_0_1px_color-mix(in_srgb,var(--foreground)_3%,transparent)] transition-[border-radius,border-color,box-shadow] duration-150 focus-within:border-ring/62 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_12%,transparent),inset_0_1px_color-mix(in_srgb,var(--foreground)_4%,transparent)]',
            composerExpanded ? 'rounded-[20px]' : 'rounded-full',
          )}
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault()
          }}
          onDrop={(event) => {
            const files = Array.from(event.dataTransfer.files)
            if (!files.length) return
            event.preventDefault()
            void addImages(files)
          }}
        >
          {includeDoc && doc && (
            <Badge variant="outline" className="flex self-start gap-1.5 items-center w-max max-w-[calc(100%-8px)] mx-1 mt-0.5 mb-1 px-1.5 py-1 border border-border rounded-full text-muted-foreground text-xs bg-background/72">
              <FileText size={12} />
              <span className="truncate">
                {doc.path.split('/').at(-1)}
                {doc.kind === 'pdf' ? ` · p.${doc.page}` : ''}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="-my-[3px] -mr-[5px] ml-0.5 size-[18px] rounded-full"
                type="button"
                aria-label="문서 문맥 제외"
                onClick={() => setIncludeDoc(false)}
              >
                <X size={11} />
              </Button>
            </Badge>
          )}
          {!!images.length && (
            <div className="flex gap-2 overflow-x-auto mx-1 mt-1 mb-0.5" aria-label="첨부할 이미지">
              {images.map((image) => (
                <div
                  className="relative size-16 flex-none [&>img]:size-full [&>img]:rounded-[11px] [&>img]:border [&>img]:border-border [&>img]:bg-muted [&>img]:object-cover"
                  key={image.id}
                >
                  <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} />
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute -top-[5px] -right-[5px] size-[19px] rounded-full shadow-[0_2px_8px_#0002] [&>svg]:size-[11px]"
                    type="button"
                    aria-label={`${image.name} 제거`}
                    onClick={() =>
                      setImages((current) => current.filter((item) => item.id !== image.id))
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex min-w-0 items-end">
            <ChatComposer
              placeholder={root ? t('질문하거나, 생각을 적어 보세요…') : t('먼저 폴더를 추가해 주세요')}
              value={draft}
              disabled={!root || busy}
              onChange={setDraft}
              onSubmit={() => void send()}
              onPasteImages={(files) => void addImages(files)}
              onMultiline={setComposerMultiline}
            />
            <div className="flex min-w-0 flex-none items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    unstyled
                    className="flex h-7 min-w-0 max-w-[120px] items-center gap-1 rounded-full px-2 text-foreground text-sm font-medium hover:bg-accent data-[state=open]:bg-accent @max-[300px]:size-7 @max-[300px]:px-0 @max-[300px]:justify-center"
                    type="button"
                    aria-label={`AI 모델 선택, ${selectedModelName ? modelDisplayName(selectedModelName) : '선택 안 됨'}`}
                    title={selectedModelName ? modelDisplayName(selectedModelName) : 'AI 모델 선택'}
                    disabled={busy}
                  >
                    <Sparkles size={16} className="flex-none" />
                    <span className="truncate @max-[300px]:hidden">
                      {selectedModelName ? modelDisplayName(selectedModelName) : t('모델 선택')}
                    </span>
                    <ChevronDown size={14} className="@max-[300px]:hidden" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-72">
                  <DropdownMenuLabel>{t('AI 모델')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableModels.length ? (
                    availableModels.map((model) => (
                      <DropdownMenuItem
                        key={model.key}
                        onSelect={() => useSettings.getState().patch({ selectedModel: model.key })}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {modelDisplayName(model.name)}
                        </span>
                        {configuredModel?.key === model.key && <Check />}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem onSelect={onSettings}>{t('AI 계정 연결')}</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {busy ? (
                <Button
                  size="icon"
                  variant="secondary"
                  className="size-7 flex-none rounded-full transition-transform active:scale-90"
                  type="button"
                  aria-label={t('응답 중지')}
                  onClick={stop}
                >
                  <Square className="fill-current !size-3" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  type="submit"
                  className="size-7 flex-none rounded-full transition-transform active:scale-90"
                  aria-label={t('메시지 보내기')}
                  disabled={(!draft.trim() && !images.length) || !root || busyElsewhere}
                >
                  {busyElsewhere ? <Spinner className="size-3.5" /> : <ArrowUp size={16} />}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
