import { describe, expect, test } from 'bun:test'
import { detectAppLanguage, translate } from '../i18n'

describe('i18n', () => {
  test('detects each supported language from regional browser locales', () => {
    expect(detectAppLanguage(['ko-KR'])).toBe('ko')
    expect(detectAppLanguage(['en-GB'])).toBe('en')
    expect(detectAppLanguage(['zh-TW'])).toBe('zh-CN')
    expect(detectAppLanguage(['es-MX'])).toBe('es')
    expect(detectAppLanguage(['hi-IN'])).toBe('hi')
    expect(detectAppLanguage(['ar-SA'])).toBe('ar')
  })

  test('uses English when the browser language is unsupported', () => {
    expect(detectAppLanguage(['fr-FR', 'de-DE'])).toBe('en')
  })

  test('translates core interface copy in every supported locale', () => {
    expect(translate('ko', '설정')).toBe('설정')
    expect(translate('en', '설정')).toBe('Settings')
    expect(translate('zh-CN', '설정')).toBe('设置')
    expect(translate('es', '설정')).toBe('Configuración')
    expect(translate('hi', '설정')).toBe('सेटिंग्स')
    expect(translate('ar', '설정')).toBe('الإعدادات')
  })

  test('falls back to the source copy for unknown keys', () => {
    expect(translate('en', 'Non')).toBe('Non')
  })
})
