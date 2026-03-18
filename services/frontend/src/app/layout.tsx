import type { Metadata } from 'next'
import './globals.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import AskAIDialog from '@/components/AskAIDialog'

export const metadata: Metadata = {
  title: 'Jungle Shop',
  description: 'Kong Konnect デモ EC サイト',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
        <AskAIDialog />
      </body>
    </html>
  )
}
