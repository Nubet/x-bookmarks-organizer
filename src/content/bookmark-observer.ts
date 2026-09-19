import {sendRuntimeMessage} from '../shared/runtime'
import type {BookmarkCapture} from '../shared/types'
import {captureBookmark, findBookmarkButtons} from './x-dom-adapter'

const BOUND_ATTRIBUTE = 'data-x-bookmarks-organizer-bound'

export function observeBookmarkButtons(
  onCapture: (bookmark: BookmarkCapture) => void
) {
  const bindButtons = (root: ParentNode) => {
    for (const button of findBookmarkButtons(root)) {
      if (button.hasAttribute(BOUND_ATTRIBUTE)) continue

      button.setAttribute(BOUND_ATTRIBUTE, 'true')
      button.addEventListener('click', () => {
        const bookmark = captureBookmark(button)
        if (bookmark) onCapture(bookmark)
      })
    }
  }

  bindButtons(document)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          bindButtons(node)
        }
      }
    }
  })

  if (document.body) {
    observer.observe(document.body, {childList: true, subtree: true})
  }

  return () => observer.disconnect()
}

export function saveCapturedBookmark(bookmark: BookmarkCapture) {
  void sendRuntimeMessage({type: 'BOOKMARK_SAVE', bookmark})
}
