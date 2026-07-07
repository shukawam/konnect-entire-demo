import { context, propagation, trace } from '@opentelemetry/api'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/api\/proxy/, '')
  const search = req.nextUrl.search
  const url = `${BACKEND_URL}${path}${search}`

  const tracer = trace.getTracer('frontend-proxy')
  const session = await auth()

  return tracer.startActiveSpan(`proxy ${req.method} ${path}`, async (span) => {
    try {
      const headers: Record<string, string> = {}
      for (const [key, value] of req.headers.entries()) {
        if (key === 'host' || key === 'connection' || key === 'transfer-encoding') continue
        // 認証情報はサーバー側で付与するため、クライアント由来の値は破棄する
        if (key === 'authorization' || key === 'apikey' || key === 'x-user-id') continue
        headers[key] = value
      }

      // Keycloak アクセストークンを Bearer として付与（Kong openid-connect が検証する）
      if (session?.accessToken) {
        headers['authorization'] = `Bearer ${session.accessToken}`
      }

      // Inject W3C trace context into outgoing request
      propagation.inject(context.active(), headers)

      const res = await fetch(url, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
      })

      span.setAttribute('http.status_code', res.status)

      const responseHeaders = new Headers()
      for (const [key, value] of res.headers.entries()) {
        // fetch は gzip を自動解凍するため、圧縮時の content-encoding / content-length を
        // そのまま返すとブラウザが解凍後の本文を（小さい）content-length で打ち切り JSON が壊れる
        // （Kong ai-semantic-cache ヒット時に固定 content-length + gzip で返るため顕在化）。
        // 本文長はプラットフォームに再計算させる。
        if (key === 'transfer-encoding' || key === 'content-encoding' || key === 'content-length')
          continue
        responseHeaders.set(key, value)
      }

      return new NextResponse(res.body, {
        status: res.status,
        headers: responseHeaders,
      })
    } finally {
      span.end()
    }
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
