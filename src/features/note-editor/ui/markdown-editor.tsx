import { baseEmbeds, type RenderBaseEmbed } from '@/shared/contracts/base-embed'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/shared/ui/button'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { EditorState } from '@tiptap/pm/state'
import { useVault } from '@/entities/vault'
import { displayFilename } from '@/shared/contracts/note'
import { markdownExtensions, markdownFromEditor, markdownToEditor } from '../model/markdown'
import { useWikiLinkMenu } from '../model/use-wiki-link-menu'
import { markdownWikiLink } from '../model/wiki-suggestion'
import { WikiLinkMenu } from './wiki-link-menu'
import { NoteProperties } from './note-properties'
import { markdownPropertyParts, readProperties, writeProperty } from '@/shared/contracts/properties'
import { errorText } from '@/shared/lib/utils'
import { propertyDraft } from '../model/property-value'

export function MarkdownEditor({
  path,
  content,
  renderBase,
}: {
  path: string
  content: string
  renderBase?: RenderBaseEmbed
}) {
  const propertyState = useMemo(() => {
    try {
      return { ...markdownPropertyParts(content), properties: readProperties(path, content), error: '' }
    } catch (error) {
      return { prefix: '', body: content, properties: {}, error: errorText(error) }
    }
  }, [path, content])
  const [preview, setPreview] = useState(() => baseEmbeds(content).length > 0 || Object.keys(propertyState.properties).length > 0)
  // A repeated file-title heading stays in the source, but is shown once in reading mode.
  const firstHeading = /^# ([^\r\n]+)\r?\n(?:\r?\n)?/.exec(propertyState.body)
  const previewBody = firstHeading?.[1] === displayFilename(path)
    ? propertyState.body.slice(firstHeading[0].length) : propertyState.body
  const embeds = baseEmbeds(previewBody)
  const root = useVault((state) => state.path)
  const wikiMenu = useWikiLinkMenu({ root, currentPath: path, allowCodeBlock: true })
  const lastContent = useRef(content)
  const lastBody = useRef(propertyState.body)
  const editor = useEditor({
    extensions: markdownExtensions,
    content: markdownToEditor(propertyState.body),
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
      let current = { prefix: '', body: lastContent.current }
      try { current = markdownPropertyParts(lastContent.current) } catch { /* Invalid YAML stays editable as source. */ }
      const body = markdownFromEditor(editor.state.doc.textContent, current.body)
      const next = current.prefix + body
      lastBody.current = body
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
    lastContent.current = content
    if (propertyState.body === lastBody.current) return
    editor.view.updateState(
      EditorState.create({
        schema: editor.schema,
        plugins: editor.state.plugins,
        doc: editor.schema.nodeFromJSON(markdownToEditor(propertyState.body)),
      }),
    )
    lastBody.current = propertyState.body
  }, [editor, content, propertyState.body])
  return (
    <div>
      <h1
        className="mb-5 truncate text-(length:--type-document-heading-1-size) font-extrabold leading-(--type-leading-tight) tracking-tight"
        title={displayFilename(path)}
      >
        {displayFilename(path)}
      </h1>
      <NoteProperties
        properties={propertyState.properties}
        onChange={(name, value, previous) => {
          const current = useVault.getState().tabs.find((tab) => tab.path === path)?.content ?? lastContent.current
          if (propertyDraft(readProperties(path, current)[name]) !== propertyDraft(previous))
            throw new Error('속성이 다른 곳에서 변경되었습니다. 다시 편집하세요.')
          const next = writeProperty(path, current, name, value)
          useVault.getState().edit(path, next)
        }}
      />
      {propertyState.error && <p role="alert" className="mb-4 text-xs text-destructive">{propertyState.error}</p>}
      <div className="mb-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setPreview((v) => !v)}>
          {preview ? '원문 편집' : '미리보기'}
        </Button>
      </div>
      {preview ? (
        <div className="tiptap-note space-y-4">
          {(() => {
            let cursor = 0
            const parts: React.ReactNode[] = []
            for (const [i, spec] of embeds.entries()) {
              parts.push(
                <ReactMarkdown key={`text-${i}`} remarkPlugins={[remarkGfm]}>
                  {previewBody.slice(cursor, spec.start)}
                </ReactMarkdown>,
              )
              parts.push(<div className="base-embed-preview" key={`base-${i}`}>{renderBase?.(spec)}</div>)
              cursor = spec.end ?? cursor
            }
            parts.push(
              <ReactMarkdown key="end" remarkPlugins={[remarkGfm]}>
                {previewBody.slice(cursor)}
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
