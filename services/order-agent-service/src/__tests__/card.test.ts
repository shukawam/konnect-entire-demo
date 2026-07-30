import { describe, it, expect } from 'vitest'
import { orderCard } from '../card.js'

describe('orderCard', () => {
  it('skill cart-and-order を持つ v0.3 カードを返す', () => {
    const card = orderCard('http://localhost:3008')
    expect(card.preferredTransport).toBe('JSONRPC')
    expect(card.url).toBe('http://localhost:3008/')
    expect(card.skills.map((s) => s.id)).toEqual(['cart-and-order'])
    expect(card.description).toContain('注文')
  })
})
