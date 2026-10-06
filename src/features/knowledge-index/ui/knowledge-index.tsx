import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, File, FileText, RefreshCw, Link2 } from '@/shared/ui/icon'
import { useVault } from '@/entities/vault'
import { knowledge } from '@/shared/api/knowledge'
import type { IndexedLink, IndexSnapshot, SearchHit } from '@/shared/contracts/links'
import { errorText } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { useI18n } from '@/shared/lib/i18n'

function openPath(path: string) {
  void useVault
    .getState()
    .openFile(path)
    .catch((error) => useVault.getState().setError(errorText(error)))
}

export function DocumentSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const root = useVault((state) => state.path)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [status, setStatus] = useState(() => t('제목이나 본문을 입력하세요.'))
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHits([])
    setActiveIndex(0)
    setStatus(root ? t('현재 폴더의 제목과 본문을 검색합니다.') : t('먼저 폴더를 추가하세요.'))
  }, [open, root, t])

  useEffect(() => {
    const value = query.trim()
    if (!open) return
    if (!value || !root) {
      setHits([])
      setActiveIndex(0)
      setStatus(root ? t('현재 폴더의 제목과 본문을 검색합니다.') : t('먼저 폴더를 추가하세요.'))
      return
    }
    let alive = true
    setHits([])
    setActiveIndex(0)
    setStatus(t('검색 중…'))
    const timer = setTimeout(() => {
      void knowledge
        .search(value)
        .then((result) => {
          if (!alive) return
          setHits(result)
          setActiveIndex(0)
          setStatus(result.length ? `${result.length} ${t('검색 결과')}` : t('검색 결과가 없습니다.'))
        })
        .catch((error) => {
          if (alive) setStatus(errorText(error))
        })
    }, 160)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [open, query, root, t])

  const choose = (path: string) => {
    onOpenChange(false)
    openPath(path)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && hits.length) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % hits.length)
    }
    if (event.key === 'ArrowUp' && hits.length) {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + hits.length) % hits.length)
    }
    if (event.key === 'Enter' && hits[activeIndex]) {
      event.preventDefault()
      choose(hits[activeIndex].path)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed left-1/2 top-[clamp(32px,8vh,72px)] w-[min(680px,calc(100vw-40px))] max-h-[calc(100vh-64px)] p-0 overflow-hidden translate-x-[-50%] translate-y-0 border-foreground/14 rounded-2xl bg-popover/98 shadow-[0_32px_90px_#0000004a,0_2px_12px_#00000024]"
        overlayClassName="bg-black/48 backdrop-blur-[3px]"
        showClose={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          input.current?.focus()
        }}
      >
        <DialogTitle className="sr-only">{t('문서 찾기')}</DialogTitle>
        <div className="flex min-h-[52px] items-center gap-2.5 px-3.5 pt-1.5 pb-1">
          <Input
            unstyled
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('문서 검색')}
            aria-label={t('문서 찾기')}
            aria-controls="document-search-results"
            aria-activedescendant={hits[activeIndex] ? `document-search-result-${activeIndex}` : undefined}
          />
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div
          id="document-search-results"
          className="min-h-[52px] max-h-[min(400px,60vh)] overflow-y-auto px-2 pb-2"
          role="listbox"
          aria-label="검색 결과"
        >
          <p className="min-h-6 px-2 pt-0.5 pb-1 text-muted-foreground text-sm" role="status">
            {status}
          </p>
          {hits.map((hit, index) => (
            <Button
              unstyled
              id={`document-search-result-${index}`}
              key={hit.path}
              className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 w-full min-h-12 px-2 py-1.5 rounded-[10px] text-left hover:bg-foreground/8 data-[active=true]:bg-foreground/8"
              data-active={index === activeIndex}
              role="option"
              aria-selected={index === activeIndex}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => choose(hit.path)}
            >
              <span className="grid size-6 place-items-center text-muted-foreground [&>svg]:size-[18px]">
                {hit.kind === 'pdf' ? <File /> : <FileText />}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong className="truncate text-sm font-normal leading-snug text-foreground">{hit.title}</strong>
                <small className="truncate text-xs leading-tight text-muted-foreground">{hit.path}</small>
                {hit.snippet && (
                  <span className="mt-px line-clamp-2 overflow-hidden text-xs text-muted-foreground">
                    {hit.snippet}
                  </span>
                )}
              </span>
            </Button>
          ))}
        </div>
        <div className="flex min-h-8 items-center justify-end gap-3 px-3 pt-0.5 pb-1.5 text-xs text-muted-foreground [&_kbd]:mr-0.5 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-border [&_kbd]:bg-muted [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:text-xs [&_kbd]:leading-none" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> 이동</span>
          <span><kbd>↵</kbd> 열기</span>
          <span><kbd>esc</kbd> 닫기</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function NoteLinks({ path, revision }: { path: string; revision: string }) {
  const { t } = useI18n()
  const root = useVault((s) => s.path)
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<IndexSnapshot | null>(null)
  const [error, setError] = useState('')
  const [rebuild, setRebuild] = useState(0)
  const [busy, setBusy] = useState(false)
  const lastRebuild = useRef(0)
  useEffect(() => {
    let alive = true
    let running = false
    setData(null)
    const update = async (force = false) => {
      if (running) return
      running = true
      setBusy(true)
      try {
        const result = await knowledge.query(path, force)
        if (alive) {
          setData(result)
          setError('')
        }
      } catch (err) {
        if (alive) setError(errorText(err))
      } finally {
        running = false
        if (alive) setBusy(false)
      }
    }
    const force = rebuild !== lastRebuild.current
    lastRebuild.current = rebuild
    void update(force)
    const timer = setInterval(() => void update(), 4000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [path, root, revision, rebuild])
  const renderLink = (link: IndexedLink, incoming: boolean, index: number) => {
    const target = incoming ? link.source : link.path
    return (
      <div key={`${link.source}:${link.target}:${index}`} className="index-link-row">
        <Button
          unstyled
          disabled={!target}
          className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left break-words hover:not-disabled:bg-accent disabled:opacity-60 [&>strong]:text-2xs [&>strong]:font-medium [&>small]:text-2xs [&>small]:text-muted-foreground [&>span]:mt-0.5 [&>span]:text-2xs [&>span]:leading-normal [&>span]:text-muted-foreground"
          onClick={() => target && openPath(target)}
        >
          <strong>{incoming ? link.sourceTitle : link.label}</strong>
          <small>
            {target ||
              (link.status === 'ambiguous'
                ? '같은 이름의 문서가 여러 개입니다.'
                : '연결할 문서가 없습니다.')}
          </small>
          <span>{link.context}</span>
        </Button>
        {!incoming &&
          link.status === 'ambiguous' &&
          link.candidates.map((candidate) => (
            <Button unstyled key={candidate} className="block px-3 py-0.5 text-2xs underline underline-offset-3" onClick={() => openPath(candidate)}>
              {candidate}
            </Button>
          ))}
      </div>
    )
  }
  return (
    <section className="flex-none" aria-label="문서 연결">
      <div className="flex h-8 items-center justify-end gap-0.5 px-2">
        <Button
          unstyled
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-2xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground [&>span]:text-muted-foreground"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Link2 size={14} />
          {t('백링크')} <span>{data?.backlinks.length ?? '…'}</span>
          <span className="ml-3">{t('나가는 링크')} {data?.outgoing.length ?? '…'}</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={busy}
          aria-label="파일에서 인덱스 다시 만들기"
          title="파일에서 인덱스 다시 만들기"
          onClick={() => setRebuild((value) => value + 1)}
        >
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
        </Button>
      </div>
      {error && (
        <p className="px-3 pb-1 text-right text-2xs leading-normal text-muted-foreground break-words" role="alert">
          {error}
        </p>
      )}
      {expanded && (
        <div className="max-h-52 overflow-y-auto px-3 pt-0.5 pb-2 [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h3]:text-2xs [&_h3]:font-semibold">
          <div>
            <h3>{t('이 문서를 가리키는 링크')}</h3>
            {data?.backlinks.map((link, index) => renderLink(link, true, index))}
            {!data?.backlinks.length && <p className="py-1 text-2xs leading-normal text-muted-foreground break-words">{t('아직 백링크가 없습니다.')}</p>}
          </div>
          <div>
            <h3>{t('이 문서에서 나가는 링크')}</h3>
            {data?.outgoing.map((link, index) => renderLink(link, false, index))}
            {!data?.outgoing.length && (
              <p className="py-1 text-2xs leading-normal text-muted-foreground break-words">[[노트 제목]] 또는 편집기의 링크 버튼으로 연결하세요.</p>
            )}
          </div>
          <p className="py-1 text-2xs leading-normal text-muted-foreground break-words">
            저장된 파일 기준 · {data?.documents ?? 0}개 문서 · PDF는 파일명만 검색합니다.
          </p>
          {data?.warnings.map((warning) => (
            <p key={warning} className="py-1 text-2xs leading-normal text-muted-foreground break-words" role="alert">
              {warning}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
