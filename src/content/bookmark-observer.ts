import {sendRuntimeMessage} from '../shared/runtime'
import type {BookmarkCapture} from '../shared/types'
import {captureBookmark} from './x-dom-adapter'

export function observeBookmarkButtons(
  onCapture: (bookmark: BookmarkCapture) => void
) {
  const handleClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest<HTMLElement>('[data-testid="bookmark"]')
    if (!button) return

    const bookmark = captureBookmark(button)
    if (bookmark) onCapture(bookmark)
  }

  document.addEventListener('click', handleClick, true)

  return () => document.removeEventListener('click', handleClick, true)
}

export function saveCapturedBookmark(bookmark: BookmarkCapture) {
  void sendRuntimeMessage({type: 'BOOKMARK_SAVE', bookmark})
}
