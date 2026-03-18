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
  it('stores user in localStorage', () => {
    storeUser(mockUser)
    const stored = JSON.parse(localStorage.getItem('user')!)
    expect(stored).toEqual(mockUser)
  })
})

describe('getStoredUser', () => {
  it('returns null when no user stored', () => {
    expect(getStoredUser()).toBeNull()
  })

  it('returns user when stored', () => {
    localStorage.setItem('user', JSON.stringify(mockUser))
    expect(getStoredUser()).toEqual(mockUser)
  })
})

describe('clearUser', () => {
  it('removes user from localStorage', () => {
    storeUser(mockUser)
    clearUser()
    expect(localStorage.getItem('user')).toBeNull()
  })
})
