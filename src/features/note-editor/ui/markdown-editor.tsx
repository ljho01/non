import { baseEmbeds, type RenderBaseEmbed } from '@/shared/contracts/base-embed'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/shared/ui/button'
import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { EditorState } from '@tiptap/pm/state'
import { useVault } from '@/entities/vault'
import { displayFilename } from '@/shared/contracts/note'
import { markdownExtensions, markdownFromEditor, markdownToEditor } from '../model/markdown'
import { useWikiLinkMenu } from '../model/use-wiki-link-menu'
import { markdownWikiLink } from '../model/wiki-suggestion'
import { WikiLinkMenu } from './wiki-link-menu'

export function MarkdownEditor({
  path,
  content,
  renderBase,
}: {
  path: string
  content: string
  renderBase?: RenderBaseEmbed
}) {
  const [preview, setPreview] = useState(() => baseEmbeds(content).length > 0)
  const embeds = baseEmbeds(content)
  const root = useVault((state) => state.path)
  const wikiMenu = useWikiLinkMenu({ root, currentPath: path, allowCodeBlock: true })
  const lastContent = useRef(content)
  const editor = useEditor({
    extensions: markdownExtensions,
    content: markdownToEditor(content),
    immediatelyRender: false,
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[50vh]',
        role: 'textbox',
        'aria-label': 'Markdown 원문',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')
        if (text === undefined) return false
        event.preventDefault()
        view.dispatch(view.state.tr.insertText(text.replace(/\r\n?/g, '\n')).scrollIntoView())
        return true
      },
      handleDOMEvents: {
        keydown: (view, event) => {
          if (
            wikiMenu.handleKeyDown(event, (hit) => {
              const range = wikiMenu.menuRef.current
              if (!range) return
              wikiMenu.close()
              view.dispatch(
                view.state.tr
                  .insertText(markdownWikiLink(hit), range.from, range.to)
                  .scrollIntoView(),
              )
              view.focus()
            })
          )
            return true
          return false
        },
        blur: () => {
          wikiMenu.close()
          return false
        },
      },
    },
    onUpdate: ({ editor }) => {
      const next = markdownFromEditor(editor.state.doc.textContent, lastContent.current)
      if (next === lastContent.current) return
      lastContent.current = next
      useVault.getState().edit(path, next)
      wikiMenu.update(editor)
    },
    onSelectionUpdate: ({ editor }) => wikiMenu.update(editor),
  })
  useEffect(() => {
    if (!editor || content.length > 0) return
    editor.commands.focus('start')
  }, [content, editor])
  useEffect(() => {
    if (!editor || content === lastContent.current) return
    editor.view.updateState(
      EditorState.create({
        schema: editor.schema,
        plugins: editor.state.plugins,
        doc: editor.schema.nodeFromJSON(markdownToEditor(content)),
      }),
    )
    lastContent.current = content
  }, [editor, content])
  return (
    <div>
      <h1
        className="mb-5 truncate text-(length:--type-document-heading-1-size) font-extrabold leading-(--type-leading-tight) tracking-tight"
        title={displayFilename(path)}
      >
        {displayFilename(path)}
      </h1>
      <div className="mb-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setPreview((v) => !v)}>
          {preview ? '원문 편집' : '미리보기'}
        </Button>
      </div>
      {preview ? (
        <div className="space-y-4">
          {(() => {
            let cursor = 0
            const parts: React.ReactNode[] = []
            for (const [i, spec] of embeds.entries()) {
              parts.push(
                <ReactMarkdown key={`text-${i}`} remarkPlugins={[remarkGfm]}>
                  {content.slice(cursor, spec.start)}
                </ReactMarkdown>,
              )
              parts.push(<div key={`base-${i}`}>{renderBase?.(spec)}</div>)
              cursor = spec.end ?? cursor
            }
            parts.push(
              <ReactMarkdown key="end" remarkPlugins={[remarkGfm]}>
                {content.slice(cursor)}
              </ReactMarkdown>,
            )
            return parts
          })()}
        </div>
      ) : (
        <EditorContent editor={editor} />
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
            .insertContent(markdownWikiLink(hit))
            .run()
        }}
      />
      {!editor && <p className="text-sm text-muted-foreground">Markdown 편집기 여는 중…</p>}
    </div>
  )
}
