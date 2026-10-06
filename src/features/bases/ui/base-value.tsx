import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { desktop } from '@/shared/api/desktop'
import {
  BaseHTML,
  BaseIcon,
  BaseImage,
  BaseLink,
  linkPath,
  type BaseRow,
} from '@/shared/contracts/base-values'
import { propertyText } from '@/shared/contracts/properties'
import { Button } from '@/shared/ui/button'
import { FormulaIcon } from '@/shared/ui/icon'
import { cn } from '@/shared/lib/utils'
export function BaseCover({
  value,
  row,
  fit = 'cover',
  ratio = 1,
}: {
  value: unknown
  row: BaseRow
  fit?: string
  ratio?: number
}) {
  const path = linkPath(value),
    [url, setUrl] = useState(''),
    [failed, setFailed] = useState(false)
  const color = /^#[\da-f]{3,8}$/i.test(path)
  useEffect(() => {
    let cancelled = false
    setUrl('')
    setFailed(false)
    if (!path || color) return
    if (/^https:\/\//i.test(path)) {
      setUrl(path)
      return
    }
    const target = row.resolve?.(path)?.path ?? path
    void desktop
      .asset(target)
      .then((v) => {
        if (!cancelled) setUrl(v)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [path, row.resolve, color])
  if (!path) return null
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden rounded bg-muted text-xs text-muted-foreground"
      style={{ aspectRatio: Math.max(0.1, ratio), backgroundColor: color ? path : undefined }}
    >
      {url ? (
        <img
          src={url}
          alt={path}
          referrerPolicy="no-referrer"
          className={cn('size-full', fit === 'contain' ? 'object-contain' : 'object-cover')}
          onError={() => {
            setUrl('')
            setFailed(true)
          }}
        />
      ) : failed ? (
        '이미지를 불러올 수 없습니다.'
      ) : null}
    </div>
  )
}
export function BaseValue({
  value,
  row,
  onOpen,
}: {
  value: unknown
  row: BaseRow
  onOpen: (path: string) => void
}) {
  if (value instanceof BaseHTML)
    return (
      <span
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest('a')
          if (!a) return
          e.preventDefault()
          const href = a.getAttribute('href')
          if (href && /^https?:\/\//.test(href)) void desktop.openExternal(href)
        }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(value.html, {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['input', 'button', 'textarea', 'select', 'form', 'style'],
            FORBID_ATTR: ['style', 'srcset'],
          }),
        }}
      />
    )
  if (value instanceof BaseImage) return <BaseCover value={value} row={row} />
  if (value instanceof BaseIcon) return <FormulaIcon name={value.name} className="size-4" />
  if (value instanceof BaseLink || (typeof value === 'string' && /^\[\[.*\]\]$/.test(value))) {
    const path = linkPath(value),
      label =
        value instanceof BaseLink ? (value.display ?? path) : value.slice(2, -2).split('|').at(-1)
    return (
      <Button
        unstyled
        className="text-primary underline decoration-primary/30 underline-offset-2"
        onClick={() => {
          if (/^https?:\/\//.test(path)) void desktop.openExternal(path)
          else onOpen(row.resolve?.(path)?.path ?? path)
        }}
      >
        <BaseValue value={label} row={row} onOpen={onOpen} />
      </Button>
    )
  }
  if (Array.isArray(value))
    return (
      <span className="inline-flex flex-wrap gap-1">
        {value.map((v, i) => (
          <span key={i} className="rounded bg-muted px-1.5">
            <BaseValue value={v} row={row} onOpen={onOpen} />
          </span>
        ))}
      </span>
    )
  if (value instanceof Date)
    return <time dateTime={value.toISOString()}>{value.toLocaleString()}</time>
  return <>{typeof value === 'boolean' ? (value ? '☑' : '☐') : propertyText(value)}</>
}
