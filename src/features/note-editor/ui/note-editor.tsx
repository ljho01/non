import type { RenderBaseEmbed } from '@/shared/contracts/base-embed'
import { basePreview } from '../model/base-preview'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { EditorState } from '@tiptap/pm/state'
import {
  AlertTriangle,
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Square,
  Quote,
  Code2,
  Minus,
  Link2,
  ImagePlus,
  Check,
  X,
  type IconComponent,
} from '@/shared/ui/icon'
import { useVault, type OpenDocument } from '@/entities/vault'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  noteCover,
  noteCoverIds,
  parseNote,
  serializeNote,
  type Note,
  type NoteCoverId,
} from '@/shared/contracts/note'
import { cn, errorText } from '@/shared/lib/utils'
import { knowledge } from '@/shared/api/knowledge'
import type { SearchHit } from '@/shared/contracts/links'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { MarkdownEditor } from './markdown-editor'
import {
  editorExtensions,
  editorToNote,
  noteToEditor,
  replaceEditorDocument,
} from '../model/tiptap'
import { matchSlashCommand } from '../model/slash'
import { useWikiLinkMenu } from '../model/use-wiki-link-menu'
import { wikiLinkTarget } from '../model/wiki-suggestion'
import { WikiLinkMenu } from './wiki-link-menu'
import { useI18n } from '@/shared/lib/i18n'

type SlashMenuState = {
  from: number
  to: number
  query: string
  left: number
  top: number
}

type SlashCommand = {
  id: string
  label: string
  description: string
  keywords: string
  icon: IconComponent
  run: () => void
}

const coverLabels: Record<NoteCoverId, string> = {
  fog: '안개',
  sea: '바다',
  moss: '이끼',
  dusk: '해질녘',
  clay: '흙',
  ink: '먹빛',
}

function RichNote({ note, path, renderBase }: { note: Note; path: string; renderBase?: RenderBaseEmbed }) {
  const { t } = useI18n()
  const root = useVault((s) => s.path)
  const wikiMenu = useWikiLinkMenu({ root, currentPath: path })
  const titleInputRef = useRef<HTMLInputElement>(null)
  const editorRuntime = useRef<Editor | null>(null)
  const focusEmptyTitleOnMount = useRef(note.title.length === 0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkHits, setLinkHits] = useState<SearchHit[]>([])
  const [linkStatus, setLinkStatus] = useState('')
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashMenuRef = useRef<SlashMenuState | null>(null)
  const slashRuntime = useRef<{ active: number; commands: SlashCommand[] }>({
    active: 0,
    commands: [],
  })
  const focusTitleEnd = useCallback(() => {
    const input = titleInputRef.current
    if (!input) return
    const end = input.value.length
    input.focus()
    input.setSelectionRange(end, end)
  }, [])
  const closeSlashMenu = useCallback(() => {
    slashMenuRef.current = null
    setSlashMenu(null)
  }, [])
  const updateSlashMenu = useCallback(
    (editor: Editor) => {
      const { from, empty, $from } = editor.state.selection
      if (!editor.isEditable || !empty || !$from.parent.isTextblock) {
        closeSlashMenu()
        return
      }
      const text = $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC')
      const match = matchSlashCommand(text, from)
      if (!match) {
        closeSlashMenu()
        return
      }
      const coords = editor.view.coordsAtPos(from)
      const menuHeight = 330
      const left = Math.max(12, Math.min(coords.left, window.innerWidth - 304))
      const top =
        coords.bottom + menuHeight > window.innerHeight
          ? Math.max(12, coords.top - menuHeight)
          : coords.bottom + 7
      const next = { ...match, left, top }
      slashMenuRef.current = next
      setSlashMenu(next)
      setSlashIndex(0)
    },
    [closeSlashMenu],
  )
  const updateEditorMenus = useCallback(
    (editor: Editor) => {
      if (wikiMenu.update(editor)) {
        closeSlashMenu()
        return
      }
      updateSlashMenu(editor)
    },
    [closeSlashMenu, updateSlashMenu, wikiMenu.update],
  )
  const followLink = async (target: string) => {
    const originalRoot = useVault.getState().path
    try {
      const resolved = await knowledge.resolve(path, target)
      if (useVault.getState().path !== originalRoot) return
      if (!resolved.path)
        throw new Error(
          resolved.status === 'ambiguous'
            ? `같은 이름의 문서가 여러 개입니다: ${resolved.candidates.join(', ')}. 링크 버튼으로 문서를 지정하세요.`
            : `연결할 문서를 찾을 수 없습니다: ${target}`,
        )
      await useVault.getState().openFile(resolved.path)
    } catch (error) {
      if (useVault.getState().path === originalRoot) useVault.getState().setError(errorText(error))
    }
  }
  useEffect(() => {
    if (!linkOpen) return
    let alive = true
    setLinkHits([])
    setLinkStatus('검색 중…')
    const timer = setTimeout(() => {
      void knowledge
        .search(linkQuery)
        .then((hits) => {
          if (alive) {
            setLinkHits(hits)
            setLinkStatus(hits.length ? '' : '검색 결과가 없습니다.')
          }
        })
        .catch((error) => {
          if (alive) setLinkStatus(errorText(error))
        })
    }, 150)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [linkOpen, linkQuery, root])
  const current = useRef(note)
  const lastContent = useRef(serializeNote(note))
  current.current = note
  const editor = useEditor({
    extensions: [...editorExtensions, ...(renderBase ? [basePreview(renderBase)] : [])],
    content: noteToEditor(note),
    immediatelyRender: false,
    editorProps: {
      handleClickOn: (_view, _pos, node, _nodePos, event, direct) => {
        if (!direct || node.type.name !== 'wikiLink') return false
        event.preventDefault()
        void followLink(String(node.attrs.target))
        return true
      },
      handleDOMEvents: {
        keydown: (view, event) => {
          const { $from, empty } = view.state.selection
          const atDocumentStart = empty && $from.parentOffset === 0 && $from.index(0) === 0
          if (!event.isComposing && event.key === 'Backspace' && atDocumentStart) {
            // Restore an input rule's typed marker before navigating to the title.
            if (editorRuntime.current?.commands.undoInputRule()) {
              event.preventDefault()
              return true
            }
            event.preventDefault()
            const firstBlock = view.state.doc.firstChild
            if (
              firstBlock?.isTextblock &&
              firstBlock.content.size === 0 &&
              view.state.doc.childCount > 1
            ) {
              view.dispatch(view.state.tr.delete(0, firstBlock.nodeSize))
            }
            focusTitleEnd()
            return true
          }
          if (
            wikiMenu.handleKeyDown(event, (hit) => {
              const range = wikiMenu.menuRef.current
              const type = view.state.schema.nodes.wikiLink
              if (!range || !type) return
              wikiMenu.close()
              view.dispatch(
                view.state.tr
                  .replaceWith(
                    range.from,
                    range.to,
                    type.create({ target: wikiLinkTarget(hit), label: hit.title }),
                  )
                  .scrollIntoView(),
              )
              view.focus()
            })
          )
            return true
          if (!event.isComposing && slashMenuRef.current) {
            const runtime = slashRuntime.current
            if (event.key === 'ArrowDown' && runtime.commands.length) {
              event.preventDefault()
              const next = (runtime.active + 1) % runtime.commands.length
              runtime.active = next
              setSlashIndex(next)
              return true
            }
            if (event.key === 'ArrowUp' && runtime.commands.length) {
              event.preventDefault()
              const next = (runtime.active - 1 + runtime.commands.length) % runtime.commands.length
              runtime.active = next
              setSlashIndex(next)
              return true
            }
            if (event.key === 'Enter' && runtime.commands.length) {
              event.preventDefault()
              runtime.commands[runtime.active]?.run()
              return true
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              closeSlashMenu()
              return true
            }
          }
          const target =
            event.target instanceof HTMLElement
              ? event.target.closest<HTMLElement>('[data-non-target]')
              : null
          if (!target || !['Enter', ' '].includes(event.key)) return false
          event.preventDefault()
          void followLink(target.dataset.nonTarget ?? '')
          return true
        },
        blur: () => {
          closeSlashMenu()
          wikiMenu.close()
          return false
        },
      },
      attributes: {
        class: 'tiptap-note min-h-[360px] break-words outline-none',
        role: 'textbox',
        'aria-label': '노트 본문',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
    },
    onUpdate: ({ editor }) => {
      const next = editorToNote(current.current, editor.getJSON())
      current.current = next
      lastContent.current = serializeNote(next)
      useVault.getState().edit(path, lastContent.current)
      updateEditorMenus(editor)
    },
    onSelectionUpdate: ({ editor }) => updateEditorMenus(editor),
  })
  editorRuntime.current = editor
  useEffect(() => {
    if (!focusEmptyTitleOnMount.current) return
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.setSelectionRange(0, 0)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    const content = serializeNote(note)
    if (!editor || content === lastContent.current) return
    // External reload: replace without emitting an edit or allowing undo to restore stale disk data.
    const next = replaceEditorDocument(noteToEditor(note), editor.schema)
    editor.view.updateState(
      EditorState.create({ schema: editor.schema, plugins: editor.state.plugins, doc: next }),
    )
    editor.commands.setMeta('nonExternal', true)
    lastContent.current = content
  }, [editor, note])
  const commitTitle = (title: string) => {
    const next = { ...current.current, title, updatedAt: new Date().toISOString() }
    current.current = next
    lastContent.current = serializeNote(next)
    useVault.getState().edit(path, lastContent.current)
  }
  const selectedCover = noteCover(note)
  const commitCover = (cover: NoteCoverId | null) => {
    const metadata = { ...(current.current.metadata ?? {}) }
    if (cover) metadata.cover = cover
    else delete metadata.cover
    const next = {
      ...current.current,
      metadata,
      updatedAt: new Date().toISOString(),
    }
    current.current = next
    lastContent.current = serializeNote(next)
    useVault.getState().edit(path, lastContent.current)
  }
  const consumeSlash = () => {
    const range = slashMenuRef.current
    if (!editor || !range) return null
    closeSlashMenu()
    return editor.chain().focus().deleteRange({ from: range.from, to: range.to })
  }
  const slashCommands: SlashCommand[] = editor
    ? [
        {
          id: 'paragraph',
          label: t('텍스트'),
          description: t('일반 문단으로 작성'),
          keywords: 'text paragraph 본문 일반',
          icon: Pilcrow,
          run: () => consumeSlash()?.setParagraph().run(),
        },
        {
          id: 'heading-1',
          label: t('제목 1'),
          description: t('큰 구역 제목'),
          keywords: 'heading h1 제목 대제목',
          icon: Heading1,
          run: () => consumeSlash()?.setHeading({ level: 1 }).run(),
        },
        {
          id: 'heading-2',
          label: t('제목 2'),
          description: t('중간 구역 제목'),
          keywords: 'heading h2 제목 중제목',
          icon: Heading2,
          run: () => consumeSlash()?.setHeading({ level: 2 }).run(),
        },
        {
          id: 'heading-3',
          label: t('제목 3'),
          description: t('작은 구역 제목'),
          keywords: 'heading h3 제목 소제목',
          icon: Heading3,
          run: () => consumeSlash()?.setHeading({ level: 3 }).run(),
        },
        {
          id: 'bullet-list',
          label: t('글머리 목록'),
          description: t('순서 없는 목록'),
          keywords: 'bullet list bullets 글머리 목록',
          icon: List,
          run: () => consumeSlash()?.toggleBulletList().run(),
        },
        {
          id: 'ordered-list',
          label: t('번호 목록'),
          description: t('순서가 있는 목록'),
          keywords: 'ordered numbered list 번호 목록',
          icon: ListOrdered,
          run: () => consumeSlash()?.toggleOrderedList().run(),
        },
        {
          id: 'task-list',
          label: 'Checklist',
          description: t('체크할 수 있는 항목'),
          keywords: 'checkbox checklist check [] [ ] 체크리스트',
          icon: Square,
          run: () => consumeSlash()?.toggleTaskList().run(),
        },
        {
          id: 'todo-list',
          label: 'Task',
          description: t('Task 페이지에 모이는 할 일'),
          keywords: 'task todo () ( ) 할일 할 일',
          icon: ListTodo,
          run: () => consumeSlash()?.toggleList('todoList', 'todoListItem').run(),
        },
        {
          id: 'blockquote',
          label: t('인용'),
          description: t('인용문 블록'),
          keywords: 'quote blockquote 인용',
          icon: Quote,
          run: () => consumeSlash()?.toggleBlockquote().run(),
        },
        {
          id: 'code-block',
          label: t('코드 블록'),
          description: t('여러 줄 코드'),
          keywords: 'code pre 코드 개발',
          icon: Code2,
          run: () => consumeSlash()?.toggleCodeBlock().run(),
        },
        {
          id: 'divider',
          label: t('구분선'),
          description: t('내용 사이를 나누는 선'),
          keywords: 'divider horizontal rule hr 구분선',
          icon: Minus,
          run: () => consumeSlash()?.setHorizontalRule().run(),
        },
        {
          id: 'document-link',
          label: t('문서 링크'),
          description: t('다른 노트나 PDF 연결'),
          keywords: 'link wiki backlink 링크 연결 문서',
          icon: Link2,
          run: () => {
            const chain = consumeSlash()
            if (!chain) return
            chain.run()
            setLinkQuery('')
            setLinkOpen(true)
          },
        },
      ]
    : []
  const normalizedSlashQuery = slashMenu?.query.trim().toLocaleLowerCase('ko') ?? ''
  const visibleSlashCommands = slashCommands.filter((command) =>
    `${command.label} ${command.keywords}`.toLocaleLowerCase('ko').includes(normalizedSlashQuery),
  )
  const activeSlashIndex = Math.min(slashIndex, Math.max(0, visibleSlashCommands.length - 1))
  slashRuntime.current = { active: activeSlashIndex, commands: visibleSlashCommands }
  return (
    <>
      <div className="group/title-area">
        <div className="mb-2.5 flex min-h-[30px] items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'pointer-events-none opacity-0 text-muted-foreground transition-opacity duration-100 group-hover/title-area:pointer-events-auto group-hover/title-area:opacity-70 group-focus-within/title-area:pointer-events-auto group-focus-within/title-area:opacity-70 hover:opacity-100 focus-visible:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100',
                  selectedCover &&
                    'bg-background/65 text-foreground shadow-[inset_0_0_0_1px_#ffffff1f] backdrop-blur-md',
                )}
              >
                <ImagePlus />
                {selectedCover ? t('배경 변경') : t('배경 추가')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[252px] p-1.5">
              <DropdownMenuLabel>{t('문서 배경')}</DropdownMenuLabel>
              <div className="grid grid-cols-2 gap-0.5">
                {noteCoverIds.map((cover) => (
                  <DropdownMenuItem
                    key={cover}
                    className="min-w-0 p-1.5"
                    aria-label={`${coverLabels[cover]} 배경`}
                    onSelect={() => commitCover(cover)}
                  >
                    <span
                      className="h-[22px] w-[30px] flex-none rounded-[5px] border border-foreground/10 [background:var(--note-cover-background)]"
                      data-note-cover={cover}
                    />
                    <span>{coverLabels[cover]}</span>
                    {selectedCover === cover && <Check className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </div>
              {selectedCover && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => commitCover(null)}>
                    <X />
                    {t('배경 제거')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Input
          ref={titleInputRef}
          unstyled
          className="mb-5 block w-full border-0 bg-transparent text-(length:--type-document-title-size) font-extrabold leading-(--type-leading-tight) tracking-tight text-inherit outline-none"
          aria-label={t('노트 제목')}
          spellCheck={false}
          placeholder={t('제목 없음')}
          value={note.title}
          onChange={(event) => commitTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            editor?.chain().insertContentAt(0, { type: 'paragraph' }).focus('start').run()
          }}
        />
      </div>
      <EditorContent editor={editor} />
      {slashMenu && (
        <div
          className="fixed z-80 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-[0_14px_38px_#0000002e,0_2px_8px_#0000001f]"
          role="listbox"
          aria-label={t('블록 명령')}
          style={{ left: slashMenu.left, top: slashMenu.top }}
        >
          <div className="max-h-72 overflow-y-auto p-1.5">
            {visibleSlashCommands.map((command, index) => {
              const Icon = command.icon
              return (
                <Button
                  unstyled
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeSlashIndex}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left hover:bg-accent data-[active=true]:bg-accent [&>span:last-child]:min-w-0 [&_strong]:block [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_small]:mt-0.5 [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-muted-foreground"
                  data-active={index === activeSlashIndex}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    command.run()
                  }}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background/75 text-foreground">
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong>{command.label}</strong>
                    <small>{command.description}</small>
                  </span>
                </Button>
              )
            })}
            {!visibleSlashCommands.length && (
              <p className="px-3 py-5.5 text-center text-xs text-muted-foreground">
                {t('일치하는 블록이 없습니다.')}
              </p>
            )}
          </div>
          <div className="flex justify-between gap-3 border-t border-border px-2.5 py-2 text-xs text-muted-foreground">
            ↑↓ 이동 · Enter 선택 · Esc 닫기
          </div>
        </div>
      )}
      <WikiLinkMenu
        menu={wikiMenu.menu}
        hits={wikiMenu.hits}
        status={wikiMenu.status}
        activeIndex={wikiMenu.activeIndex}
        onActiveIndexChange={wikiMenu.setActiveIndex}
        onSelect={(hit) => {
          const range = wikiMenu.menuRef.current
          if (!editor || !range) return
          wikiMenu.close()
          editor
            .chain()
            .focus()
            .deleteRange({ from: range.from, to: range.to })
            .insertContent({
              type: 'wikiLink',
              attrs: { target: wikiLinkTarget(hit), label: hit.title },
            })
            .run()
        }}
      />
      {!editor && <p className="text-sm text-muted-foreground">Tiptap 편집기 여는 중…</p>}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogTitle>{t('문서 연결')}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            노트는 고유 ID로 연결되어 파일 이름이 바뀌어도 유지됩니다.
          </DialogDescription>
          <Input
            className="mt-4 w-full"
            aria-label={t('연결할 문서 검색')}
            placeholder={t('제목 또는 본문 검색…')}
            value={linkQuery}
            onChange={(event) => setLinkQuery(event.target.value)}
          />
          <p
            className="text-xs text-muted-foreground leading-[1.6] py-1.5 break-words"
            role="status"
          >
            {linkStatus}
          </p>
          <div className="max-h-80 overflow-y-auto">
            {linkHits.map((hit) => (
              <Button
                unstyled
                key={hit.path}
                className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2.5 text-left break-words hover:not-disabled:bg-accent disabled:opacity-60 [&>strong]:text-xs [&>strong]:font-medium [&>small]:text-xs [&>small]:text-muted-foreground"
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .insertContent({
                      type: 'wikiLink',
                      attrs: { target: wikiLinkTarget(hit), label: hit.title },
                    })
                    .run()
                  setLinkOpen(false)
                }}
              >
                <strong>{hit.title}</strong>
                <small>{hit.path}</small>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
export function NoteEditor({ document: doc, renderBase }: { document: OpenDocument; renderBase?: RenderBaseEmbed }) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const parsed = useMemo(() => {
    if (doc.kind === 'legacy') return { note: null, error: null }
    try {
      return { note: parseNote(doc.content), error: null }
    } catch (error) {
      return { note: null, error: errorText(error) }
    }
  }, [doc.content, doc.kind])
  useEffect(() => {
    const panel = scrollRef.current?.closest<HTMLElement>('.document-panel')
    if (!panel) return
    panel.style.setProperty('--note-cover-scroll', '0px')
    panel.removeAttribute('data-cover-past')
    return () => {
      panel.style.removeProperty('--note-cover-scroll')
      panel.removeAttribute('data-cover-past')
    }
  }, [doc.path])
  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      {(doc.error || parsed.error) && (
        <div
          role="alert"
          className="mx-5 mt-3 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
        >
          <AlertTriangle size={16} />
          <div className="flex-1">
            <p>{t('원본을 변경하지 않았습니다.')}</p>
            <p className="mt-1 break-all">{doc.error || parsed.error}</p>
          </div>
          {doc.error && (parsed.note || doc.kind === 'legacy') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void useVault
                  .getState()
                  .saveCopy(doc.path)
                  .catch((error) => useVault.getState().setError(errorText(error)))
              }
            >
              {t('복사본 저장')}
            </Button>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onScroll={(event) => {
          const panel = event.currentTarget.closest<HTMLElement>('.document-panel')
          if (!panel) return
          const scrollTop = event.currentTarget.scrollTop
          panel.style.setProperty('--note-cover-scroll', `${scrollTop}px`)
          panel.toggleAttribute('data-cover-past', scrollTop >= 180)
        }}
      >
        <article
          className={cn(
            'mx-auto min-h-full max-w-[820px] px-[clamp(28px,5vw,80px)] pt-11 pb-45 text-base leading-[1.85]',
            doc.kind === 'note' && 'pt-15.5',
            doc.kind === 'note' && 'group-data-[note-cover]/document:pt-44',
          )}
        >
          {doc.kind === 'legacy' ? (
            <MarkdownEditor path={doc.path} content={doc.content} renderBase={renderBase} />
          ) : parsed.note ? (
            <RichNote key={doc.path} note={parsed.note} path={doc.path} renderBase={renderBase} />
          ) : (
            <pre className="overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {doc.content}
            </pre>
          )}
        </article>
      </div>
    </div>
  )
}
