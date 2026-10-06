import { Node, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

export const MARKDOWN_PLACEHOLDER = 'Markdown을 입력하세요…'

// A single plain-text block keeps frontmatter, tables, HTML, and extension syntax intact.
const Document = Node.create({ name: 'doc', topNode: true, content: 'markdownSource' })
const Source = Node.create({
  name: 'markdownSource',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  whitespace: 'pre',
  parseHTML: () => [{ tag: 'pre', preserveWhitespace: 'full' }],
  renderHTML: () => [
    'pre',
    {
      class:
        'markdown-source m-0 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed [tab-size:2] [&_code]:bg-transparent [&_code]:p-0 [&_code]:font-mono [&_code]:text-inherit',
    },
    ['code', 0],
  ],
  addKeyboardShortcuts() {
    const insert = (text: string) =>
      this.editor.commands.command(({ tr }) => {
        tr.insertText(text)
        return true
      })
    return {
      Enter: () => insert('\n'),
      'Shift-Enter': () => insert('\n'),
      'Mod-Enter': () => true,
      Tab: () => insert('\t'),
    }
  },
})
export const markdownExtensions = [
  StarterKit.configure({
    document: false,
    paragraph: false,
    heading: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    link: false,
    code: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
    trailingNode: false,
    gapcursor: false,
    dropcursor: false,
  }),
  Placeholder.configure({ placeholder: MARKDOWN_PLACEHOLDER }),
  Document,
  Source,
]
export function markdownToEditor(source: string): JSONContent {
  const text = source.replace(/\r\n?/g, '\n')
  return {
    type: 'doc',
    content: [{ type: 'markdownSource', ...(text ? { content: [{ type: 'text', text }] } : {}) }],
  }
}
export function markdownFromEditor(text: string, previous: string) {
  const eol = previous.match(/\r\n|\r|\n/)?.[0] ?? '\n'
  return eol === '\n' ? text : text.replaceAll('\n', eol)
}
