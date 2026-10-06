import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import {
  wrappingInputRule,
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react'
import { Plugin } from '@tiptap/pm/state'
import { TodoCheckbox } from '@/shared/ui/todo-checkbox'
import { TODO_INPUT_REGEX, preserveInputRuleUndo } from './list-input-rules'

function TodoItemView({ node, updateAttributes, editor }: NodeViewProps) {
  return (
    <NodeViewWrapper
      as="li"
      data-type="todoListItem"
      data-checked={node.attrs.checked}
      className="grid grid-cols-[1.25em_minmax(0,1fr)] items-start gap-2"
    >
      {/* min-h-[1lh] centers the checkbox on the first text line even when the body wraps. */}
      <span contentEditable={false} className="flex min-h-[1lh] items-center justify-center">
        <TodoCheckbox
          checked={node.attrs.checked === true}
          label={node.textContent || 'Task'}
          disabled={!editor.isEditable}
          onCheckedChange={(checked) => updateAttributes({ checked })}
          className="mt-0"
        />
      </span>
      {/* m-0! (important suffix) overrides the unlayered .tiptap-note p margin. */}
      {/* Tiptap wraps content in an extra plain div, so p can be a grandchild; m-0! beats the unlayered p margin. */}
      <NodeViewContent className="min-w-0 flex-1 [&>p]:m-0! [&>div>p]:m-0!" />
    </NodeViewWrapper>
  )
}
export const TodoList = TaskList.extend({
  name: 'todoList',
  addCommands() {
    return {}
  },
  addKeyboardShortcuts() {
    return {}
  },
}).configure({ itemTypeName: 'todoListItem', HTMLAttributes: { class: 'list-none !pl-0' } })
export const TodoListItem = TaskItem.extend({
  name: 'todoListItem',
  addAttributes() {
    return { ...this.parent?.(), todoId: { default: null, keepOnSplit: false, rendered: false } }
  },
  addInputRules() {
    return [
      wrappingInputRule({
        find: TODO_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => ({ checked: match[1].toLowerCase() === 'x' }),
      }),
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TodoItemView)
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const seen = new Set<string>()
          const tr = state.tr
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'todoListItem') return
            let id = node.attrs.todoId as string | null
            if (!id || seen.has(id)) {
              id = crypto.randomUUID()
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, todoId: id })
            }
            seen.add(id)
          })
          if (!tr.docChanged) return null
          preserveInputRuleUndo(tr, state)
          return tr
        },
      }),
    ]
  },
}).configure({ nested: true, taskListTypeName: 'todoList' })
