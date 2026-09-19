export function isBookmarksRoute() {
  return location.pathname === '/i/bookmarks' || location.pathname === '/i/history'
}

export function watchRouteChanges(onChange: () => void) {
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  const notify = () => onChange()

  history.pushState = function (...args) {
    originalPushState.apply(this, args)
    notify()
  }
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    notify()
  }
  window.addEventListener('popstate', notify)

  return () => {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
    window.removeEventListener('popstate', notify)
  }
}
