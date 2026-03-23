import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'

type JsonResponse = { json: (data: unknown, status?: number) => Response }
type RequestInfo = { req: { method: string; path: string } }
type HandlerContext = RequestInfo & JsonResponse

/**
 * Hono の app.onError に渡す共通エラーハンドラーを生成する。
 * HTTPException はそのままレスポンスを返し、それ以外の未処理例外は
 * 構造化ログに出力して統一された 500 JSON レスポンスを返す。
 */
export function createErrorHandler(logger: Logger) {
  return (err: Error, c: HandlerContext) => {
    if (err instanceof HTTPException) {
      return err.getResponse()
    }
    logger.error({ err, method: c.req.method, path: c.req.path }, 'Unhandled error')
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

/**
 * Hono の app.notFound に渡す共通 404 ハンドラーを生成する。
 */
export function createNotFoundHandler(logger: Logger) {
  return (c: HandlerContext) => {
    logger.warn({ method: c.req.method, path: c.req.path }, 'Route not found')
    return c.json({ error: 'Not Found' }, 404)
  }
}
