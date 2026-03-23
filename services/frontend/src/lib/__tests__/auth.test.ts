import { describe, it, expect, beforeEach } from 'vitest'
import { getStoredUser, storeUser, clearUser, type AuthUser } from '../auth'

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  apiKey: 'api-key-123',
}

beforeEach(() => {
  localStorage.clear()
})

describe('storeUser', () => {
  it('ユーザー情報を localStorage に保存する', () => {
    storeUser(mockUser)
    const stored = JSON.parse(localStorage.getItem('user')!)
    expect(stored).toEqual(mockUser)
  })
})

describe('getStoredUser', () => {
  it('ユーザーが保存されていない場合 null を返す', () => {
    expect(getStoredUser()).toBeNull()
  })

  it('保存済みのユーザーを返す', () => {
    localStorage.setItem('user', JSON.stringify(mockUser))
    expect(getStoredUser()).toEqual(mockUser)
  })
})

describe('clearUser', () => {
  it('localStorage からユーザー情報を削除する', () => {
    storeUser(mockUser)
    clearUser()
    expect(localStorage.getItem('user')).toBeNull()
  })
})
