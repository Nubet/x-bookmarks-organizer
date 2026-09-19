import {createRoot, type Root} from 'react-dom/client'
import {useState, useSyncExternalStore} from 'react'
import {sendRuntimeMessage} from '../shared/runtime'
import type {BookmarkPreview, LibrarySnapshot} from '../shared/types'
import './bookmarks-view.css'

const ROOT_ID = 'x-bookmarks-organizer-root'
const HIDDEN_ATTRIBUTE = 'data-x-bookmarks-organizer-hidden'

interface LibraryState {
  snapshot: LibrarySnapshot | null
  loading: boolean
  error: string
}

let state: LibraryState = {snapshot: null, loading: false, error: ''}
let loaded = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!loaded) {
    loaded = true
    void loadLibrary()
  }
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

async function loadLibrary() {
  state = {...state, loading: true, error: ''}
  notify()

  const response = await sendRuntimeMessage<LibrarySnapshot>({type: 'LIBRARY_GET'})
  state = response.ok
    ? {snapshot: response.data, loading: false, error: ''}
    : {snapshot: null, loading: false, error: response.error}
  notify()
}

export function mountBookmarksView() {
  if (!isBookmarksRoute()) return () => undefined

  const column = findPrimaryColumn()
  if (!column) return () => undefined

  const rootElement = document.createElement('div')
  rootElement.id = ROOT_ID
  column.append(rootElement)
  hideNativeColumnChildren(column, rootElement)

  const root = createRoot(rootElement)
  root.render(<BookmarksView />)

  return () => {
    root.unmount()
    restoreNativeColumn(column)
    rootElement.remove()
  }
}

export function watchBookmarksRoute() {
  let stopView: () => void = () => {}
  let mounted = false

  const sync = () => {
    const shouldMount = isBookmarksRoute()
    const rootExists = Boolean(document.getElementById(ROOT_ID))
    if (shouldMount && mounted && rootExists) {
      const root = document.getElementById(ROOT_ID)
      const column = root?.parentElement
      if (root && column instanceof HTMLElement) hideNativeColumnChildren(column, root)
      return
    }
    if (!shouldMount && !mounted) return

    stopView()
    mounted = false
    stopView = shouldMount ? mountBookmarksView() : () => {}
    mounted = Boolean(document.getElementById(ROOT_ID))
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.body, {childList: true, subtree: true})
  const interval = window.setInterval(sync, 500)
  sync()

  return () => {
    window.clearInterval(interval)
    observer.disconnect()
    stopView()
  }
}

export function refreshBookmarksView() {
  loaded = false
  void loadLibrary()
}

function isBookmarksRoute() {
  return location.pathname === '/i/bookmarks'
}

function findPrimaryColumn() {
  return document.querySelector<HTMLElement>('[data-testid="primaryColumn"]')
}

function hideNativeColumnChildren(column: HTMLElement, root: HTMLElement) {
  for (const child of Array.from(column.children)) {
    if (child === root) continue
    child.setAttribute(HIDDEN_ATTRIBUTE, 'true')
    child.setAttribute('aria-hidden', 'true')
  }
}

function restoreNativeColumn(column: HTMLElement) {
  for (const child of Array.from(column.children)) {
    if (!child.hasAttribute(HIDDEN_ATTRIBUTE)) continue
    child.removeAttribute(HIDDEN_ATTRIBUTE)
    child.removeAttribute('aria-hidden')
  }
}

function BookmarksView() {
  const {snapshot, loading, error} = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  )
  const [query, setQuery] = useState('')
  const [folderId, setFolderId] = useState('all')
  const [tag, setTag] = useState('all')

  const bookmarks = snapshot?.bookmarks ?? []
  const filteredBookmarks = bookmarks.filter((bookmark) => {
    const normalizedQuery = query.trim().toLowerCase()
    const matchesQuery =
      !normalizedQuery ||
      bookmark.text.toLowerCase().includes(normalizedQuery) ||
      bookmark.author.name.toLowerCase().includes(normalizedQuery) ||
      bookmark.author.username.toLowerCase().includes(normalizedQuery)
    const matchesFolder = folderId === 'all' || bookmark.folderIds.includes(folderId)
    const matchesTag = tag === 'all' || bookmark.tags.includes(tag)
    return matchesQuery && matchesFolder && matchesTag
  })

  return (
    <section className="xbo_view" aria-label="x-bookmarks-organizer">
      <div className="xbo_header">
        <div>
          <p className="xbo_kicker">Local library</p>
          <h1>Bookmarks</h1>
          <p className="xbo_subtitle">Your saved posts, indexed on this device.</p>
        </div>
        <span className="xbo_count">{bookmarks.length}</span>
      </div>

      <label className="xbo_search_label">
        <span className="xbo_sr_only">Search bookmarks</span>
        <input
          className="xbo_search"
          type="search"
          placeholder="Search text or author"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {(snapshot?.folders.length || snapshot?.tags.length) ? (
        <div className="xbo_filters">
          {snapshot.folders.length > 0 && (
            <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
              <option value="all">All folders</option>
              {snapshot.folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
          )}
          {snapshot.tags.length > 0 && (
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="all">All tags</option>
              {snapshot.tags.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          )}
        </div>
      ) : null}

      {loading && <p className="xbo_status">Loading your library...</p>}
      {error && <p className="xbo_status xbo_error">{error}</p>}
      {!loading && !error && filteredBookmarks.length === 0 && (
        <EmptyState hasBookmarks={bookmarks.length > 0} />
      )}
      <div className="xbo_list">
        {filteredBookmarks.map((bookmark) => (
          <BookmarkCard key={bookmark.id} bookmark={bookmark} />
        ))}
      </div>
    </section>
  )
}

function EmptyState({hasBookmarks}: {hasBookmarks: boolean}) {
  return (
    <div className="xbo_empty">
      <span className="xbo_empty_mark">/</span>
      <h2>{hasBookmarks ? 'No matching bookmarks' : 'Your library is empty'}</h2>
      <p>
        {hasBookmarks
          ? 'Try a different search or filter.'
          : 'Save a post on X or run Sync now from the extension popup.'}
      </p>
    </div>
  )
}

function BookmarkCard({bookmark}: {bookmark: BookmarkPreview}) {
  return (
    <article className="xbo_card">
      <div className="xbo_card_meta">
        <span className="xbo_author_name">{bookmark.author.name}</span>
        <span>@{bookmark.author.username}</span>
        <span>·</span>
        <time dateTime={new Date(bookmark.updatedAt).toISOString()}>
          {formatDate(bookmark.updatedAt)}
        </time>
      </div>
      <p className="xbo_card_text">{bookmark.text || 'No text available'}</p>
      {bookmark.tags.length > 0 && (
        <div className="xbo_tags">
          {bookmark.tags.map((item) => <span key={item}>#{item}</span>)}
        </div>
      )}
      <a
        className="xbo_card_link"
        href={`https://x.com/${bookmark.author.username}/status/${bookmark.tweetId}`}
        target="_blank"
        rel="noreferrer"
      >
        Open on X <span aria-hidden="true">↗</span>
      </a>
    </article>
  )
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric'}).format(timestamp)
}
