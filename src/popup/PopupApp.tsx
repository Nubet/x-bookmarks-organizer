import {useDeferredValue, useState, useSyncExternalStore} from 'react'
import {sendRuntimeMessage} from '../shared/runtime'
import type {BookmarkPreview, LibrarySnapshot} from '../shared/types'

const emptySnapshot: LibrarySnapshot = {
  bookmarks: [],
  folders: [],
  tags: [],
}

interface LibraryView {
  snapshot: LibrarySnapshot
  loading: boolean
  error: string
}

let view: LibraryView = {
  snapshot: emptySnapshot,
  loading: false,
  error: '',
}
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

async function loadLibrary() {
  if (view.loading) return

  view = {...view, loading: true, error: ''}
  notify()

  const [bookmarksResponse, foldersResponse, tagsResponse] = await Promise.all([
    sendRuntimeMessage<BookmarkPreview[]>({type: 'BOOKMARKS_LIST'}),
    sendRuntimeMessage<LibrarySnapshot['folders']>({type: 'FOLDER_LIST'}),
    sendRuntimeMessage<string[]>({type: 'TAG_LIST'}),
  ])

  if (!bookmarksResponse.ok || !foldersResponse.ok || !tagsResponse.ok) {
    view = {...view, loading: false, error: 'Could not load the local library.'}
  } else {
    view = {
      snapshot: {
        bookmarks: bookmarksResponse.data,
        folders: foldersResponse.data,
        tags: tagsResponse.data,
      },
      loading: false,
      error: '',
    }
  }

  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  void loadLibrary()

  return () => listeners.delete(listener)
}

function getSnapshot() {
  return view
}

function BookmarkCard({bookmark}: {bookmark: BookmarkPreview}) {
  return (
    <article className="bookmark_card">
      <p className="bookmark_author">
        {bookmark.author.name} <span>@{bookmark.author.username}</span>
      </p>
      <p className="bookmark_text">{bookmark.text}</p>
      <div className="bookmark_tags">
        {bookmark.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
    </article>
  )
}

export default function PopupApp() {
  const {snapshot: library, loading, error} = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  )
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visibleBookmarks = library.bookmarks.filter((bookmark) => {
    if (!deferredQuery) return true

    return [
      bookmark.text,
      bookmark.author.name,
      bookmark.author.username,
      ...bookmark.tags,
    ]
      .join(' ')
      .toLowerCase()
      .includes(deferredQuery)
  })

  return (
    <main className="popup_app">
      <header className="popup_header">
        <div>
          <p className="popup_eyebrow">x-bookmarks-organizer</p>
          <h1>Bookmarks</h1>
        </div>
        <span className="bookmark_count">{library.bookmarks.length}</span>
      </header>

      <label className="search_label">
        <span className="sr_only">Search bookmarks</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search bookmarks"
        />
      </label>

      {loading && <p className="status_message">Loading library...</p>}
      {error && <p className="status_message status_error">{error}</p>}
      {!loading && !error && visibleBookmarks.length === 0 && (
        <p className="status_message">No bookmarks found.</p>
      )}
      <section className="bookmark_list" aria-label="Bookmarks">
        {visibleBookmarks.map((bookmark) => (
          <BookmarkCard key={bookmark.id} bookmark={bookmark} />
        ))}
      </section>
    </main>
  )
}
