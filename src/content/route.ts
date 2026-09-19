export function isBookmarksRoute() {
  return location.pathname === '/i/bookmarks' || location.pathname === '/i/history'
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
