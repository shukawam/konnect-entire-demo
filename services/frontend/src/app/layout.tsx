import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import AskAIDialog from '@/components/AskAIDialog'
import Providers from '@/components/Providers'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Jungle Shop',
  description: 'Kong Konnect デモ EC サイト',
}

// 初回ペイント前にテーマを適用する no-flash スクリプト。既定はダークで、ユーザーが
// 手動でライトに切替えた場合のみ localStorage('theme') に 'light' が入る（lib/theme.ts）。
const themeInitScript = `(function(){try{if(localStorage.getItem('theme')==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
          <AskAIDialog />
        </Providers>
      </body>
    </html>
  )
}
