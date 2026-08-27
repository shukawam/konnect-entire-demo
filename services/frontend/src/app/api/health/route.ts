import { NextResponse } from 'next/server'

// Docker healthcheck 専用。実ページ(/)を叩くとレンダリングのトレースが
// 10 秒ごとに発生してしまうため、トレース対象外にできる専用ルートを用意する。
export function GET() {
  return NextResponse.json({ status: 'ok' })
}
