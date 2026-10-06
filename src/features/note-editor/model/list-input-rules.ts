import type { EditorState, Transaction } from '@tiptap/pm/state'

// Parentheses create collected Todos; brackets create document-local checklists.
// A trailing typed space completes the shortcut, so ordinary inline text stays literal.
export const TODO_INPUT_REGEX = /^[ \t]*\(([ xX]?)\) $/
export const CHECKLIST_INPUT_REGEX = /^[ \t]*\[([ xX]?)\] $/

// ID-only append transactions must not clear the input rule's immediate Backspace undo.
// They do not change positions, so the original wrapping transform remains reversible.
export function preserveInputRuleUndo(transaction: Transaction, state: EditorState) {
  for (const plugin of state.plugins) {
    if (!plugin.spec.isInputRules) continue
    const undoable: unknown = plugin.getState(state)
    if (undoable) transaction.setMeta(plugin, undoable)
  }
}
