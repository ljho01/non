import { z } from 'zod'
import { parseDocument, stringify } from 'yaml'

export type BaseFilter = string | { and?: BaseFilter[]; or?: BaseFilter[]; not?: BaseFilter[] }
const filterSchema: z.ZodType<BaseFilter> = z.lazy(() =>
  z.union([
    z.string().max(10000),
    z
      .object({
        and: z.array(filterSchema).optional(),
        or: z.array(filterSchema).optional(),
        not: z.array(filterSchema).optional(),
      })
      .refine((v) => Object.keys(v).length === 1, '필터에는 and, or, not 중 하나가 필요합니다.'),
  ]),
)
const sortSchema = z.object({ property: z.string(), direction: z.enum(['ASC', 'DESC']) })
export const baseViewSchema = z.looseObject({
  type: z.string(),
  name: z.string().min(1),
  filters: filterSchema.optional(),
  order: z.array(z.string()).optional(),
  sort: z.array(sortSchema).optional(),
  groupBy: sortSchema.optional(),
  limit: z.number().int().nonnegative().optional(),
  summaries: z.record(z.string(), z.string()).optional(),
})
export const baseSchema = z.looseObject({
  filters: filterSchema.optional(),
  formulas: z.record(z.string(), z.string()).optional(),
  properties: z
    .record(z.string(), z.looseObject({ displayName: z.string().optional() }))
    .optional(),
  summaries: z.record(z.string(), z.string()).optional(),
  views: z.array(baseViewSchema).min(1).max(100),
})
export type Base = z.infer<typeof baseSchema>
export type BaseView = z.infer<typeof baseViewSchema>
export function yamlDocument(source: string) {
  const document = parseDocument(source, { uniqueKeys: true, stringKeys: true })
  if (document.errors.length) throw new Error(document.errors[0].message)
  return document
}
export function parseBase(source: string): Base {
  return baseSchema.parse(yamlDocument(source).toJS({ maxAliasCount: 30 }) as unknown)
}
export function serializeBase(base: Base, source?: string) {
  baseSchema.parse(base)
  if (!source) return stringify(base)
  const document = yamlDocument(source)
  const original = parseBase(source)
  for (const key of Object.keys(original)) if (!(key in base)) document.delete(key)
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) document.delete(key)
    else if (JSON.stringify(original[key]) !== JSON.stringify(value)) document.set(key, value)
  }
  return document.toString()
}
export function createBase(): string {
  return serializeBase({
    views: [{ type: 'table', name: 'Table', order: ['file.name', 'file.mtime'] }],
  })
}

export function propertyConfig(base: Base, property: string) {
  return base.properties?.[property] ?? base.properties?.[property.replace(/^note\./, '')]
}
