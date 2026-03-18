import { context, propagation, trace } from '@opentelemetry/api'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/api\/proxy/, '')
  const search = req.nextUrl.search
  const url = `${BACKEND_URL}${path}${search}`

  const tracer = trace.getTracer('frontend-proxy')

  return tracer.startActiveSpan(`proxy ${req.method} ${path}`, async (span) => {
    try {
      const headers: Record<string, string> = {}
      for (const [key, value] of req.headers.entries()) {
        if (key === 'host' || key === 'connection' || key === 'transfer-encoding') continue
        headers[key] = value
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
        if (key === 'transfer-encoding' || key === 'content-encoding') continue
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
