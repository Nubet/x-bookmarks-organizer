import {describe, expect, it} from 'vitest'
import {parseAccountIdCookie} from '../src/content/account-session'

describe('account session', () => {
  it('reads an X user id from an encoded twid cookie', () => {
    expect(parseAccountIdCookie('u%3D123456%26twid%3Du%253D123456')).toBe('123456')
  })

  it('rejects malformed or unrelated cookie values', () => {
    expect(parseAccountIdCookie('not-a-twid')).toBeNull()
    expect(parseAccountIdCookie('%E0%A4%A')).toBeNull()
  })
})
