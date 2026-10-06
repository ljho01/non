import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Settings2,
  Sparkles,
  Database,
  Info,
  ExternalLink,
  Check,
  Moon,
  Sun,
  Monitor,
  AlertTriangle,
  Brain,
  FolderOpen,
  Plus,
  Trash2,
  Archive,
  ArchiveRestore,
  AudioWaveform,
  FileText,
  Folder,
} from '@/shared/ui/icon'
import { useSettings, type Theme } from '@/entities/settings'
import { useAgent, type AiProviderId } from '@/entities/agent'
import { useVault } from '@/entities/vault'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/spinner'
import { Switch } from '@/shared/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/ui/dialog'
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
import { cn, errorText } from '@/shared/lib/utils'
import { desktop, isDesktop, type ArchivedEntry } from '@/shared/api/desktop'
import type { InstalledSkill } from '@/shared/contracts/skill'
import type { ArchivedTranscriptionSession } from '@/shared/contracts/transcription'
import { displayFilename } from '@/shared/contracts/note'
import { appLanguages, languageNames, useI18n, type AppLanguage } from '@/shared/lib/i18n'

const sections = [
  { id: 'general', label: 'general', icon: Settings2 },
  { id: 'account', label: 'AI 계정', icon: Sparkles },
  { id: 'skills', label: '스킬', icon: Brain },
  { id: 'data', label: '데이터 및 기억', icon: Database },
  { id: 'archived', label: 'Archived', icon: Archive },
  { id: 'about', label: '앱 정보', icon: Info },
] as const

const themeSampleClass = {
  light: 'bg-white [&>span]:bg-[#e9e9e9] [&_i]:bg-[#dedede]',
  dark: 'bg-[#212121] [&>span]:bg-[#171717] [&_i]:bg-[#505050]',
  system:
    'bg-[linear-gradient(90deg,#fff_42%,#212121_42%)] [&_i]:bg-[#9b9b9b]',
} as const satisfies Record<Theme, string>
type PreferencesSection = (typeof sections)[number]['id']

type ArchivedItem =
  | { source: 'vault'; entry: ArchivedEntry }
  | { source: 'transcription'; entry: ArchivedTranscriptionSession }

function mergeArchivedItems(
  vaultItems: ArchivedEntry[],
  transcriptionItems: ArchivedTranscriptionSession[],
) {
  const archivedFolders = vaultItems
    .filter((entry) => entry.kind === 'folder')
    .map((entry) => entry.originalPath)
  return [
    ...vaultItems.map((entry): ArchivedItem => ({ source: 'vault', entry })),
    ...transcriptionItems
      .filter(
        (entry) =>
          !archivedFolders.some((folder) => entry.originalPath.startsWith(`${folder}/`)),
      )
      .map((entry): ArchivedItem => ({ source: 'transcription', entry })),
  ].sort((left, right) => right.entry.archivedAt - left.entry.archivedAt)
}

const settingsRowClass =
  'flex min-h-18 items-center justify-between gap-7 px-5 py-4 text-sm [&_h3]:text-sm [&_h3]:font-medium [&_p]:mt-1 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&>button]:shrink-0 [&>label]:shrink-0'
const settingsSidebarItemClass =
  'm-0 flex min-h-8 w-full min-w-0 items-center justify-start gap-2 rounded-lg px-2 py-0.5 text-left text-sm tracking-tight hover:bg-accent focus-visible:bg-accent [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground'

function SettingsGroup({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mt-9', className)}>
      <h3 className="mb-3 px-0.5 text-sm font-semibold tracking-tight">{label}</h3>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/35">
        {children}
      </div>
    </section>
  )
}

const aiProviders: ReadonlyArray<{
  id: AiProviderId
  title: string
  description: string
  action: string
  kind: 'oauth' | 'api-key'
}> = [
  {
    id: 'openai-codex',
    title: 'ChatGPT Plus/Pro',
    description: 'ChatGPT 구독으로 지원되는 Codex 모델을 사용합니다.',
    action: 'ChatGPT로 로그인',
    kind: 'oauth',
  },
  {
    id: 'claude-code',
    title: 'Claude Pro/Max',
    description: 'Claude 구독을 연결하고 지원되는 Claude 모델을 사용합니다.',
    action: 'Claude로 로그인',
    kind: 'oauth',
  },
  {
    id: 'openai',
    title: 'OpenAI API 키',
    description: '본인 OpenAI API 키로 사용량을 직접 결제합니다.',
    action: 'API 키 설정',
    kind: 'api-key',
  },
  {
    id: 'anthropic-api',
    title: 'Anthropic API 키',
    description: '본인 Anthropic API 키로 사용량을 직접 결제합니다.',
    action: 'API 키 설정',
    kind: 'api-key',
  },
]

export function Preferences({
  open,
  onOpenChange,
  onMemory,
  initialSection = 'general',
  sidebarWidth,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMemory?: () => void
  initialSection?: PreferencesSection
  sidebarWidth: number
}) {
  const { t, locale } = useI18n()
  const settings = useSettings()
  const auth = useAgent()
  const root = useVault((s) => s.path)
  const [code, setCode] = useState('')
  const [section, setSection] = useState<PreferencesSection>(initialSection)
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [skillBusy, setSkillBusy] = useState<string | null>(null)
  const [skillError, setSkillError] = useState('')
  const [skillToRemove, setSkillToRemove] = useState<InstalledSkill | null>(null)
  const [archived, setArchived] = useState<ArchivedItem[]>([])
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null)
  const [archiveError, setArchiveError] = useState('')
  const [archiveToDelete, setArchiveToDelete] = useState<ArchivedItem | null>(null)
  const connectedProviders = new Set(
    auth.providers.filter((provider) => provider.connected).map((provider) => provider.id),
  )
  const availableModels = auth.models.filter((model) => connectedProviders.has(model.provider))
  const archivedDate = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  useEffect(() => {
    if (open) setSection(initialSection)
  }, [initialSection, open])

  useEffect(() => {
    if (!open || section !== 'skills') return
    let alive = true
    setSkillError('')
    setSkillBusy('list')
    void desktop.skills
      .list()
      .then((items) => {
        if (alive) setSkills(items)
      })
      .catch((error) => {
        if (alive) setSkillError(errorText(error))
      })
      .finally(() => {
        if (alive) setSkillBusy(null)
      })
    return () => {
      alive = false
    }
  }, [open, section])

  const loadArchived = async () => {
    if (!root) {
      setArchived([])
      return
    }
    const [vaultItems, transcriptionItems] = await Promise.all([
      desktop.listArchived(),
      desktop.transcription.listArchived(),
    ])
    setArchived(mergeArchivedItems(vaultItems, transcriptionItems))
  }

  useEffect(() => {
    if (!open || section !== 'archived' || !root) return
    if (!isDesktop) {
      setArchived([])
      setArchiveBusy(null)
      setArchiveError('')
      return
    }
    let alive = true
    setArchiveBusy('list')
    setArchiveError('')
    void Promise.all([desktop.listArchived(), desktop.transcription.listArchived()])
      .then(([vaultItems, transcriptionItems]) => {
        if (!alive) return
        setArchived(mergeArchivedItems(vaultItems, transcriptionItems))
      })
      .catch((error) => {
        if (alive) setArchiveError(errorText(error))
      })
      .finally(() => {
        if (alive) setArchiveBusy(null)
      })
    return () => {
      alive = false
    }
  }, [open, root, section])

  const restoreArchive = async (item: ArchivedItem) => {
    setArchiveBusy(item.entry.id)
    setArchiveError('')
    try {
      if (item.source === 'vault') {
        const nestedTranscriptions =
          item.entry.kind === 'folder'
            ? (await desktop.transcription.listArchived()).filter((entry) =>
                entry.originalPath.startsWith(`${item.entry.originalPath}/`),
              )
            : []
        await desktop.restoreArchived(item.entry.id)
        for (const entry of nestedTranscriptions)
          await desktop.transcription.restoreArchived(entry.id)
        await useVault.getState().refresh()
      } else {
        await desktop.transcription.restoreArchived(item.entry.id)
      }
      await loadArchived()
    } catch (error) {
      setArchiveError(errorText(error))
    } finally {
      setArchiveBusy(null)
    }
  }

  const deleteArchive = async (item: ArchivedItem) => {
    setArchiveBusy(item.entry.id)
    setArchiveError('')
    try {
      if (item.source === 'vault') {
        const nestedTranscriptions =
          item.entry.kind === 'folder'
            ? (await desktop.transcription.listArchived()).filter((entry) =>
                entry.originalPath.startsWith(`${item.entry.originalPath}/`),
              )
            : []
        await desktop.deleteArchived(item.entry.id)
        for (const entry of nestedTranscriptions) await desktop.transcription.remove(entry.id)
      } else await desktop.transcription.remove(item.entry.id)
      await loadArchived()
    } catch (error) {
      setArchiveError(errorText(error))
    } finally {
      setArchiveBusy(null)
    }
  }

  const updateSkill = async (id: string, enabled: boolean) => {
    setSkillBusy(id)
    setSkillError('')
    try {
      setSkills(await desktop.skills.setEnabled(id, enabled))
    } catch (error) {
      setSkillError(errorText(error))
    } finally {
      setSkillBusy(null)
    }
  }

  const installSkill = async () => {
    setSkillBusy('install')
    setSkillError('')
    try {
      const installed = await desktop.skills.install()
      if (installed) setSkills(await desktop.skills.list())
    } catch (error) {
      setSkillError(errorText(error))
    } finally {
      setSkillBusy(null)
    }
  }

  const removeSkill = async (id: string) => {
    setSkillBusy(id)
    setSkillError('')
    try {
      setSkills(await desktop.skills.remove(id))
    } catch (error) {
      setSkillError(errorText(error))
    } finally {
      setSkillBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layout="page"
        className="grid overflow-hidden bg-background"
        style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          document.getElementById('settings-back')?.focus()
        }}
      >
        <DialogTitle className="sr-only">{t('settings')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('화면, AI 계정, 로컬 데이터와 기억 설정')}
        </DialogDescription>
        <aside className="flex min-h-0 flex-col overflow-hidden bg-sidebar px-2 pb-5">
          <div className="h-10 min-h-10" data-window-drag-region />
          <Button
            unstyled
            id="settings-back"
            className={cn(settingsSidebarItemClass, 'mb-4')}
            onClick={() => onOpenChange(false)}
          >
            <ArrowLeft />
            {t('돌아가기')}
          </Button>
          <nav aria-label={t('설정 항목')} className="flex min-h-0 flex-col gap-px overflow-y-auto">
            {sections.map(({ id, label, icon: Icon }) => (
              <Button
                unstyled
                key={id}
                className={cn(
                  settingsSidebarItemClass,
                  section === id && 'bg-accent text-foreground',
                )}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => setSection(id)}
              >
                <Icon />
                {t(label)}
              </Button>
            ))}
          </nav>
          <div className="mt-auto flex shrink-0 items-center gap-2.5 px-3 pt-5 text-sm [&_small]:mt-0.5 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground">
            <span className="grid place-items-center size-[30px] flex-none rounded-full bg-[#d5d5d5] text-[#383838] text-sm font-semibold">N</span>
            <span>
              Non<small>{t('내 기기의 개인 공간')}</small>
            </span>
          </div>
        </aside>
        <main className="bg-background min-w-0 overflow-y-auto">
          <div className="h-10 min-h-10" data-window-drag-region />
          <div className="mx-auto max-w-[820px] px-12 pt-4.5 pb-22.5 [&>h2]:mb-7.5 [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:tracking-tight">
            <h2>{t(sections.find((item) => item.id === section)?.label ?? '')}</h2>
            {section === 'general' && (
              <>
                <SettingsGroup label={t('화면')}>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('테마')}</h3>
                      <p>{t('Non의 화면 스타일을 선택하세요.')}</p>
                    </div>
                    <Select
                      value={settings.theme}
                      onValueChange={(value) => settings.setTheme(value as Theme)}
                    >
                      <SelectTrigger aria-label={t('테마')} className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">{t('시스템 설정 사용')}</SelectItem>
                        <SelectItem value="light">{t('라이트')}</SelectItem>
                        <SelectItem value="dark">{t('다크')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={settings.theme}
                    onValueChange={(value) => value && settings.setTheme(value as Theme)}
                    className="grid grid-cols-3 gap-3.5 p-4"
                    aria-label={t('테마 미리보기')}
                  >
                    {(
                      [
                        { value: 'light', label: t('라이트'), icon: Sun },
                        { value: 'dark', label: t('다크'), icon: Moon },
                        { value: 'system', label: t('시스템'), icon: Monitor },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => (
                      <ToggleGroupItem
                        key={value}
                        value={value}
                        className="h-auto min-w-0 w-full flex-col items-stretch justify-start rounded-xl border border-border p-2 text-left data-[state=on]:border-foreground"
                        aria-label={`${label} 테마`}
                      >
                        <div
                          className={cn(
                            'grid h-24 w-full shrink-0 grid-cols-[27%_1fr] overflow-hidden rounded-md border border-black/5',
                            themeSampleClass[value],
                          )}
                        >
                          <span />
                          <div className="px-4 py-5.5">
                            <i className="mb-2 block h-1 rounded" />
                            <i className="mb-2 block h-1 rounded" />
                            <i className="block h-1 w-3/5 rounded" />
                          </div>
                        </div>
                        <span className="flex items-center gap-2 px-1 pb-1 pt-3 text-xs">
                          <Icon size={14} />
                          {label}
                          {settings.theme === value && <Check size={14} className="ml-auto" />}
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('언어')}</h3>
                      <p>{t('앱에서 사용할 언어를 선택하세요.')}</p>
                    </div>
                    <Select
                      value={settings.language}
                      onValueChange={(value) => {
                        if (appLanguages.includes(value as AppLanguage)) {
                          settings.setLanguage(value as AppLanguage)
                        }
                      }}
                    >
                      <SelectTrigger aria-label={t('언어')} className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {appLanguages.map((language) => (
                          <SelectItem key={language} value={language}>
                            {languageNames[language]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </SettingsGroup>
                <SettingsGroup label={t('레이아웃')}>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('사이드바')}</h3>
                      <p>
                        {t('폴더와 노트 탐색을 표시합니다.')} <kbd>⌘B</kbd>
                      </p>
                    </div>
                    <Switch
                      checked={settings.showSidebar}
                      onCheckedChange={(checked) => settings.patch({ showSidebar: checked })}
                      aria-label={t('사이드바')}
                    />
                  </div>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('AI 패널')}</h3>
                      <p>
                        {t('문서 옆에서 대화를 이어갑니다.')} <kbd>⌘J</kbd>
                      </p>
                    </div>
                    <Switch
                      checked={settings.showChat}
                      onCheckedChange={(checked) => settings.patch({ showChat: checked })}
                      aria-label={t('AI 패널')}
                    />
                  </div>
                </SettingsGroup>
              </>
            )}
            {section === 'account' && (
              <>
                <SettingsGroup label={t('연결')}>
                  {aiProviders.map((provider) => {
                    const connection = auth.providers.find((item) => item.id === provider.id)
                    const connected = Boolean(connection?.connected)
                    const busy = auth.loadingProvider === provider.id
                    return (
                      <div className={cn(settingsRowClass, 'items-start')} key={provider.id}>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3>{provider.title}</h3>
                            <Badge variant={connected ? 'secondary' : 'outline'}>
                              {connected && <Check size={14} />}
                              {connected ? t('연결됨') : t('연결되지 않음')}
                            </Badge>
                          </div>
                          <p>{t(provider.description)}</p>
                        </div>
                        <div className="flex flex-none flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            disabled={Boolean(auth.loadingProvider)}
                            onClick={() =>
                              void (provider.kind === 'oauth'
                                ? auth.login(provider.id as 'openai-codex' | 'claude-code')
                                : auth.setApiKey(provider.id as 'openai' | 'anthropic-api'))
                            }
                          >
                            {busy && <Spinner />}
                            {connected ? t('다시 연결') : t(provider.action)}
                          </Button>
                          {connected && (
                            <Button
                              variant="destructive"
                              disabled={Boolean(auth.loadingProvider)}
                              onClick={() => void auth.logout(provider.id)}
                            >
                              {t('연결 해제')}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </SettingsGroup>
                {auth.loadingProvider && (
                  <div className="flex gap-2 mt-6 mb-4.5">
                    <Button variant="ghost" onClick={() => void auth.cancel()}>
                      {t('취소')}
                    </Button>
                  </div>
                )}
                {auth.loginUrl && (
                  <Button
                    variant="secondary"
                    className="mt-4"
                    onClick={() => {
                      if (auth.loginUrl) void desktop.openExternal(auth.loginUrl)
                    }}
                  >
                    <ExternalLink />
                    {t('로그인 페이지 다시 열기')}
                  </Button>
                )}
                {auth.prompt && (
                  <form
                    className="mt-5 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void auth.answer(code)
                    }}
                  >
                    <Input
                      className="flex-1"
                      aria-label="로그인 콜백 URL"
                      placeholder={t('로그인 후 리디렉션 URL 붙여넣기')}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    <Button type="submit">{t('확인')}</Button>
                  </form>
                )}
                {auth.error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertDescription>{auth.error}</AlertDescription>
                  </Alert>
                )}
                <SettingsGroup label={t('모델 및 권한')}>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('기본 모델')}</h3>
                      <p>{t('연결된 구독 또는 API 키에서 사용할 모델입니다.')}</p>
                    </div>
                    <Select
                      value={
                        availableModels.some((model) => model.key === settings.selectedModel)
                          ? settings.selectedModel
                          : availableModels[0]?.key || ''
                      }
                      disabled={!availableModels.length}
                      onValueChange={(value) => settings.patch({ selectedModel: value })}
                    >
                      <SelectTrigger aria-label="기본 모델" className="w-64 max-w-full">
                        <SelectValue placeholder={t('AI 계정을 먼저 연결하세요')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((model) => (
                          <SelectItem key={model.key} value={model.key}>
                            {model.providerName} · {model.name}
                            {model.input.includes('image') ? ` · ${t('이미지')}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('에이전트 샌드박스')}</h3>
                      <p>
                        {t('켜면 파일 읽기와 쓰기를 문서/non 내부로 제한합니다.')}
                        <br />
                        {t('끄면 이 Mac의 다른 경로에도 접근할 수 있습니다.')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.agentSandbox}
                      onCheckedChange={(checked) => settings.patch({ agentSandbox: checked })}
                      aria-label="에이전트 샌드박스"
                    />
                  </div>
                </SettingsGroup>
                {!settings.agentSandbox && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle />
                    <AlertDescription>
                      {t('에이전트가 문서/non 밖의 파일을 읽고 생성하거나 수정할 수 있습니다. 셸 실행은 허용되지 않으며, 읽은 내용은 선택한 AI 제공자에 전송될 수 있습니다.')}
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-muted-foreground text-xs leading-[1.9] mt-6">
                  {t('인증 정보는 macOS 보안 저장소로 암호화되어 이 기기에만 보관됩니다. API 키는 React 화면이나 문서 폴더, iCloud로 전달되지 않습니다.')}
                </p>
              </>
            )}
            {section === 'skills' && (
              <>
                <SettingsGroup label={t('관리')}>
                  <div className={cn(settingsRowClass, 'flex-wrap gap-4')}>
                    <p className="max-w-xl flex-1 text-sm leading-relaxed text-muted-foreground">
                      {t('작업별 지침을 담은 SKILL.md 폴더를 설치합니다. 스킬은 이 기기의 Application Support에 저장되며 문서 폴더나 iCloud에 들어가지 않습니다.')}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={skillBusy !== null}
                        onClick={() => void desktop.skills.reveal()}
                      >
                        <FolderOpen />
                        {t('폴더 열기')}
                      </Button>
                      <Button disabled={skillBusy !== null} onClick={() => void installSkill()}>
                        {skillBusy === 'install' ? <Spinner /> : <Plus />}
                        {t('폴더에서 설치')}
                      </Button>
                    </div>
                  </div>
                </SettingsGroup>
                <Alert className="mt-5">
                  <Brain />
                  <AlertDescription>
                    {t('활성화한 스킬의 설명은 AI에 표시되며, 관련 작업에서는 지침과 참조 텍스트를 선택한 AI 제공자에게 전송할 수 있습니다. 스킬 자체는 코드를 실행하지 않습니다.')}
                  </AlertDescription>
                </Alert>
                {skillError && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertDescription>{skillError}</AlertDescription>
                  </Alert>
                )}
                <SettingsGroup label={t('설치된 스킬')}>
                  {skills.map((skill) => (
                    <div
                      key={skill.id}
                      className={cn(settingsRowClass, 'items-start')}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-medium">{skill.name}</h3>
                          <Badge variant={skill.enabled ? 'secondary' : 'outline'}>
                            {skill.enabled ? t('활성') : t('비활성')}
                          </Badge>
                          {skill.builtIn && <Badge variant="outline">{t('기본 제공')}</Badge>}
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {skill.description}
                        </p>
                        {skill.error && (
                          <p className="mt-3 text-xs leading-relaxed text-destructive">
                            {skill.error}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {skillBusy === skill.id && <Spinner />}
                        <Switch
                          checked={skill.enabled}
                          disabled={skillBusy !== null || Boolean(skill.error)}
                          aria-label={`${skill.name} 활성화`}
                          onCheckedChange={(checked) => void updateSkill(skill.id, checked)}
                        />
                        {!skill.builtIn && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={skillBusy !== null}
                            aria-label={`${skill.name} 삭제`}
                            onClick={() => setSkillToRemove(skill)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!skills.length && skillBusy === 'list' && (
                    <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
                      <Spinner /> {t('스킬 확인 중…')}
                    </div>
                  )}
                  {!skills.length && skillBusy !== 'list' && (
                    <div className="px-5 py-12 text-center">
                      <Brain className="mx-auto text-muted-foreground" />
                      <p className="mt-3 text-sm text-muted-foreground">{t('설치된 스킬이 없습니다.')}</p>
                    </div>
                  )}
                </SettingsGroup>
              </>
            )}
            {section === 'data' && (
              <>
                <SettingsGroup label={t('문서')}>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('문서 폴더')}</h3>
                      <p className="break-all">{root || t('문서/non을 여는 중입니다.')}</p>
                    </div>
                  </div>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('로컬 우선 저장')}</h3>
                      <p>
                        {t('노트는 확장 가능한 JSON, PDF는 원본 파일로 보관합니다.')}
                        <br />
                        {t('JSON 노트와 Markdown을 작성·편집하고 PDF를 읽을 수 있습니다.')}
                      </p>
                    </div>
                  </div>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>iCloud Drive</h3>
                      <p>
                        {t('iCloud 폴더를 선택하면 macOS가 문서와 폴더 기억을 동기화합니다.')}
                        <br />
                        {t('전역 기억은 현재 기기 로컬이며 자동 동기화되지 않습니다.')}
                      </p>
                    </div>
                  </div>
                </SettingsGroup>
                <SettingsGroup label={t('기억')}>
                  <div className={settingsRowClass}>
                    <div>
                      <h3>{t('기억 관리')}</h3>
                      <p>{t('기본은 전역 기억이며, 폴더 기억은 하위 폴더로 상속됩니다.')}</p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={!onMemory}
                      onClick={() => {
                        onOpenChange(false)
                        onMemory?.()
                      }}
                    >
                      {t('관리')}
                    </Button>
                  </div>
                </SettingsGroup>
                <p className="text-muted-foreground text-xs leading-[1.9] mt-6">
                  {t('여러 기기에서 동시에 편집한 변경 사항은 자동 병합되지 않습니다. 저장 충돌이 감지되면 편집 내용을 복사본으로 보존할 수 있습니다.')}
                </p>
              </>
            )}
            {section === 'archived' && (
              <>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t(
                    '보관한 항목은 파일 탐색기에서 숨겨집니다. 복구하면 원래 위치로 돌아가며, 영구 삭제한 항목은 되돌릴 수 없습니다.',
                  )}
                </p>
                {archiveError && (
                  <Alert variant="destructive" className="mt-5">
                    <AlertDescription>{archiveError}</AlertDescription>
                  </Alert>
                )}
                <SettingsGroup label={t('보관된 항목')} className="mt-7">
                  {archived.map((item) => {
                    const entry = item.entry
                    const title =
                      item.source === 'transcription'
                        ? item.entry.title
                        : item.entry.kind === 'folder'
                          ? item.entry.name
                          : displayFilename(item.entry.name)
                    const ItemIcon =
                      item.source === 'transcription'
                        ? AudioWaveform
                        : item.entry.kind === 'folder'
                          ? Folder
                          : FileText
                    return (
                      <div
                        key={`${item.source}:${entry.id}`}
                        className={cn(settingsRowClass, 'items-center')}
                      >
                        <div className="flex min-w-0 items-center gap-3.5">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground shadow-sm ring-1 ring-border">
                            <ItemIcon size={17} />
                          </span>
                          <div className="min-w-0">
                            <h3 className="truncate">{title}</h3>
                            <p className="truncate" title={entry.originalPath}>
                              {entry.originalPath} · {archivedDate.format(entry.archivedAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={archiveBusy !== null}
                            aria-label={`${title} ${t('복구')}`}
                            title={t('복구')}
                            onClick={() => void restoreArchive(item)}
                          >
                            {archiveBusy === entry.id ? <Spinner /> : <ArchiveRestore />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={archiveBusy !== null}
                            aria-label={`${title} ${t('영구 삭제')}`}
                            title={t('영구 삭제')}
                            className="text-destructive hover:text-destructive"
                            onClick={() => setArchiveToDelete(item)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {!archived.length && archiveBusy === 'list' && (
                    <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
                      <Spinner /> {t('보관된 항목 확인 중…')}
                    </div>
                  )}
                  {!archived.length && archiveBusy !== 'list' && (
                    <div className="px-5 py-12 text-center">
                      <Archive className="mx-auto text-muted-foreground" />
                      <p className="mt-3 text-sm text-muted-foreground">{t('보관된 항목이 없습니다.')}</p>
                    </div>
                  )}
                </SettingsGroup>
              </>
            )}
            {section === 'about' && (
              <>
                <div className="pt-5 pb-8.5 [&_h3]:text-2xl [&_h3]:font-semibold [&_p]:mt-2 [&_p]:text-sm [&_p]:text-muted-foreground">
                  <span className="size-16 grid place-items-center border border-border rounded-[18px] text-3xl font-medium mb-5">N</span>
                  <h3>Non</h3>
                  <p>{t('노트를 쓰고, PDF를 읽고, AI와 생각을 이어가세요.')}</p>
                </div>
                <SettingsGroup label={t('앱')}>
                  <div className={settingsRowClass}>
                    <h3>{t('버전')}</h3>
                    <span>0.1.0 · {t('개발 빌드')}</span>
                  </div>
                  <div className={settingsRowClass}>
                    <h3>{t('실행 환경')}</h3>
                    <span>Electron · Chromium + Node.js</span>
                  </div>
                </SettingsGroup>
                <p className="text-muted-foreground text-xs leading-[1.9] mt-6">
                  {t('데스크톱 전용 앱입니다. 문서와 기억은 사용자 소유의 로컬 파일로 저장됩니다.')}
                </p>
              </>
            )}
          </div>
        </main>
        <AlertDialog
          open={Boolean(skillToRemove)}
          onOpenChange={(next) => !next && setSkillToRemove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{skillToRemove?.name} {t('삭제')}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
                {t('스킬을 비활성화하고 설치 폴더를 휴지통으로 이동합니다.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('취소')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const skill = skillToRemove
                  setSkillToRemove(null)
                  if (skill) void removeSkill(skill.id)
                }}
              >
                {t('삭제')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={Boolean(archiveToDelete)}
          onOpenChange={(next) => !next && setArchiveToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('영구 삭제')}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
                {t('이 항목과 그 내용을 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('취소')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const item = archiveToDelete
                  setArchiveToDelete(null)
                  if (item) void deleteArchive(item)
                }}
              >
                {t('영구 삭제')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
