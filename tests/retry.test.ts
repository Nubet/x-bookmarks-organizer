import {describe, expect, it} from 'vitest'
import {retryAsync} from '../src/shared/retry'

describe('retryAsync', () => {
  it('retries transient failures with bounded attempts', async () => {
    let attempts = 0
    const result = await retryAsync(async () => {
      attempts += 1
      if (attempts < 3) throw new Error('temporary failure')
      return 'ok'
    }, {retries: 2, baseDelayMs: 0})

    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })

  it('stops immediately when the error is not retryable', async () => {
    let attempts = 0
    await expect(retryAsync(async () => {
      attempts += 1
      throw new Error('permanent failure')
    }, {retries: 2, baseDelayMs: 0, shouldRetry: () => false})).rejects.toThrow('permanent failure')

    expect(attempts).toBe(1)
  })
})
