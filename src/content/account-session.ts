import type {AccountId} from '../shared/types'

export function readAccountId(): AccountId | null {
  const value = document.cookie.match(/(?:^|; )twid=([^;]+)/)?.[1]
  if (!value) return null

  return parseAccountIdCookie(value)
}

export function parseAccountIdCookie(value: string) {
  try {
    return decodeURIComponent(value).match(/^u=(\d+)/)?.[1] ?? null
  } catch {
    return null
  }
}

export function requireAccountId() {
  const accountId = readAccountId()
  if (!accountId) throw new Error('Sign in to X before using your bookmarks.')
  return accountId
}
