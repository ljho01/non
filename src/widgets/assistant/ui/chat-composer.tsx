import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { useI18n } from '@/shared/lib/i18n'

function textDocument(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  }
}

export function ChatComposer({
  value,
  placeholder,
  disabled,
  onChange,
  onSubmit,
  onPasteImages,
  onMultiline,
}: {
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onPasteImages: (files: File[]) => void
  onMultiline?: (multiline: boolean) => void
}) {
  const { t } = useI18n()
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const onPasteImagesRef = useRef(onPasteImages)
  const onMultilineRef = useRef(onMultiline)
  onChangeRef.current = onChange
  onSubmitRef.current = onSubmit
  onPasteImagesRef.current = onPasteImages
  onMultilineRef.current = onMultiline

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bulletList: false,
          codeBlock: false,
          heading: false,
          horizontalRule: false,
          listItem: false,
          orderedList: false,
        }),
        Placeholder.configure({ placeholder }),
      ],
      content: textDocument(value),
      immediatelyRender: false,
      editable: !disabled,
      enableInputRules: false,
      enablePasteRules: false,
      editorProps: {
        attributes: {
          class:
            'chat-tiptap-input max-h-45 w-full overflow-y-auto border-0 bg-transparent px-2 py-1 text-sm leading-normal outline-none [&_p]:m-0',
          role: 'textbox',
          'aria-label': t('AI에게 메시지'),
          'aria-multiline': 'true',
        },
        handleKeyDown: (_view, event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return false
          event.preventDefault()
          onSubmitRef.current()
          return true
        },
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? [])
          if (files.length) {
            event.preventDefault()
            onPasteImagesRef.current(files)
            return true
          }
          const text = event.clipboardData?.getData('text/plain')
          if (text === undefined) return false
          event.preventDefault()
          view.dispatch(
            view.state.tr.insertText(text.replace(/\r\n?/g, '\n')).scrollIntoView(),
          )
          return true
        },
      },
      onUpdate: ({ editor: current }) => {
        const next = current.getText({ blockSeparator: '\n' })
        valueRef.current = next
        onChangeRef.current(next)
      },
    },
    [placeholder, t],
  )

  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const report = () => onMultilineRef.current?.(dom.scrollHeight > 30)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(dom)
    return () => observer.disconnect()
  }, [editor])

  useEffect(() => {
    if (!editor || value === valueRef.current) return
    valueRef.current = value
    editor.commands.setContent(textDocument(value), { emitUpdate: false })
  }, [editor, value])

  return <EditorContent editor={editor} className="flex-1 min-w-0" />
}
