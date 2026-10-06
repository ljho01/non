import TaskItem from '@tiptap/extension-task-item'
import { wrappingInputRule } from '@tiptap/react'
import { CHECKLIST_INPUT_REGEX } from './list-input-rules'

export const ChecklistItem = TaskItem.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: CHECKLIST_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => ({ checked: match[1].toLowerCase() === 'x' }),
      }),
    ]
  },
}).configure({
  nested: true,
  a11y: { checkboxLabel: (node) => node.textContent || 'Checklist' },
})
