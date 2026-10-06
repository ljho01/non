import { useEffect, useState } from 'react'
import { Brain, Plus, Trash2, Save, Search } from '@/shared/ui/icon'
import { agentRequest } from '@/shared/api/desktop'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { cn, errorText } from '@/shared/lib/utils'
import {
  globalScope,
  memoryKey,
  scopeFolders,
  scopeLabel,
  type Memory,
  type MemoryScope,
} from '@/shared/contracts/memory'
import { useVault } from '@/entities/vault'
import { useI18n } from '@/shared/lib/i18n'
export function MemoryManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
}) {
  const { t, locale } = useI18n()
  const root = useVault((s) => s.path)
  const folder = useVault((s) => s.selectedFolder)
  const [scope, setScope] = useState<MemoryScope>(globalScope)
  const [items, setItems] = useState<Memory[]>([])
  const [selected, setSelected] = useState<Memory | null>(null)
  const [content, setContent] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [discardAction, setDiscardAction] = useState<null | (() => void)>(null)
  useEffect(() => {
    let cancelled = false
    if (open) {
      setSelected(null)
      setContent('')
      setScope(globalScope)
      setStatus('')
      setError(null)
      setItems([])
      void agentRequest<Memory[]>('memory:list', { folder })
        .then((items) => {
          if (!cancelled) setItems(items)
        })
        .catch((e) => {
          if (!cancelled) setError(errorText(e))
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, root, folder])
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await agentRequest<Memory[]>('memory:save', {
        id: selected?.id,
        content,
        original: selected?.content,
        scope: selected?.scope ?? scope,
        folder,
      })
      setItems(next)
      setSelected(null)
      setContent('')
      setScope(globalScope)
      setStatus(t('기억을 저장했습니다.'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const discardOrRun = (action: () => void) => {
    if (busy) return
    if (content.trim() && content !== selected?.content) setDiscardAction(() => action)
    else action()
  }
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (value) onOpenChange(true)
          else discardOrRun(() => onOpenChange(false))
        }}
      >
      <DialogContent className="w-[min(760px,90vw)]">
        <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
          <Brain size={20} />
          {t('기억')}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          {root
            ? `${t('전역')} → ${t('상위 폴더')} → ${folder || t('폴더 루트')}. ${t('현재 위치에 적용되는 기억입니다.')}`
            : t('전역 기억은 추가한 모든 폴더에서 공통으로 사용됩니다.')}
        </DialogDescription>
        <div className="mt-6 grid h-[380px] grid-cols-[220px_1fr] gap-5">
          <div className="flex min-h-0 flex-col">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="w-full pl-8"
                placeholder={t('기억 검색')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="mt-3 flex-1 overflow-y-auto">
              {items
                .filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
                .map((item) => (
                  <Button
                    unstyled
                    key={memoryKey(item)}
                    disabled={busy}
                    className={cn(
                      'mb-1 w-full rounded-lg p-3 text-left hover:bg-accent',
                      selected && memoryKey(selected) === memoryKey(item) && 'bg-accent',
                    )}
                    onClick={() =>
                      discardOrRun(() => {
                        setSelected(item)
                        setScope(item.scope)
                        setContent(item.content)
                        setStatus('')
                      })
                    }
                  >
                    <p className="truncate text-sm font-medium">
                      {item.content.split('\n')[0].replace(/^#+\s*/, '')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {scopeLabel(item.scope)} · {new Date(item.updated).toLocaleDateString(locale)}
                    </p>
                  </Button>
                ))}
              {!items.length && (
                <p className="px-2 py-5 text-xs leading-relaxed text-muted-foreground">
                  {t('아직 기억이 없습니다. 직접 추가하거나 대화 중 기억해 달라고 요청하세요.')}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                discardOrRun(() => {
                  setSelected(null)
                  setScope(globalScope)
                  setContent('')
                  setStatus('')
                })
              }
            >
              <Plus />
              {t('기억 추가')}
            </Button>
          </div>
          <div className="flex min-h-0 flex-col gap-3">
            <div>
              <Label htmlFor="memory-scope" className="text-xs text-muted-foreground">
                {t('저장 범위')}
              </Label>
              <Select
                disabled={busy || !!selected}
                value={scope.kind === 'global' ? 'global' : `folder:${scope.path}`}
                onValueChange={(value) =>
                  setScope(
                    value === 'global'
                      ? globalScope
                      : { kind: 'folder', path: value.slice(7) },
                  )
                }
              >
                <SelectTrigger id="memory-scope" aria-label="기억 저장 범위" className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">{t('전역 (기본 · 모든 폴더 공통)')}</SelectItem>
                  {root &&
                    scopeFolders(folder).map((path) => (
                      <SelectItem key={path || 'root'} value={`folder:${path}`}>
                        {path || t('폴더 루트')} · {t('폴더')}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              disabled={busy}
              className="flex-1 resize-none p-4 text-sm leading-relaxed"
              aria-label={t('기억 내용')}
              placeholder={t('# 기억 제목\n\nAI가 기억할 내용을 적어 주세요.')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex justify-between">
              {selected ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      setError(null)
                      setItems(
                        await agentRequest<Memory[]>('memory:delete', {
                          id: selected.id,
                          scope: selected.scope,
                          original: selected.content,
                          folder,
                        }),
                      )
                      setSelected(null)
                      setContent('')
                      setScope(globalScope)
                      setStatus(t('해당 범위의 휴지통으로 옮겼습니다. 파일을 복원할 수 있습니다.'))
                    } catch (e) {
                      setError(errorText(e))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <Trash2 />
                  {t('휴지통')}
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" disabled={busy || !content.trim()} onClick={() => void save()}>
                <Save />
                {t('저장')}
              </Button>
            </div>
          </div>
        </div>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          {status ||
            (scope.kind === 'global'
              ? t('전역 기억은 이 기기의 앱 데이터에 저장됩니다. iCloud 자동 동기화 대상이 아닙니다.')
              : t('폴더 기억은 해당 폴더의 .non/memory/에 저장되며 하위 폴더에 상속됩니다.'))}
        </p>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(discardAction)} onOpenChange={(value) => !value && setDiscardAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">{t('저장하지 않은 편집을 버릴까요?')}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {t('현재 기억에 입력한 변경사항은 복구할 수 없습니다.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('계속 편집')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = discardAction
                setDiscardAction(null)
                action?.()
              }}
            >
              {t('변경사항 버리기')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
