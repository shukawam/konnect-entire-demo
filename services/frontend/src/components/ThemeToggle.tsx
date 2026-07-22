'use client'

import { useEffect, useState } from 'react'
import { getResolvedTheme, toggleTheme, type Theme } from '@/lib/theme'

/**
 * ライト/ダークの手動切替ボタン。既定はダーク（DESIGN.md の Kong AI Portal 風）。
 * 初期テーマは layout.tsx の no-flash スクリプトが `<html data-theme>` に反映済みで、
 * ここはマウント後に DOM の実効テーマへ表示を同期し、クリックでトグルする。
 */
export default function ThemeToggle() {
  // SSR とクライアント初期描画を一致させるため、マウント前はダーク前提で描画する。
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    setThemeState(getResolvedTheme())
  }, [])

  const handleToggle = () => {
    setThemeState(toggleTheme())
  }

  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      className="nav-icon-btn"
      onClick={handleToggle}
      aria-label={isDark ? 'ライトテーマに切替' : 'ダークテーマに切替'}
      title={isDark ? 'ライトテーマに切替' : 'ダークテーマに切替'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
