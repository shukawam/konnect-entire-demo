import { describe, it, expect } from 'vitest'
import { recommendationCard } from '../card.js'

describe('recommendationCard', () => {
  it('skill product-recommendation を持つ v0.3 カードを返す', () => {
    const card = recommendationCard('http://localhost:3007')
    expect(card.preferredTransport).toBe('JSONRPC')
    expect(card.url).toBe('http://localhost:3007/')
    expect(card.skills.map((s) => s.id)).toEqual(['product-recommendation'])
    expect(card.description).toContain('商品')
  })
})
