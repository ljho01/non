import { propertyText } from '@/shared/contracts/properties'

export function propertyDraft(value: unknown) {
  return value !== null && typeof value === 'object' && !(value instanceof Date)
    ? JSON.stringify(value, null, 2)
    : propertyText(value)
}

export function parsePropertyDraft(text: string, previous: unknown): unknown {
  if (typeof previous === 'number') {
    if (!text.trim()) return null
    const value = Number(text)
    if (!Number.isFinite(value)) throw new Error('숫자를 입력하세요.')
    return value
  }
  if (previous !== null && typeof previous === 'object' && !(previous instanceof Date)) {
    const value: unknown = JSON.parse(text)
    if (Array.isArray(previous) ? !Array.isArray(value) : value === null || typeof value !== 'object' || Array.isArray(value))
      throw new Error(Array.isArray(previous) ? '목록을 입력하세요.' : '객체를 입력하세요.')
    return value
  }
  return text
}
