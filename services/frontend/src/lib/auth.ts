'use client'

import { createContext, useContext } from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string
  apiKey: string
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const data = localStorage.getItem('user')
  return data ? JSON.parse(data) : null
}

export function storeUser(user: AuthUser) {
  localStorage.setItem('user', JSON.stringify(user))
}

export function clearUser() {
  localStorage.removeItem('user')
}
