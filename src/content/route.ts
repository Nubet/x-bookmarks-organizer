const BOOKMARKS_PATH_RE = /^\/i\/(?:history(?:\/bookmarks(?:\/[^/]+)?)?|bookmarks(?:\/[^/]+)?)\/?$/
const FOLDER_ID_RE = /^\/i\/(?:history\/bookmarks|bookmarks)\/(\d+)\/?$/

export function isBookmarksRoute(urlOrPath = location.href) {
  const pathname = toPathname(urlOrPath)
  return pathname !== null && BOOKMARKS_PATH_RE.test(pathname)
}

export function getBookmarkFolderId(urlOrPath = location.href) {
  const pathname = toPathname(urlOrPath)
  return pathname?.match(FOLDER_ID_RE)?.[1] ?? null
}

function toPathname(urlOrPath: string) {
  try {
    return new URL(urlOrPath, 'https://x.com').pathname
  } catch {
    return null
  }
}

export function watchRouteChanges(onChange: () => void) {
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  let currentPath = location.pathname
  const notify = () => {
    if (location.pathname === currentPath) return
    currentPath = location.pathname
    onChange()
  }

  history.pushState = function (...args) {
    originalPushState.apply(this, args)
    notify()
  }
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    notify()
  }
  window.addEventListener('popstate', notify)

  const observer = new MutationObserver(notify)
  if (document.body) observer.observe(document.body, {childList: true, subtree: true})

  return () => {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
    window.removeEventListener('popstate', notify)
    observer.disconnect()
  }
}
