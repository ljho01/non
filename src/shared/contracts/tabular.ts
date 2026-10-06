/** TSV clipboard fields use the same doubled-quote convention as spreadsheets. */
export function parseTSV(text: string): string[][] {
  if (text.length > 2 * 1024 * 1024) throw new Error('붙여넣기 크기는 2 MB 이하여야 합니다.')
  const rows: string[][] = [],
    row: string[] = []
  let cell = '',
    quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"' && (quoted || cell === '')) {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = !quoted
    } else if (!quoted && (c === '\t' || c === '\n' || c === '\r')) {
      row.push(cell)
      cell = ''
      if (c !== '\t') {
        rows.push([...row])
        row.length = 0
        if (c === '\r' && text[i + 1] === '\n') i++
      }
    } else cell += c
    if (rows.length > 10000 || row.length > 1000)
      throw new Error('붙여넣기 셀 수 한도를 초과했습니다.')
  }
  if (cell || row.length || !rows.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
export function encodeTSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[\t\r\n"]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell))
        .join('\t'),
    )
    .join('\n')
}
