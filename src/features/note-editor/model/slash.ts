export type SlashMatch = {
  from: number
  to: number
  query: string
}

export function matchSlashCommand(textBeforeCursor: string, cursor: number): SlashMatch | null {
  const match = textBeforeCursor.match(/(?:^|\s)\/([^\s/]*)$/u)
  if (!match) return null
  const token = `/${match[1]}`
  return { from: cursor - token.length, to: cursor, query: match[1] }
}
