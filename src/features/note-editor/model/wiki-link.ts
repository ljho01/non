import { Node, InputRule } from '@tiptap/react'
import { parseWikiTarget } from '@/shared/contracts/links'
export const WikiLink = Node.create({
  name: 'wikiLink',
  inline: true,
  group: 'inline',
  atom: true,
  addAttributes: () => ({
    target: {
      default: '',
      parseHTML: (element) => element.getAttribute('data-non-target'),
      rendered: false,
    },
    label: { default: '', parseHTML: (element) => element.textContent, rendered: false },
  }),
  parseHTML: () => [{ tag: 'span[data-non-target]' }],
  renderHTML: ({ node }) => [
    'span',
    {
      class:
        'note-wikilink cursor-pointer rounded-sm text-foreground underline decoration-muted-foreground underline-offset-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      'data-non-target': node.attrs.target,
      role: 'link',
      tabindex: '0',
      title: node.attrs.target,
    },
    node.attrs.label || node.attrs.target,
  ],
  renderText: ({ node }) => node.attrs.label || node.attrs.target,
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\[\]\n]{1,1000})\]\]$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create(parseWikiTarget(match[1])))
        },
      }),
    ]
  },
})
