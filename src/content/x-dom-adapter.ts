import type {BookmarkCapture} from '../shared/types'

const TWEET_SELECTOR = 'article[data-testid="tweet"]'

export function captureBookmark(button: HTMLElement): BookmarkCapture | null {
  const article = button.closest<HTMLElement>(TWEET_SELECTOR)
  if (!article) return null

  const tweetId = extractTweetId(article)
  if (!tweetId) return null

  return {
    tweetId,
    text: article.querySelector<HTMLElement>('[data-testid="tweetText"]')?.innerText ?? '',
    author: extractAuthor(article),
  }
}

function extractTweetId(article: HTMLElement) {
  const statusLink = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
  const match = statusLink?.href.match(/\/status\/(\d+)/)
  return match?.[1] ?? null
}

function extractAuthor(article: HTMLElement): BookmarkCapture['author'] {
  const authorBlock = article.querySelector<HTMLElement>('[data-testid="User-Name"]')
  const username = Array.from(authorBlock?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
    .map((link) => link.textContent?.trim() ?? '')
    .find((value) => value.startsWith('@'))

  const name = authorBlock?.firstElementChild?.textContent?.trim() || 'Unknown author'

  return {
    name,
    username: username?.slice(1) || 'unknown',
  }
}
