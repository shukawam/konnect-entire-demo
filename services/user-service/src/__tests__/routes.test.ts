import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-pw'), compare: vi.fn() },
}))
vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid'),
}))

import app from '../routes.js'
import { prisma } from '../db.js'
import bcrypt from 'bcryptjs'

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  password: 'hashed-pw',
  apiKey: 'test-uuid',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /register', () => {
  it('success -> 201', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser)

    const res = await app.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      apiKey: 'test-uuid',
    })
  })

  it('duplicate email -> 409', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)

    const res = await app.request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }),
    })

    expect(res.status).toBe(409)
  })
})

describe('POST /login', () => {
  it('success -> 200', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      apiKey: 'test-uuid',
    })
  })

  it('wrong email -> 401', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wrong@example.com', password: 'password123' }),
    })

    expect(res.status).toBe(401)
  })

  it('wrong password -> 401', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' }),
    })

    expect(res.status).toBe(401)
  })
})

describe('GET /me', () => {
  it('without header -> 401', async () => {
    const res = await app.request('/me', { method: 'GET' })
    expect(res.status).toBe(401)
  })

  it('user found -> 200', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)

    const res = await app.request('/me', {
      method: 'GET',
      headers: { 'X-User-Id': 'user-1' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })
  })

  it('user not found -> 404', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    const res = await app.request('/me', {
      method: 'GET',
      headers: { 'X-User-Id': 'nonexistent' },
    })

    expect(res.status).toBe(404)
  })
})

describe('PATCH /me', () => {
  it('success -> 200', async () => {
    const updatedUser = { ...mockUser, name: 'Updated Name' }
    vi.mocked(prisma.user.update).mockResolvedValue(updatedUser)

    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-1' },
      body: JSON.stringify({ name: 'Updated Name' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Updated Name',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })
  })

  it('without header -> 401', async () => {
    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name' }),
    })

    expect(res.status).toBe(401)
  })
})
