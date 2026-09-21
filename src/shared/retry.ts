export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
  shouldRetry?: (error: unknown) => boolean
}

export async function retryAsync<T>(operation: () => Promise<T>, options: RetryOptions = {}) {
  const retries = options.retries ?? 2
  const baseDelayMs = options.baseDelayMs ?? 250
  const shouldRetry = options.shouldRetry ?? (() => true)

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
    }
  }
}
