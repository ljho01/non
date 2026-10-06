import { propertyConfig } from '@/shared/contracts/base'
import jsep from 'jsep'
import { BaseDuration, BaseLink } from '@/shared/contracts/base-values'
import type { Base, BaseFilter, BaseView } from '@/shared/contracts/base'
import { evaluateExpression, compareValues, type BaseRow } from '@/shared/contracts/base-expression'
import { propertyText } from '@/shared/contracts/properties'
export type QueryRow = {
  row: BaseRow
  cells: Record<string, unknown>
  errors: Record<string, string>
}
export function valueFor(row: BaseRow, property: string, base: Base, thisRow?: BaseRow): unknown {
  if (property.startsWith('formula.'))
    return evaluateExpression(`formula[${JSON.stringify(property.slice(8))}]`, {
      row,
      formulas: base.formulas,
      thisRow,
    })
  if (property === 'file.file') return row.file
  if (property.startsWith('file.')) return row.file[property.slice(5)]
  return row.properties[property.replace(/^note\./, '')]
}
function matches(
  filter: BaseFilter | undefined,
  row: BaseRow,
  base: Base,
  thisRow?: BaseRow,
  depth = 0,
): boolean {
  if (depth > 32) throw new Error('필터가 너무 깊습니다.')
  if (filter === undefined) return true
  if (typeof filter === 'string')
    return Boolean(evaluateExpression(filter, { row, formulas: base.formulas, thisRow }))
  const check = (f: BaseFilter) => matches(f, row, base, thisRow, depth + 1)
  if (filter.and) return filter.and.every(check)
  if (filter.or) return filter.or.some(check)
  if (filter.not) return !filter.not.some(check)
  return true
}
export function queryBase(
  rows: BaseRow[],
  base: Base,
  view: BaseView,
  search = '',
  thisRow?: BaseRow,
  randomSeed = 0.5,
) {
  const columns = view.order ?? ['file.name']
  const properties = [
    ...new Set([
      ...columns,
      ...(typeof view.image === 'string' ? [view.image] : []),
      ...(view.sort ?? []).map((s) => s.property),
      ...(view.groupBy ? [view.groupBy.property] : []),
    ]),
  ]
  const results: QueryRow[] = []
  const warnings: string[] = []
  for (const sourceRow of rows) {
    const noteProperties = { ...sourceRow.properties }
    for (const [key, config] of Object.entries(base.properties ?? {})) {
      const name = key.replace(/^note\./, '')
      const value = noteProperties[name]
      if (value == null || key.startsWith('file.') || key.startsWith('formula.')) continue
      if (config.type === 'date' || config.type === 'datetime') {
        const d = new Date(String(value))
        if (!Number.isNaN(+d)) noteProperties[name] = d
      }
    }
    let randomHash = Math.floor(randomSeed * 2147483647)
    for (const char of sourceRow.path)
      randomHash = Math.imul(randomHash ^ char.charCodeAt(0), 16777619)
    const row = {
      random: (randomHash >>> 0) / 4294967296,
      ...sourceRow,
      properties: noteProperties,
      file: { ...sourceRow.file, properties: noteProperties },
    }

    try {
      if (!matches(base.filters, row, base, thisRow) || !matches(view.filters, row, base, thisRow))
        continue
    } catch (error) {
      warnings.push(`${row.path}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const result: QueryRow = { row, cells: {}, errors: {} }
    for (const property of properties) {
      try {
        result.cells[property] = valueFor(row, property, base, thisRow)
      } catch (error) {
        result.errors[property] = error instanceof Error ? error.message : String(error)
      }
    }
    if (
      !search ||
      columns.some((p) =>
        propertyText(result.cells[p]).toLowerCase().includes(search.toLowerCase()),
      )
    )
      results.push(result)
  }
  const sorts = [...(view.groupBy ? [view.groupBy] : []), ...(view.sort ?? [])]
  results.sort((a, b) => {
    for (const sort of sorts) {
      const delta = compareValues(a.cells[sort.property], b.cells[sort.property])
      if (delta) return delta * (sort.direction === 'DESC' ? -1 : 1)
    }
    return a.row.path.localeCompare(b.row.path)
  })
  return {
    rows: view.limit === undefined ? results : results.slice(0, view.limit),
    total: results.length,
    warnings,
  }
}
export function summarize(values: unknown[], name: string, base: Base, row?: BaseRow): unknown {
  const filled = values.filter(
    (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0),
  )
  const numbers = filled
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b)
  const sum = numbers.reduce((a, b) => a + b, 0)
  switch (name) {
    case 'Count':
      return values.length
    case 'Empty':
      return values.length - filled.length
    case 'Filled':
      return filled.length
    case 'Unique':
      return new Set(filled.map((v) => JSON.stringify(v))).size
    case 'Checked':
      return values.filter((v) => v === true).length
    case 'Unchecked':
      return values.filter((v) => v === false).length
    case 'Sum':
      return sum
    case 'Average':
      return numbers.length ? sum / numbers.length : null
    case 'Min':
      return numbers[0] ?? null
    case 'Max':
      return numbers.at(-1) ?? null
    case 'Range':
      if (filled.every((v) => v instanceof Date) && filled.length)
        return new BaseDuration(
          Math.max(...filled.map((v) => +(v as Date))) -
            Math.min(...filled.map((v) => +(v as Date))),
        )
      return numbers.length ? numbers.at(-1)! - numbers[0] : null
    case 'Stddev':
      return numbers.length
        ? Math.sqrt(
            numbers.reduce((total, n) => total + (n - sum / numbers.length) ** 2, 0) /
              numbers.length,
          )
        : null
    case 'Median':
      return numbers.length
        ? (numbers[Math.floor((numbers.length - 1) / 2)] +
            numbers[Math.floor(numbers.length / 2)]) /
            2
        : null
    case 'Earliest':
      return [...filled].sort(compareValues)[0] ?? null
    case 'Latest':
      return [...filled].sort(compareValues).at(-1) ?? null
  }
  if (base.summaries?.[name] && row)
    return evaluateExpression(base.summaries[name], { row, values, formulas: base.formulas })
  throw new Error(`지원하지 않는 요약: ${name}`)
}
export function csvFor(rows: QueryRow[], columns: string[], base: Base) {
  const escape = (text: string) => `"${text.replaceAll('"', '""')}"`
  return [
    columns.map((p) => propertyConfig(base, p)?.displayName ?? p),
    ...rows.map((row) => columns.map((p) => row.errors[p] ?? propertyText(row.cells[p]))),
  ]
    .map((row) => row.map(escape).join(','))
    .join('\r\n')
}

/** Only positive conjunctions with literal equality can safely initialize a new note. */
export function defaultsForNewRow(base: Base, view: BaseView) {
  const properties: Record<string, unknown> = {}
  let folder: string | undefined
  const visit = (filter: BaseFilter | undefined, depth = 0) => {
    if (!filter || depth > 32) return
    if (typeof filter !== 'string') {
      filter.and?.forEach((f) => visit(f, depth + 1))
      return
    }
    const read = (expr: jsep.Expression, level = 0): void => {
      if (level > 32) return
      const node = expr as jsep.CoreExpression
      if (node.type === 'BinaryExpression' && node.operator === '&&') {
        read(node.left, level + 1)
        read(node.right, level + 1)
        return
      }
      if (
        node.type === 'BinaryExpression' &&
        node.operator === '==' &&
        node.right.type === 'Literal'
      ) {
        let name: string | undefined
        if (node.left.type === 'Identifier') name = String(node.left.name)
        if (node.left.type === 'MemberExpression') {
          const member = node.left as jsep.MemberExpression
          if (member.object.type === 'Identifier' && member.object.name === 'note') {
            if (member.computed && member.property.type === 'Literal')
              name = String(member.property.value)
            else if (!member.computed && member.property.type === 'Identifier')
              name = String(member.property.name)
          }
        }
        if (name && !['__proto__', 'constructor', 'prototype'].includes(name))
          properties[name] = node.right.value
      }
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        const member = node.callee as jsep.MemberExpression
        if (
          member.object.type === 'Identifier' &&
          member.object.name === 'file' &&
          member.property.type === 'Identifier' &&
          member.property.name === 'inFolder' &&
          node.arguments[0]?.type === 'Literal' &&
          typeof node.arguments[0].value === 'string'
        )
          folder = node.arguments[0].value
      }
    }
    try {
      read(jsep(filter))
    } catch {
      /* Query diagnostics surface malformed filters. */
    }
  }
  visit(base.filters)
  visit(view.filters)
  return { properties, folder }
}
