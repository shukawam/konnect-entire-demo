'use client'

/**
 * ライト/ダークのテーマ切替ロジック。
 *
 * - 既定はダーク（DESIGN.md の Kong AI Portal 風）。
 * - ユーザーが手動トグルした場合のみ localStorage に永続化する。
 * - 実際の反映は `<html data-theme="light">` 属性の付け外しで行い、値の解決は
 *   `globals.css` の `:root` / `:root[data-theme='light']` が担う。
 *
 * no-flash 初期化（初回ペイント前の属性適用）は `layout.tsx` のインラインスクリプトで行い、
 * ここは主にトグル操作とテスト可能な純ロジックを提供する。
 */

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'

/** localStorage に保存されたテーマを返す。未設定・不正値・SSR では null。 */
export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** 保存値が無ければ既定（dark）を採用した現在の実効テーマ。 */
export function getInitialTheme(): Theme {
  return getStoredTheme() ?? 'dark'
}

/** `<html>` の data-theme 属性へ反映する（dark は既定なので属性を外す）。 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    root.removeAttribute('data-theme')
  }
}

/** テーマを保存して DOM に反映する。 */
export function setTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* localStorage 不可の環境では永続化のみスキップ（表示は反映済み） */
  }
}

/** 現在のテーマを反転して保存・反映し、切替後のテーマを返す。 */
export function toggleTheme(): Theme {
  const next: Theme = getResolvedTheme() === 'light' ? 'dark' : 'light'
  setTheme(next)
  return next
}

/** DOM の現在状態（data-theme 属性の有無）から実効テーマを解決する。 */
export function getResolvedTheme(): Theme {
  if (typeof document === 'undefined') return getInitialTheme()
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}
