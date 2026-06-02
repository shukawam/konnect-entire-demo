import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'

const app = new OpenAPIHono()

// 認証は Keycloak SSO + Kong openid-connect プラグインが担う。
// Kong が検証済みトークンの claim を upstream ヘッダーへ注入する:
//   sub → X-User-Id, email → X-User-Email, preferred_username → X-User-Name
// User Service はそのヘッダーから本人情報を返すのみで、パスワードや API キーは持たない。

// Schemas
const UserProfileSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  })
  .openapi('UserProfile')

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi('Error')

// GET /me — Kong が注入した claim から本人のプロフィールを返す
const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['User'],
  summary: 'プロフィール取得',
  responses: {
    200: {
      description: 'プロフィール',
      content: { 'application/json': { schema: UserProfileSchema } },
    },
    401: { description: '認証エラー', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

app.openapi(getMeRoute, async (c) => {
  const userId = c.req.header('X-User-Id')
  if (!userId) return c.json({ error: '認証が必要です' }, 401)
  return c.json(
    {
      id: userId,
      email: c.req.header('X-User-Email') ?? '',
      name: c.req.header('X-User-Name') ?? '',
    },
    200,
  )
})

export default app
