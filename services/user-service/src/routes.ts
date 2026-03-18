import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { prisma } from './db.js'

const app = new OpenAPIHono()

// Schemas
const UserResponseSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    apiKey: z.string(),
  })
  .openapi('UserResponse')

const UserProfileSchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('UserProfile')

const RegisterSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(6),
  })
  .openapi('RegisterRequest')

const LoginSchema = z
  .object({
    email: z.string().email(),
    password: z.string(),
  })
  .openapi('LoginRequest')

const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .openapi('UpdateProfileRequest')

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi('Error')

// POST /register
const registerRoute = createRoute({
  method: 'post',
  path: '/register',
  tags: ['User'],
  summary: 'ユーザー登録',
  request: {
    body: { content: { 'application/json': { schema: RegisterSchema } } },
  },
  responses: {
    201: {
      description: '登録完了',
      content: { 'application/json': { schema: UserResponseSchema } },
    },
    409: {
      description: 'メールアドレス重複',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(registerRoute, async (c) => {
  const { email, name, password } = c.req.valid('json')
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return c.json({ error: 'このメールアドレスは既に登録されています' }, 409)
  const hashedPassword = await bcrypt.hash(password, 10)
  const apiKey = randomUUID()
  const user = await prisma.user.create({
    data: { email, name, password: hashedPassword, apiKey },
  })
  return c.json({ id: user.id, email: user.email, name: user.name, apiKey: user.apiKey }, 201)
})

// POST /login
const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['User'],
  summary: 'ログイン',
  request: {
    body: { content: { 'application/json': { schema: LoginSchema } } },
  },
  responses: {
    200: {
      description: 'ログイン成功',
      content: { 'application/json': { schema: UserResponseSchema } },
    },
    401: { description: '認証失敗', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

app.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid('json')
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
  return c.json({ id: user.id, email: user.email, name: user.name, apiKey: user.apiKey }, 200)
})

// GET /me
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
    404: {
      description: 'ユーザーが見つかりません',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(getMeRoute, async (c) => {
  const userId = c.req.header('X-User-Id')
  if (!userId) return c.json({ error: '認証が必要です' }, 401)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return c.json({ error: 'ユーザーが見つかりません' }, 404)
  return c.json(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    200,
  )
})

// PATCH /me
const updateMeRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['User'],
  summary: 'プロフィール更新',
  request: {
    body: { content: { 'application/json': { schema: UpdateProfileSchema } } },
  },
  responses: {
    200: {
      description: '更新完了',
      content: { 'application/json': { schema: UserProfileSchema } },
    },
    401: { description: '認証エラー', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

app.openapi(updateMeRoute, async (c) => {
  const userId = c.req.header('X-User-Id')
  if (!userId) return c.json({ error: '認証が必要です' }, 401)
  const data = c.req.valid('json')
  const user = await prisma.user.update({ where: { id: userId }, data })
  return c.json(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    200,
  )
})

export default app
