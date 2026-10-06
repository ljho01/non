// Development-only visual fixture. Does not call native IPC, accounts, or the filesystem.
import { serializeBase } from '../src/shared/contracts/base'
import { useVault } from '../src/entities/vault'
import { useSettings } from '../src/entities/settings'
import { useAgent } from '../src/entities/agent'
import { knowledge } from '../src/shared/api/knowledge'
import { desktop, setPreviewAgentRequest } from '../src/shared/api/desktop'
import {
  createNote,
  parseNote,
  serializeNote,
  noteText,
  displayFilename,
  type Note,
} from '../src/shared/contracts/note'
import {
  noteLinks,
  wikiLinks,
  resolveNoteLink,
  type IndexedDocument,
} from '../src/shared/contracts/links'
import type { InstalledSkill } from '../src/shared/contracts/skill'
import type {
  TranscriptionEvent,
  TranscriptionLanguage,
  TranscriptionRuntimeStatus,
  TranscriptionSession,
} from '../src/shared/contracts/transcription'
import {
  createCanvas,
  parseCanvas,
  serializeCanvas,
  type CanvasDocument,
} from '../src/shared/contracts/canvas'

if (!import.meta.env.DEV) throw new Error('This fixture is development-only')
const previewRoot = '/fixture/Notes'
const primaryChatId = '11111111-1111-4111-8111-111111111111'
const backlinkChatId = '22222222-2222-4222-8222-222222222222'
const writingChatId = '33333333-3333-4333-8333-333333333333'

type PreviewStoredMessage = {
  role: 'user' | 'assistant'
  text: string
}

const previewChats = [
  { id: primaryChatId, title: '로컬 우선 구조 정리', updated: Date.now() },
  { id: backlinkChatId, title: '백링크 설계 점검', updated: Date.now() - 60_000 },
  { id: writingChatId, title: '초안 문장 다듬기', updated: Date.now() - 120_000 },
]
const previewChatMessages: Record<string, PreviewStoredMessage[]> = {
  [primaryChatId]: [
    {
      role: 'user',
      text: '이 노트에서 말하는 로컬 우선의 핵심을 세 문장으로 정리해줘.',
    },
    {
      role: 'assistant',
      text: '**핵심은 소유권과 복구 가능성입니다.**\n\n- 노트와 PDF 원본은 사용자가 고른 로컬 폴더에 남습니다.\n- 검색 인덱스와 백링크는 원본에서 언제든 다시 만들 수 있습니다.\n- AI 기능이 없어도 문서를 열고 편집하는 기본 흐름은 계속 동작합니다.',
    },
    {
      role: 'user',
      text: '그러면 인덱스가 손상됐을 때 사용자에게는 어떻게 보여주는 게 좋아?',
    },
    {
      role: 'assistant',
      text: '문서는 그대로 열어 두고, 검색과 백링크 영역에만 복구 상태를 표시하는 편이 좋습니다.\n\n1. 원본 문서는 안전하다는 사실을 먼저 알립니다.\n2. **인덱스 다시 만들기**를 한 번의 명확한 동작으로 제공합니다.\n3. 재생성 중에도 편집과 저장은 막지 않습니다.',
    },
  ],
  [backlinkChatId]: [
    { role: 'user', text: '백링크 해석 우선순위를 검토해줘.' },
    {
      role: 'assistant',
      text: '현재 폴더의 상대 경로를 먼저 보고, 그다음 문서 ID와 유일한 제목을 확인하면 예측 가능한 동작을 만들 수 있습니다. 중복 제목은 임의로 선택하지 않는 편이 안전합니다.',
    },
  ],
  [writingChatId]: [
    { role: 'user', text: '“문서를 읽고 생각을 연결합니다”를 조금 더 자연스럽게 바꿔줘.' },
    {
      role: 'assistant',
      text: '“읽은 문서에서 생각을 이어가세요.”처럼 짧게 쓰면 기능과 행동이 함께 드러납니다.',
    },
  ],
}

let previewSkills: InstalledSkill[] = [
  {
    id: 'aside-browser',
    name: 'aside-browser',
    description: '로그인된 웹사이트와 브라우저 문맥이 필요한 작업에 사용합니다.',
    enabled: true,
    builtIn: true,
    error: null,
  },
  {
    id: 'research-summary',
    name: 'research-summary',
    description: '논문과 조사 자료를 근거 중심으로 요약합니다.',
    enabled: false,
    builtIn: false,
    error: null,
  },
]

const previewRuntime: TranscriptionRuntimeStatus = {
  state: 'ready',
  supported: true,
  uvAvailable: true,
  ffmpegAvailable: true,
  repositoryReady: true,
  modelReady: true,
  message: 'Qwen3-ASR q8 로컬 런타임 준비 완료',
}
let previewTranscriptionListener: ((event: TranscriptionEvent) => void) | null = null
let previewTranscriptionSessions: TranscriptionSession[] = [
  {
    id: 'preview-transcription-session',
    path: '제품 인터뷰.transcription',
    title: '제품 인터뷰',
    sourceName: '제품 인터뷰.m4a',
    sourceKind: 'file',
    language: 'Korean',
    status: 'transcribing',
    createdAt: Date.now() - 180_000,
    updatedAt: Date.now(),
    durationMs: 754_000,
    processedMs: 187_000,
    hasAudio: true,
    segments: [
      {
        id: '0',
        startMs: 0,
        endMs: 42_000,
        text: '오늘은 로컬 우선 노트 앱의 사용 흐름을 살펴보겠습니다.',
      },
      {
        id: '1',
        startMs: 42_000,
        endMs: 112_000,
        text: '문서와 오디오는 사용자의 Mac에 남고,',
      },
      {
        id: '2',
        startMs: 112_000,
        endMs: 187_000,
        text: '전사는 기기 안에서 처리됩니다.',
      },
    ],
    stableText: '오늘은 로컬 우선 노트 앱의 사용 흐름을 살펴보겠습니다. 문서와 오디오는 사용자의 Mac에 남고, 전사는 기기 안에서 처리됩니다. ',
    provisionalText: '지금 보이는 자막은',
    error: null,
  },
]

setPreviewAgentRequest(async (action, payload) => {
  if (action === 'chat:list') return previewChats
  if (action === 'chat:load' && typeof payload === 'string')
    return previewChatMessages[payload] ?? []
  throw new Error(`브라우저 fixture에서 지원하지 않는 AI 요청입니다: ${action}`)
})

localStorage.setItem(
  `non-flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none:${previewRoot}`,
  JSON.stringify({
    openedChatIds: [primaryChatId, backlinkChatId],
    activeChatId: primaryChatId,
    titles: {
      [primaryChatId]: '로컬 우선 구조 정리',
      [backlinkChatId]: '백링크 설계 점검',
    },
    newChatIds: [],
  }),
)
const target = createNote('로컬 우선의 의미')
target.blocks[0].text = '파일은 원본입니다. 인덱스는 파일에서 다시 만들 수 있습니다.'
const source = createNote('연결하는 작업 공간')
source.blocks[0].text = '문서를 읽고, 생각을 기록하고, 서로 연결합니다.'
source.blocks.push({
  id: 'wiki-block',
  type: 'tiptap',
  content: {
    type: 'paragraph',
    content: [
      { type: 'text', text: '이 설계의 출발점은 ' },
      { type: 'wikiLink', attrs: { target: `id:${target.id}`, label: target.title } },
      { type: 'text', text: '입니다.' },
    ],
  },
})
const todos = createNote('할 일')
todos.blocks = [
  {
    id: 'todo-list',
    type: 'tiptap',
    content: {
      type: 'todoList',
      content: [
        {
          type: 'todoListItem',
          attrs: { todoId: 'parent', checked: false },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '장보기' }] },
            {
              type: 'todoList',
              content: [
                {
                  type: 'todoListItem',
                  attrs: { todoId: 'child-a', checked: false },
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: '우유 사기' }] },
                  ],
                },
                {
                  type: 'todoListItem',
                  attrs: { todoId: 'child-b', checked: true },
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: '계란 사기' }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'todoListItem',
          attrs: { todoId: 'done', checked: true },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '지난주 회의록 정리' }] },
          ],
        },
      ],
    },
  },
  {
    id: 'check-list',
    type: 'tiptap',
    content: {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '문서 안에서만 쓰는 체크리스트 항목입니다. 줄이 길어지면 첫 줄과 체크박스 정렬을 확인할 수 있도록 문장을 조금 더 늘여서 작성합니다.',
                },
              ],
            },
          ],
        },
      ],
    },
  },
]
const files: Record<string, Note | CanvasDocument | string> = {
  '독서 목록.base': serializeBase({
    filters: 'file.ext == "md"',
    formulas: { total: 'price * quantity' },
    properties: { 'file.name': { displayName: '책' }, 'note.status': { displayName: '상태' }, 'note.rating': { displayName: '평점' }, 'formula.total': { displayName: '합계' } },
    views: [
      { type: 'table', name: '전체', order: ['file.name', 'note.status', 'note.rating', 'formula.total'], sort: [{ property: 'note.rating', direction: 'DESC' }], summaries: { 'formula.total': 'Sum' } },
      { type: 'kanban', name: '보드', groupBy: {property: 'note.status',direction: 'ASC'}, order: ['file.name','note.rating'], image: 'note.cover' },
      { type: 'cards', image: 'note.cover', cardSize: 260, name: '읽는 중', filters: 'status == "읽는 중"', order: ['file.name', 'note.status', 'note.rating'] },
      { type: 'list', name: '목록', order: ['file.name', 'note.status'] },
    ],
  }),
  '데이터베이스 임베드.md': '# 읽기 대시보드\n\n![[독서 목록.base#읽는 중]]\n\n```base\nfilters: file.ext == "md"\nformulas:\n  owner: this.file.name\nviews:\n  - type: table\n    name: Embedded\n    order: [file.name, formula.owner]\n```\n',
  '깊이 읽기.md': '---\ncover: "#809598"\nstatus: 읽는 중\nrating: 5\nprice: 18000\nquantity: 2\ntags: [books, reading]\n---\n# 깊이 읽기\n\n본문은 그대로 보존됩니다.\n',
  '생각의 지도.md': '---\nstatus: 완료\nrating: 4\nprice: 15000\nquantity: 1\n---\n# 생각의 지도\n',
  '느리게 쓰기.md': '---\ncover: "#a18982"\nstatus: 읽는 중\nrating: 3\nprice: 12000\nquantity: 1\n---\n# 느리게 쓰기\n',
  '시작하기.note.json': source,
  '로컬 우선.note.json': target,
  '할 일.note.json': todos,
  '생각 지도.excalidraw': createCanvas(),
  'Markdown 시작하기.md':
    '# Markdown으로 기록하기\n\n원문을 **그대로** 편집하고 미리보기로 읽습니다.\n\n- [ ] 생각 기록하기\n- [x] 내 파일로 보관하기\n\n[[로컬 우선의 의미]]\n',
}
const previewModified: Record<string, number> = {}
const docs = (): IndexedDocument[] =>
  Object.entries(files).flatMap(([path, note]) => {
    if (path.endsWith('.excalidraw') || path.endsWith('.base')) return []
    const document = note as Note | string
    return [{
      path,
      id: typeof document === 'string' ? null : document.id,
      title: typeof document === 'string' ? displayFilename(path) : document.title,
      kind: typeof document === 'string' ? 'legacy' as const : 'note' as const,
      aliases: [],
      text: typeof document === 'string' ? document : noteText(document),
      modified: previewModified[path] ?? 0,
    }]
  })
desktop.read = async (path) => {
  const note = files[path]
  const content =
    typeof note === 'string'
      ? note
      : path.endsWith('.excalidraw')
        ? serializeCanvas(note as CanvasDocument)
        : serializeNote(note as Note)
  return { content, revision: 'fixture' }
}
desktop.list = async () =>
  Object.keys(files).map((path) => ({
    path,
    name: path,
    kind: path.endsWith('.base') ? 'base' as const : path.endsWith('.excalidraw')
      ? 'canvas' as const
      : path.endsWith('.md')
        ? 'legacy' as const
        : 'note' as const,
    modified: previewModified[path] ?? 0,
    size: 0,
  }))
desktop.propertyTypes = async () => ({})
desktop.databaseEntries = () => desktop.list()
desktop.save = async (path, content) => {
  files[path] = /\.(md|base)$/i.test(path)
    ? content
    : /\.excalidraw$/i.test(path)
      ? parseCanvas(content)
      : parseNote(content)
  previewModified[path] = Date.now()
  return 'fixture'
}
desktop.skills.list = async () => previewSkills.map((skill) => ({ ...skill }))
desktop.skills.install = async () => null
desktop.skills.setEnabled = async (id, enabled) => {
  previewSkills = previewSkills.map((skill) => (skill.id === id ? { ...skill, enabled } : skill))
  return previewSkills.map((skill) => ({ ...skill }))
}
desktop.skills.remove = async (id) => {
  previewSkills = previewSkills.filter((skill) => skill.id !== id || skill.builtIn)
  return previewSkills.map((skill) => ({ ...skill }))
}
desktop.skills.reveal = async () => undefined
desktop.transcription.list = async () => previewTranscriptionSessions.map((session) => ({ ...session }))
desktop.transcription.runtimeStatus = async () => ({ ...previewRuntime })
desktop.transcription.installRuntime = async () => ({ ...previewRuntime })
desktop.transcription.audioUrl = () =>
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
desktop.transcription.onEvent = (callback) => {
  previewTranscriptionListener = callback
  return () => {
    if (previewTranscriptionListener === callback) previewTranscriptionListener = null
  }
}
desktop.transcription.create = async (language: TranscriptionLanguage, folder: string) => {
  const now = Date.now()
  const session: TranscriptionSession = {
    id: crypto.randomUUID(),
    path: `${folder ? `${folder}/` : ''}${language === 'Korean' ? '새 한국어 전사' : 'New English transcript'}.transcription`,
    title: language === 'Korean' ? '새 한국어 전사' : 'New English transcript',
    sourceName: 'sample.m4a',
    sourceKind: 'file',
    language,
    status: 'preparing',
    createdAt: now,
    updatedAt: now,
    durationMs: 120_000,
    processedMs: 0,
    hasAudio: true,
    segments: [],
    stableText: '',
    provisionalText: '',
    error: null,
  }
  previewTranscriptionSessions = [session, ...previewTranscriptionSessions]
  previewTranscriptionListener?.({ type: 'session', session })
  return session
}
desktop.transcription.createLive = async (language: TranscriptionLanguage, folder: string) => {
  const now = Date.now()
  const session: TranscriptionSession = {
    id: crypto.randomUUID(),
    path: `${folder ? `${folder}/` : ''}실시간 전사 · 지금.transcription`,
    title: '실시간 전사 · 지금',
    sourceName: 'Mac 마이크',
    sourceKind: 'microphone',
    language,
    status: 'transcribing',
    createdAt: now,
    updatedAt: now,
    durationMs: null,
    processedMs: 18_000,
    hasAudio: false,
    segments: [
      { id: '0', startMs: 0, endMs: 6_000, text: '방금 시작한 대화를 기록하고 있습니다.' },
      { id: '1', startMs: 6_000, endMs: 13_000, text: '완료된 문장은 위로 이동하고' },
    ],
    stableText: '방금 시작한 대화를 기록하고 있습니다. 완료된 문장은 위로 이동하고 ',
    provisionalText: '현재 문장은 아래에서 크게 보여요.',
    error: null,
  }
  previewTranscriptionSessions = [session, ...previewTranscriptionSessions]
  previewTranscriptionListener?.({ type: 'session', session })
  return session
}
desktop.transcription.rename = async (id: string, name: string) => {
  const session = previewTranscriptionSessions.find((item) => item.id === id)
  if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
  const folder = session.path.includes('/') ? session.path.slice(0, session.path.lastIndexOf('/')) : ''
  const next = {
    ...session,
    title: name,
    path: `${folder ? `${folder}/` : ''}${name}.transcription`,
  }
  previewTranscriptionSessions = previewTranscriptionSessions.map((item) =>
    item.id === id ? next : item,
  )
  previewTranscriptionListener?.({ type: 'session', session: next })
  return next
}
desktop.transcription.move = async (id: string, folder: string) => {
  const session = previewTranscriptionSessions.find((item) => item.id === id)
  if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
  const next = {
    ...session,
    path: `${folder ? `${folder}/` : ''}${session.title}.transcription`,
  }
  previewTranscriptionSessions = previewTranscriptionSessions.map((item) =>
    item.id === id ? next : item,
  )
  previewTranscriptionListener?.({ type: 'session', session: next })
  return next
}
desktop.transcription.remove = async (id: string) => {
  previewTranscriptionSessions = previewTranscriptionSessions.filter((item) => item.id !== id)
  previewTranscriptionListener?.({ type: 'removed', id })
}
desktop.transcription.setLanguage = async (id, language) => {
  const session = previewTranscriptionSessions.find((item) => item.id === id)
  if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
  const next = { ...session, language, updatedAt: Date.now() }
  previewTranscriptionSessions = previewTranscriptionSessions.map((item) =>
    item.id === id ? next : item,
  )
  previewTranscriptionListener?.({ type: 'session', session: next })
  return next
}
desktop.transcription.start = async (id) => {
  const session = previewTranscriptionSessions.find((item) => item.id === id)
  if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
  const next = { ...session, status: 'transcribing' as const, error: null }
  previewTranscriptionSessions = previewTranscriptionSessions.map((item) =>
    item.id === id ? next : item,
  )
  previewTranscriptionListener?.({ type: 'session', session: next })
  return next
}
desktop.transcription.retranscribe = async (id) => {
  const session = previewTranscriptionSessions.find((item) => item.id === id)
  if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
  const segments = [
    { id: 'quality-0', startMs: 0, endMs: 41_840, text: '오늘은 로컬 우선 노트 앱의 사용 흐름을 살펴보겠습니다.' },
    { id: 'quality-1', startMs: 41_840, endMs: 111_560, text: '문서와 오디오는 사용자의 Mac에 남고,' },
    { id: 'quality-2', startMs: 111_560, endMs: 186_920, text: '전사는 기기 안에서 처리됩니다.' },
  ]
  const next = {
    ...session,
    status: 'completed' as const,
    processedMs: 186_920,
    segments,
    stableText: segments.map((segment) => segment.text).join(' '),
    provisionalText: '',
    error: null,
    updatedAt: Date.now(),
  }
  previewTranscriptionSessions = previewTranscriptionSessions.map((item) =>
    item.id === id ? next : item,
  )
  previewTranscriptionListener?.({ type: 'session', session: next })
  return next
}
desktop.transcription.stop = async (id) => {
  const session = previewTranscriptionSessions.find((item) => item.id === id)
  if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
  const next = {
    ...session,
    status: 'completed' as const,
    durationMs: session.sourceKind === 'microphone' ? session.processedMs : session.durationMs,
    hasAudio: true,
    provisionalText: '',
  }
  previewTranscriptionSessions = previewTranscriptionSessions.map((item) =>
    item.id === id ? next : item,
  )
  previewTranscriptionListener?.({ type: 'session', session: next })
  return next
}
knowledge.search = async (query) =>
  docs()
    .filter((doc) => (doc.title + doc.text).includes(query))
    .map((doc) => ({ ...doc, snippet: doc.text }))
knowledge.resolve = async (path, target) => resolveNoteLink(docs(), path, target)
knowledge.query = async (path) => {
  const links = Object.entries(files).flatMap(([source, note]) => {
    if (source.endsWith('.excalidraw') || source.endsWith('.base')) return []
    const document = note as Note | string
    return (typeof document === 'string' ? wikiLinks(document) : noteLinks(document)).map((link) => ({
      ...link,
      source,
      sourceTitle: typeof document === 'string' ? displayFilename(source) : document.title,
      ...resolveNoteLink(docs(), source, link.target),
    }))
  })
  return {
    documents: docs().length,
    links: links.length,
    updated: Date.now(),
    warnings: [],
    backlinks: links.filter((link) => link.path === path && link.source !== path),
    outgoing: links.filter((link) => link.source === path),
  }
}
useVault.setState({
  path: previewRoot,
  entries: Object.keys(files).map((path) => ({
    path,
    name: path,
    kind: path.endsWith('.base') ? 'base' as const : path.endsWith('.excalidraw')
      ? 'canvas' as const
      : path.endsWith('.md')
        ? 'legacy' as const
        : 'note' as const,
    modified: previewModified[path] ?? 0,
    size: 0,
  })),
  tabs: [],
  active: null,
})
useSettings.setState({
  lastVault: previewRoot,
  folderRoots: [previewRoot, '/fixture/Reading', '/fixture/Archive'],
  selectedModel: 'openai-codex/gpt-5.1-codex-max',
  recentDocuments: [
    {
      root: '/fixture/Notes',
      path: '시작하기.note.json',
      title: '연결하는 작업 공간',
      kind: 'note',
      openedAt: Date.now(),
    },
    {
      root: '/fixture/Notes',
      path: '로컬 우선.note.json',
      title: '로컬 우선의 의미',
      kind: 'note',
      openedAt: Date.now() - 1,
    },
    {
      root: '/fixture/Notes',
      path: '생각 지도.excalidraw',
      title: '생각 지도',
      kind: 'canvas',
      openedAt: Date.now() - 2,
    },
    {
      root: '/fixture/Notes',
      path: 'Markdown 시작하기.md',
      title: 'Markdown으로 기록하기',
      kind: 'legacy',
      openedAt: Date.now() - 3,
    },
  ],
})
useAgent.setState({
  connected: true,
  providers: [
    { id: 'openai-codex', name: 'ChatGPT', connected: true, authType: 'oauth' },
  ],
  models: [
    {
      key: 'openai-codex/gpt-5.1-codex-max',
      id: 'gpt-5.1-codex-max',
      provider: 'openai-codex',
      providerName: 'ChatGPT',
      name: 'GPT-5.1 Codex Max',
      input: ['text', 'image'],
    },
  ],
})
await useVault.getState().openFile(new URLSearchParams(location.search).has('bases') ? '독서 목록.base' : '시작하기.note.json')
await import('../src/app/main')
