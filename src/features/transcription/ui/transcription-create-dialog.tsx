import { useState } from 'react'
import { useTranscription } from '@/entities/transcription'
import { useVault } from '@/entities/vault'
import type { TranscriptionLanguage } from '@/shared/contracts/transcription'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { AudioWaveform, File, Mic } from '@/shared/ui/icon'
import { Label } from '@/shared/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'
import { useI18n } from '@/shared/lib/i18n'

type Source = 'file' | 'microphone'

export function TranscriptionCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const [source, setSource] = useState<Source>('microphone')
  const [language, setLanguage] = useState<TranscriptionLanguage>('Korean')

  const create = () => {
    onOpenChange(false)
    const folder = useVault.getState().selectedFolder
    if (source === 'microphone') void useTranscription.getState().createLive(language, folder)
    else void useTranscription.getState().create(language, folder)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(500px,90vw)] p-0">
        <div className="border-b border-border px-6 pt-6 pb-5">
          <div className="mb-3 grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <AudioWaveform />
          </div>
          <DialogTitle className="text-lg font-semibold">{t('새 전사 세션')}</DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t('오디오 입력과 언어를 선택하세요.')}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-6 px-6 py-5">
          <div className="space-y-2.5">
            <Label className="text-sm font-medium">{t('입력')}</Label>
            <ToggleGroup
              type="single"
              value={source}
              onValueChange={(value) => {
                if (value === 'file' || value === 'microphone') setSource(value)
              }}
              className="grid grid-cols-2 gap-2"
              aria-label="전사 입력 선택"
            >
              <ToggleGroupItem
                value="microphone"
                variant="outline"
                className="h-auto min-h-20 flex-col items-start gap-1.5 rounded-xl px-4 py-3 text-left data-[state=on]:border-primary/35 data-[state=on]:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Mic className="size-4" />
                  {t('실시간 마이크')}
                </span>
                <span className="text-xs font-normal leading-relaxed text-muted-foreground">
                  {t('마이크 입력을 들으며 자막을 바로 표시합니다.')}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="file"
                variant="outline"
                className="h-auto min-h-20 flex-col items-start gap-1.5 rounded-xl px-4 py-3 text-left data-[state=on]:border-primary/35 data-[state=on]:bg-accent"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <File className="size-4" />
                  {t('오디오 파일')}
                </span>
                <span className="text-xs font-normal leading-relaxed text-muted-foreground">
                  {t('녹음 파일을 실시간 속도로 전사합니다.')}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="transcription-language" className="text-sm font-medium">
              {t('음성 언어')}
            </Label>
            <Select
              value={language}
              onValueChange={(value) => {
                if (value === 'Korean' || value === 'English') setLanguage(value)
              }}
            >
              <SelectTrigger id="transcription-language" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Korean">{t('한국어')}</SelectItem>
                <SelectItem value="English">English</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('현재 로컬 live 프로필은 한국어와 영어를 지원합니다.')}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('취소')}</Button>
          <Button onClick={create}>
            {source === 'microphone' ? <Mic /> : <File />}
            {source === 'microphone' ? t('실시간 전사 시작') : t('파일 선택')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
