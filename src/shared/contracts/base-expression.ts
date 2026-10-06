import jsep from 'jsep'
import regexPlugin from '@jsep-plugin/regex'
import objectPlugin, { type ObjectExpression } from '@jsep-plugin/object'
import safeRegex from 'safe-regex2'
import moment from 'moment'
import { propertyText, type Properties } from './properties'
import {
  BaseDuration,
  BaseHTML,
  BaseIcon,
  BaseImage,
  BaseLink,
  duration,
  equalValues,
  linkPath,
  type BaseRow,
} from './base-values'
export type { BaseRow } from './base-values'
jsep.plugins.register(regexPlugin, objectPlugin)
jsep.hooks.add('gobble-token', function (env) {
  if (env.node) return
  const match = /^(\d+(?:\.\d+)?)(?=\.[A-Za-z_])/.exec(this.expr.slice(this.index))
  if (match) {
    this.index += match[0].length
    env.node = this.gobbleTokenProperty({ type: 'Literal', value: Number(match[0]), raw: match[0] })
  }
})
export type ExpressionContext = {
  row: BaseRow
  formulas?: Record<string, string>
  thisRow?: BaseRow
  values?: unknown[]
  random?: number
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const randoms = new WeakMap<BaseRow, number>()
const cache = new Map<string, jsep.Expression>()
const safeKey = (key: string) => {
  if (forbidden.has(key)) throw new Error(`허용되지 않는 속성: ${key}`)
  return key
}
const numeric = (value: unknown) => {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error('숫자로 변환할 수 없습니다.')
  return n
}
function own(object: unknown, key: string): unknown {
  safeKey(key)
  if (key === 'length' && (Array.isArray(object) || typeof object === 'string'))
    return object.length
  if (object instanceof Date) {
    const fields: Properties = {
      year: object.getFullYear(),
      month: object.getMonth() + 1,
      day: object.getDate(),
      hour: object.getHours(),
      minute: object.getMinutes(),
      second: object.getSeconds(),
      millisecond: object.getMilliseconds(),
    }
    return fields[key] ?? null
  }
  if (object !== null && typeof object === 'object' && Object.hasOwn(object, key))
    return (object as Properties)[key]
  return null
}
export function evaluateExpression(
  source: string,
  context: ExpressionContext,
  stack: string[] = [],
  budget: { steps: number; memo: Map<string, unknown> } = { steps: 0, memo: new Map() },
): unknown {
  if (source.length > 10000 || stack.length > 32) throw new Error('수식이 너무 복잡합니다.')
  let tree = cache.get(source)
  if (!tree) {
    tree = jsep(source)
    if (cache.size > 500) cache.clear()
    cache.set(source, tree)
  }
  const locals: Properties[] = []
  const resolve = (value: unknown) => {
    const path = linkPath(value)
    return context.row.resolve?.(path) ?? (path === context.row.path ? context.row : undefined)
  }
  const equal = (a: unknown, b: unknown) => {
    if (a instanceof BaseLink || b instanceof BaseLink) {
      const unwrap = (v: unknown) => (v && typeof v === 'object' && 'file' in v ? v.file : v)
      const left = resolve(unwrap(a)),
        right = resolve(unwrap(b))
      if (left && right) return left.path === right.path
    }
    return equalValues(a, b)
  }
  const formula = (key: string): unknown => {
    safeKey(key)
    if (stack.includes(key)) throw new Error(`수식 순환 참조: ${key}`)
    if (budget.memo.has(key)) return budget.memo.get(key)
    const expression = context.formulas?.[key]
    const value =
      expression === undefined
        ? null
        : evaluateExpression(expression, context, [...stack, key], budget)
    budget.memo.set(key, value)
    return value
  }
  function run(expression: jsep.Expression, depth = 0): unknown {
    if (depth > 64 || ++budget.steps > 100000) throw new Error('수식 실행 한도를 초과했습니다.')
    const next = (v: jsep.Expression) => run(v, depth + 1)
    const memberName = (node: jsep.MemberExpression) =>
      safeKey(node.computed ? String(next(node.property)) : (node.property as jsep.Identifier).name)
    if (expression.type === 'ObjectExpression') {
      const result: Properties = {}
      for (const item of (expression as ObjectExpression).properties) {
        const key = safeKey(
          item.computed
            ? String(next(item.key))
            : String(item.key.type === 'Identifier' ? item.key.name : item.key.value),
        )
        result[key] = next(item.value ?? item.key)
      }
      return result
    }
    const node = expression as jsep.CoreExpression
    switch (node.type) {
      case 'Literal':
        if (node.value instanceof RegExp) {
          if (!safeRegex(node.value)) throw new Error('안전하지 않은 정규식입니다.')
          return new RegExp(node.value)
        }
        return node.value
      case 'ThisExpression':
        return context.thisRow
          ? { ...context.thisRow.properties, file: context.thisRow.file }
          : null
      case 'Identifier': {
        safeKey(node.name)
        for (const scope of [...locals].reverse())
          if (Object.hasOwn(scope, node.name)) return scope[node.name]
        if (node.name === 'file') return context.row.file
        if (node.name === 'note') return context.row.properties
        if (node.name === 'values') return context.values ?? []
        return own(context.row.properties, node.name)
      }
      case 'ArrayExpression':
        return node.elements.map((e) => (e ? next(e) : null))
      case 'MemberExpression': {
        const key = memberName(node)
        if (node.object.type === 'Identifier' && node.object.name === 'formula') return formula(key)
        const target = next(node.object)
        if (
          key === 'file' &&
          target &&
          typeof target === 'object' &&
          'path' in target &&
          'ext' in target
        )
          return target
        return own(target, key)
      }
      case 'UnaryExpression': {
        const v = next(node.argument)
        if (node.operator === '!') return !v
        if (node.operator === '-') return -numeric(v)
        if (node.operator === '+') return numeric(v)
        throw new Error('지원하지 않는 연산자')
      }
      case 'ConditionalExpression':
        return next(node.test) ? next(node.consequent) : next(node.alternate)
      case 'BinaryExpression': {
        const a = next(node.left)
        if (node.operator === '&&') return a && next(node.right)
        if (node.operator === '||') return a || next(node.right)
        const b = next(node.right)
        const op = node.operator
        if (op === '==') return equal(a, b)
        if (op === '!=') return !equal(a, b)
        if (op === '>') return compareValues(a, b) > 0
        if (op === '<') return compareValues(a, b) < 0
        if (op === '>=') return compareValues(a, b) >= 0
        if (op === '<=') return compareValues(a, b) <= 0
        if (a instanceof Date && (op === '+' || op === '-') && !(b instanceof Date)) {
          const d = duration(b)
          return moment(a)
            .add(d.amount * (op === '-' ? -1 : 1), d.unit)
            .toDate()
        }
        if (a instanceof BaseDuration && (op === '*' || op === '/'))
          return new BaseDuration(
            op === '*' ? a.amount * numeric(b) : a.amount / numeric(b),
            a.unit,
          )
        if (a instanceof BaseDuration && b instanceof BaseDuration && (op === '+' || op === '-'))
          return new BaseDuration(a.milliseconds() + (op === '+' ? 1 : -1) * b.milliseconds())
        if (op === '+' && (typeof a === 'string' || typeof b === 'string'))
          return propertyText(a) + propertyText(b)
        const x = a instanceof Date ? +a : numeric(a),
          y = b instanceof Date ? +b : numeric(b)
        if (op === '+') return x + y
        if (op === '-') return x - y
        if (op === '*') return x * y
        if (op === '/' || op === '%') {
          if (!y) throw new Error('0으로 나눌 수 없습니다.')
          return op === '/' ? x / y : x % y
        }
        throw new Error(`지원하지 않는 연산자: ${op}`)
      }
      case 'CallExpression': {
        if (node.callee.type === 'Identifier' && node.callee.name === 'if') {
          if (node.arguments.length < 2 || node.arguments.length > 3)
            throw new Error('if에는 2~3개 인수가 필요합니다.')
          return next(node.arguments[0])
            ? next(node.arguments[1])
            : node.arguments[2]
              ? next(node.arguments[2])
              : null
        }
        if (node.callee.type === 'MemberExpression') {
          const member = node.callee as jsep.MemberExpression,
            target = next(member.object),
            method = memberName(member)
          if (Array.isArray(target) && ['map', 'filter', 'reduce'].includes(method)) {
            if (!node.arguments[0]) throw new Error('목록 수식이 필요합니다.')
            let acc = node.arguments[1] ? next(node.arguments[1]) : null
            const output: unknown[] = []
            target.forEach((value, index) => {
              locals.push({ value, index, acc })
              let result: unknown
              try {
                result = next(node.arguments[0])
              } finally {
                locals.pop()
              }
              if (method === 'reduce') acc = result
              else if (method === 'map') output.push(result)
              else if (result) output.push(value)
            })
            return method === 'reduce' ? acc : output
          }
          const args = node.arguments.map(next),
            text = propertyText(target),
            arg = propertyText(args[0])
          if (method === 'isTruthy') return Boolean(target)
          if (method === 'toString') return text
          if (method === 'isType') {
            if (target instanceof BaseHTML) return arg === 'html'
            if (target instanceof BaseImage) return arg === 'image'
            if (target instanceof BaseIcon) return arg === 'icon'
            const type =
              target === null
                ? 'null'
                : target instanceof Date
                  ? 'date'
                  : target instanceof BaseDuration
                    ? 'duration'
                    : target instanceof BaseLink
                      ? 'link'
                      : Array.isArray(target)
                        ? 'list'
                        : target instanceof RegExp
                          ? 'regexp'
                          : target === context.row.file ||
                              (target &&
                                typeof target === 'object' &&
                                'path' in target &&
                                'ext' in target)
                            ? 'file'
                            : typeof target
            return type === arg
          }
          if (method === 'isEmpty')
            return (
              target == null ||
              target === '' ||
              (Array.isArray(target)
                ? !target.length
                : target instanceof Date
                  ? false
                  : typeof target === 'object'
                    ? !Object.keys(target).length
                    : false)
            )
          if (target instanceof Date) {
            if (method === 'date') return moment(target).startOf('day').toDate()
            if (method === 'format') return moment(target).format(arg)
            if (method === 'time') return moment(target).format('HH:mm:ss')
            if (method === 'relative') return moment(target).fromNow()
          }
          if (target instanceof RegExp && method === 'matches') {
            target.lastIndex = 0
            return target.test(arg.slice(0, 100000))
          }
          if (target instanceof BaseLink) {
            if (method === 'asFile') return resolve(target)?.file ?? null
            if (method === 'linksTo')
              return ((resolve(target)?.file.links as unknown[]) ?? []).some((v) =>
                equal(v, args[0]),
              )
          }
          if (
            target === context.row.file ||
            (target && typeof target === 'object' && 'path' in target && 'ext' in target)
          ) {
            const f = target as Properties,
              row = resolve(f)
            if (method === 'asLink')
              return new BaseLink(String(f.path), args.length ? arg : undefined)
            if (method === 'inFolder')
              return (
                !arg ||
                f.folder === arg.replace(/\/$/, '') ||
                String(f.folder).startsWith(`${arg.replace(/\/$/, '')}/`)
              )
            if (method === 'hasProperty')
              return Object.hasOwn((row?.properties ?? f.properties ?? {}) as object, arg)
            if (method === 'hasTag')
              return args.some((v) =>
                ((f.tags as string[]) ?? []).some(
                  (t) =>
                    t === String(v).replace(/^#/, '') ||
                    t.startsWith(`${String(v).replace(/^#/, '')}/`),
                ),
              )
            if (method === 'hasLink')
              return ((f.links as unknown[]) ?? []).some(
                (v) =>
                  linkPath(v) === linkPath(args[0]) ||
                  (resolve(v)?.path === resolve(args[0])?.path && !!resolve(v)),
              )
          }
          if (method === 'contains' || method === 'containsAll' || method === 'containsAny') {
            const has = (v: unknown) =>
              Array.isArray(target)
                ? target.some((t) => equal(t, v))
                : text.includes(propertyText(v))
            return method === 'contains'
              ? has(args[0])
              : method === 'containsAll'
                ? args.flat().every(has)
                : args.flat().some(has)
          }
          if (method === 'slice')
            return (Array.isArray(target) ? target : text).slice(
              Number(args[0]),
              args[1] === undefined ? undefined : Number(args[1]),
            )
          if (method === 'reverse')
            return Array.isArray(target) ? [...target].reverse() : [...text].reverse().join('')
          if (Array.isArray(target)) {
            if (method === 'join') return target.map(propertyText).join(args.length ? arg : ', ')
            if (method === 'unique')
              return target.filter((v, i) => target.findIndex((x) => equal(x, v)) === i)
            if (method === 'sort') return [...target].sort(compareValues)
            if (method === 'flat') return target.flat()
            if (method === 'sum') return target.reduce<number>((s, v) => s + numeric(v), 0)
            if (method === 'mean')
              return target.length
                ? target.reduce<number>((s, v) => s + numeric(v), 0) / target.length
                : null
          }
          if (typeof target === 'string') {
            if (method === 'startsWith') return text.startsWith(arg)
            if (method === 'endsWith') return text.endsWith(arg)
            if (method === 'lower') return text.toLowerCase()
            if (method === 'upper') return text.toUpperCase()
            if (method === 'trim') return text.trim()
            if (method === 'title')
              return text.replace(
                /\p{L}[\p{L}\p{N}]*/gu,
                (v) => v[0].toUpperCase() + v.slice(1).toLowerCase(),
              )
            if (method === 'replace')
              return args[0] instanceof RegExp
                ? text.replace(args[0], propertyText(args[1]))
                : text.replaceAll(arg, propertyText(args[1]))
            if (method === 'split')
              return text.split(
                args[0] instanceof RegExp ? args[0] : arg,
                args[1] === undefined ? undefined : numeric(args[1]),
              )
            if (method === 'repeat') {
              const count = numeric(args[0])
              if (count < 0 || count * text.length > 1000000)
                throw new Error('문자열 길이 한도 초과')
              return text.repeat(count)
            }
          }
          if (typeof target === 'number') {
            if (method === 'abs') return Math.abs(target)
            if (method === 'ceil') return Math.ceil(target)
            if (method === 'floor') return Math.floor(target)
            if (method === 'round' || method === 'toFixed') {
              const digits = Math.min(100, Math.max(0, Number(args[0] ?? 0)))
              return method === 'round'
                ? Math.round(target * 10 ** digits) / 10 ** digits
                : target.toFixed(digits)
            }
          }
          if (target && typeof target === 'object') {
            if (method === 'keys') return Object.keys(target)
            if (method === 'values') return Object.values(target)
          }
          throw new Error(`지원하지 않는 함수: ${method}`)
        }
        const args = node.arguments.map(next)
        if (node.callee.type !== 'Identifier') throw new Error('허용되지 않는 함수 호출')
        switch (node.callee.name) {
          case 'list':
            return Array.isArray(args[0]) ? args[0] : [args[0]]
          case 'string':
            return propertyText(args[0])
          case 'number':
            return numeric(args[0])
          case 'date': {
            const d = moment(propertyText(args[0]), [moment.ISO_8601, 'YYYY-MM-DD HH:mm:ss'], true)
            if (!d.isValid()) throw new Error('잘못된 날짜')
            return d.toDate()
          }
          case 'duration':
            return duration(args[0])
          case 'now':
            return new Date()
          case 'today':
            return moment().startOf('day').toDate()
          case 'min':
            return Math.min(...args.map(numeric))
          case 'max':
            return Math.max(...args.map(numeric))
          case 'random': {
            if (!randoms.has(context.row)) randoms.set(context.row, Math.random())
            return context.random ?? context.row.random ?? randoms.get(context.row)
          }
          case 'file':
            return resolve(args[0])?.file ?? null
          case 'link':
            return new BaseLink(linkPath(args[0]), args.length > 1 ? args[1] : undefined)
          case 'image':
            return new BaseImage(linkPath(args[0]))
          case 'html':
            return new BaseHTML(propertyText(args[0]))
          case 'icon':
            return new BaseIcon(propertyText(args[0]))
          case 'escapeHTML':
            return propertyText(args[0]).replace(
              /[&<>"']/g,
              (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
            )
          default:
            throw new Error(`지원하지 않는 함수: ${node.callee.name}`)
        }
      }
      default:
        throw new Error(`지원하지 않는 수식: ${node.type}`)
    }
  }
  return run(tree)
}
export function compareValues(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  if (a instanceof Date && b instanceof Date) return +a - +b
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return propertyText(a).localeCompare(propertyText(b), undefined, { numeric: true })
}
