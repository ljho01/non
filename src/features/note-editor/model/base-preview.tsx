import { Extension, ReactRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { BaseEmbedSpec, RenderBaseEmbed } from '@/shared/contracts/base-embed'
import { Button } from '@/shared/ui/button'
import { Code2 } from '@/shared/ui/icon'

export function basePreview(render: RenderBaseEmbed) {
  const key = new PluginKey<ReadonlySet<string>>('basePreview')
  return Extension.create({
    name: 'basePreview',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        new Plugin({
          key,
          state: {
            init: () => new Set<string>(),
            apply(tr, previous) {
              const toggle = tr.getMeta(key) as string | undefined
              if (!toggle) return previous
              const next = new Set(previous)
              if (next.has(toggle)) next.delete(toggle)
              else next.add(toggle)
              return next
            },
          },
          props: {
            decorations(state) {
              const decorations: Decoration[] = []
              state.doc.forEach((node, pos) => {
                let spec: BaseEmbedSpec | undefined
                if (node.type.name === 'codeBlock' && node.attrs.language === 'base')
                  spec = { source: node.textContent, blockId: String(node.attrs.nonId) }
                const link = /^!\[\[([^\]]+\.base(?:#[^\]|]+)?)(?:\|[^\]]*)?\]\]$/.exec(
                  node.textContent.trim(),
                )
                if (node.type.name === 'paragraph' && link) spec = { target: link[1] }
                if (!spec) return
                const id = String(node.attrs.nonId ?? pos)
                const sourceVisible = key.getState(state)?.has(id) ?? false
                if (!sourceVisible)
                  decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'hidden' }))
                let renderer: ReactRenderer | undefined
                const value = spec
                decorations.push(
                  Decoration.widget(
                    pos + node.nodeSize,
                    () => {
                      renderer = new ReactRenderer(
                        () => (
                          <div className="group/base-preview relative" contentEditable={false}>
                            <Button
                              unstyled
                              aria-label={sourceVisible ? '임베드 원문 닫기' : '임베드 원문 편집'}
                              title={sourceVisible ? '임베드 원문 닫기' : '임베드 원문 편집'}
                              aria-pressed={sourceVisible}
                              className="absolute -left-7 top-2 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent focus-visible:opacity-100 group-hover/base-preview:opacity-100"
                              onClick={() => editor.view.dispatch(editor.state.tr.setMeta(key, id))}
                            >
                              <Code2 className="size-3.5" />
                            </Button>
                            {render(value)}
                          </div>
                        ),
                        { editor, as: 'div', className: 'base-embed-preview' },
                      )
                      return renderer.element
                    },
                    {
                      key: JSON.stringify([id, spec, sourceVisible]),
                      side: 1,
                      stopEvent: () => true,
                      destroy: () => renderer?.destroy(),
                    },
                  ),
                )
              })
              return DecorationSet.create(state.doc, decorations)
            },
          },
        }),
      ]
    },
  })
}
