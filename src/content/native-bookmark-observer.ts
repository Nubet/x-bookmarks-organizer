import type {LocalBookmarkCapture} from '../shared/types'

const BOOKMARK_SELECTOR = '[data-testid="bookmark"], [data-testid="removeBookmark"]'
const TWEET_SELECTOR = 'article[data-testid="tweet"]'

export function watchNativeBookmarkActions(onAction: (capture: LocalBookmarkCapture, removing: boolean) => void) {
  const intercepted = new WeakSet<Element>()
  let rescanTimer: number | null = null

  const intercept = (root: ParentNode = document) => {
    root.querySelectorAll(BOOKMARK_SELECTOR).forEach((button) => {
      if (intercepted.has(button)) return
      intercepted.add(button)
      button.addEventListener('click', () => {
        const tweet = button.closest(TWEET_SELECTOR)
        const capture = tweet ? parseTweet(tweet) : null
        if (!capture) return
        onAction(capture, button.getAttribute('data-testid') === 'removeBookmark')
      })
    })
  }

  const scheduleRescan = () => {
    if (rescanTimer !== null) window.clearTimeout(rescanTimer)
    rescanTimer = window.setTimeout(() => {
      rescanTimer = null
      intercept()
    }, 250)
  }

  const observer = new MutationObserver((mutations) => {
    const needsRescan = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) =>
        node instanceof Element && (node.matches(BOOKMARK_SELECTOR) || node.querySelector(BOOKMARK_SELECTOR) !== null)
      )
    )
    if (needsRescan) scheduleRescan()
  })

  intercept()
  if (document.body) observer.observe(document.body, {childList: true, subtree: true})

  return () => {
    observer.disconnect()
    if (rescanTimer !== null) window.clearTimeout(rescanTimer)
  }
}

function parseTweet(tweet: Element): LocalBookmarkCapture | null {
  const tweetId = Array.from(tweet.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'))
    .map((link) => link.href.match(/\/status\/(\d+)/)?.[1])
    .find(Boolean)
  const username = tweet.querySelector<HTMLAnchorElement>('[data-testid="User-Name"] a[href^="/"]')
    ?.getAttribute('href')
    ?.match(/^\/([^/?]+)/)?.[1]

  if (!tweetId || !username) return null

  const authorText = tweet.querySelector('[data-testid="User-Name"]')?.textContent?.trim() ?? ''
  return {
    source: 'manual',
    tweetId,
    text: tweet.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '',
    author: {name: authorText.split('@')[0]?.trim() || username, username},
    avatarUrl: tweet.querySelector<HTMLImageElement>('img[src*="profile_images"]')?.src,
    postedAt: tweet.querySelector('time')?.getAttribute('datetime') ?? undefined,
  }
}
