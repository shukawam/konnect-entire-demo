import type { Logger } from 'pino'

/**
 * Hono の app.onError に渡す共通エラーハンドラーを生成する。
 * 未処理例外を構造化ログに出力し、統一された JSON エラーレスポンスを返す。
 */
export function createErrorHandler(logger: Logger) {
  return (err: Error, c: { req: { method: string; path: string }; json: Function }) => {
    logger.error({ err, method: c.req.method, path: c.req.path }, 'Unhandled error')
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

/**
 * Hono の app.notFound に渡す共通 404 ハンドラーを生成する。
 */
export function createNotFoundHandler(logger: Logger) {
  return (c: { req: { method: string; path: string }; json: Function }) => {
    logger.warn({ method: c.req.method, path: c.req.path }, 'Route not found')
    return c.json({ error: 'Not Found' }, 404)
  }
}
