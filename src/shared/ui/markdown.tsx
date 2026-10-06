import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { desktop } from '@/shared/api/desktop'
import { useI18n } from '@/shared/lib/i18n'
export function Markdown({ text }: { text: string }) {
  const { t } = useI18n()
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href && /^https?:\/\//.test(href)) void desktop.openExternal(href)
              }}
            >
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span className="text-muted-foreground">[{t('이미지')}: {alt || t('첨부 이미지')}]</span>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
