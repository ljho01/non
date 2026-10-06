import moment from 'moment'
import type { Properties } from './properties'

export type BaseRow = {
  path: string
  properties: Properties
  file: Properties
  random?: number
  resolve?: (path: string) => BaseRow | undefined
}
export class BaseLink {
  constructor(
    readonly path: string,
    readonly display?: unknown,
  ) {}
}
export class BaseImage {
  constructor(readonly path: string) {}
}
export class BaseHTML {
  constructor(readonly html: string) {}
}
export class BaseIcon {
  constructor(readonly name: string) {}
}
export class BaseDuration {
  constructor(
    readonly amount: number,
    readonly unit: moment.unitOfTime.DurationConstructor = 'milliseconds',
  ) {}
  milliseconds() {
    return moment.duration(this.amount, this.unit).asMilliseconds()
  }
}
export function duration(value: unknown): BaseDuration {
  if (value instanceof BaseDuration) return value
  const match =
    /^(-?\d+(?:\.\d+)?)\s*(ms|milliseconds?|y|years?|M|months?|w|weeks?|d|days?|h|hours?|m|minutes?|s|seconds?)$/.exec(
      String(value).trim(),
    )
  if (!match) throw new Error(`잘못된 기간: ${String(value)}`)
  return new BaseDuration(Number(match[1]), match[2] as moment.unitOfTime.DurationConstructor)
}
export function linkPath(value: unknown): string {
  const raw =
    value instanceof BaseLink || value instanceof BaseImage
      ? value.path
      : value && typeof value === 'object' && 'path' in value
        ? String(value.path)
        : String(value ?? '')
  if (/^#[\da-f]{3,8}$/i.test(raw)) return raw
  return raw
    .replace(/^!?\[\[/, '')
    .replace(/\]\]$/, '')
    .split('|')[0]
    .split('#')[0]
}
export function baseText(value: unknown): string | undefined {
  if (value instanceof BaseLink)
    return value.display === undefined
      ? value.path
      : (baseText(value.display) ?? String(value.display))
  if (value instanceof BaseImage) return value.path
  if (value instanceof BaseHTML) return value.html
  if (value instanceof BaseIcon) return value.name
  if (value instanceof BaseDuration) return moment.duration(value.amount, value.unit).humanize()
  return undefined
}
export function equalValues(a: unknown, b: unknown): boolean {
  if (a instanceof BaseLink || b instanceof BaseLink) return linkPath(a) === linkPath(b)
  if (a instanceof Date || b instanceof Date)
    return a instanceof Date && b instanceof Date && +a === +b
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
