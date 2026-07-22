import { describe, it, expect, beforeEach } from 'vitest'
import {
  THEME_STORAGE_KEY,
  getStoredTheme,
  getInitialTheme,
  getResolvedTheme,
  applyTheme,
  setTheme,
  toggleTheme,
} from '../theme'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme: getStoredTheme / getInitialTheme', () => {
  it('未設定なら getStoredTheme は null、getInitialTheme は dark（既定）', () => {
    expect(getStoredTheme()).toBeNull()
    expect(getInitialTheme()).toBe('dark')
  })

  it('保存された light/dark を読み出す', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(getStoredTheme()).toBe('light')
    expect(getInitialTheme()).toBe('light')
  })

  it('不正値は null 扱いで既定 dark にフォールバック', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'blue')
    expect(getStoredTheme()).toBeNull()
    expect(getInitialTheme()).toBe('dark')
  })
})

describe('theme: applyTheme / getResolvedTheme', () => {
  it('light は data-theme=light を付与、dark は属性を外す', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(getResolvedTheme()).toBe('light')

    applyTheme('dark')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(getResolvedTheme()).toBe('dark')
  })
})

describe('theme: setTheme', () => {
  it('DOM 反映と localStorage 永続化を両方行う', () => {
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})

describe('theme: toggleTheme', () => {
  it('既定(dark)から light へ、もう一度で dark へ戻る', () => {
    expect(getResolvedTheme()).toBe('dark')

    expect(toggleTheme()).toBe('light')
    expect(getResolvedTheme()).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    expect(toggleTheme()).toBe('dark')
    expect(getResolvedTheme()).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
