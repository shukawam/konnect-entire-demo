import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
  // Next/React 19 と同じ automatic JSX ランタイムを使う（tsx コンポーネントは
  // React を import しないため、classic ランタイムだと "React is not defined" になる）。
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
