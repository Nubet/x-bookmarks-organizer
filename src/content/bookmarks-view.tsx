import {createRoot} from 'react-dom/client'
import {memo, useDeferredValue, useMemo, useState, useSyncExternalStore, useTransition, type FormEvent} from 'react'
import {sendRuntimeMessage} from '../shared/runtime'
import type {BookmarkPreview, LibrarySnapshot} from '../shared/types'
import {fetchBookmarkPage, mutateBookmark} from './page-bridge'
import {isBookmarksRoute} from './route'
import './bookmarks-view.css'

const ROOT_ID = 'bookmarks-organizer-root'
const REENABLE_ID = 'bookmarks-organizer-reenable'
const HIDDEN_ATTRIBUTE = 'data-bookmarks-organizer-hidden'
const WIDE_ATTRIBUTE = 'data-bookmarks-organizer-wide'
const monthFormatter = new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric'})
const dateFormatter = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric'})

interface LibraryState {
  snapshot: LibrarySnapshot | null
  loading: boolean
  error: string
}

type ViewMode = 'bookmarks' | 'authors'
type MediaType = 'all' | 'image' | 'video' | 'text'
type SortMode = 'sync-desc' | 'posted-desc'

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
  applyWideLayout(column)

  const root = createRoot(rootElement)
  root.render(<BookmarksView />)

  return () => {
    root.unmount()
    restoreNativeColumn(column)
    restoreWideLayout()
    rootElement.remove()
  }
}

export function watchIntegrationToggle() {
  let button: HTMLButtonElement | null = null

  const mount = () => {
    if (button || !isBookmarksRoute()) return

    const column = findPrimaryColumn()
    if (!column) return

    const wrapper = document.createElement('div')
    wrapper.id = REENABLE_ID
    wrapper.className = 'xbo:sticky xbo:top-0 xbo:z-10 xbo:flex xbo:justify-end xbo:border-b xbo:border-white/10 xbo:bg-neutral-950 xbo:p-2'
    button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Open organizer'
    button.addEventListener('click', async () => {
      button?.setAttribute('disabled', 'true')
      const response = await sendRuntimeMessage({
        type: 'SETTINGS_UPDATE',
        settings: {pageIntegration: true},
      })

      if (response.ok) {
        window.location.reload()
        return
      }

      button?.removeAttribute('disabled')
    })
    wrapper.append(button)
    column.prepend(wrapper)
  }

  const observer = new MutationObserver((mutations) => {
    if (!button && hasRouteRelevantMutation(mutations)) mount()
  })
  const target = findRouteObservationTarget()
  if (target) observer.observe(target, {childList: true, subtree: true})
  mount()

  return () => {
    observer.disconnect()
    document.getElementById(REENABLE_ID)?.remove()
    button = null
  }
}

export function watchBookmarksRoute() {
  let stopView: () => void = () => {}
  let mounted = false
  let syncFrame: number | null = null

  const sync = () => {
    const shouldMount = isBookmarksRoute()
    const rootExists = Boolean(document.getElementById(ROOT_ID))

    if (shouldMount && mounted && rootExists) {
      const root = document.getElementById(ROOT_ID)
      const column = root?.parentElement
      if (root && column instanceof HTMLElement) {
        hideNativeColumnChildren(column, root)
        ensureWideLayout(column)
      }
      return
    }
    if (!shouldMount && !mounted) return

    stopView()
    mounted = false
    stopView = shouldMount ? mountBookmarksView() : () => {}
    mounted = Boolean(document.getElementById(ROOT_ID))
  }

  const scheduleSync = () => {
    if (syncFrame !== null) return
    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = null
      sync()
    })
  }

  const observer = new MutationObserver((mutations) => {
    if (hasRouteRelevantMutation(mutations)) scheduleSync()
  })
  const target = findRouteObservationTarget()
  if (target) observer.observe(target, {childList: true, subtree: true})
  sync()

  return () => {
    observer.disconnect()
    if (syncFrame !== null) window.cancelAnimationFrame(syncFrame)
    stopView()
  }
}

export function refreshBookmarksView() {
  loaded = false
  void loadLibrary()
}

function findPrimaryColumn() {
  return document.querySelector<HTMLElement>('[data-testid="primaryColumn"]')
}

function findRouteObservationTarget() {
  return document.querySelector<HTMLElement>('main[role="main"]') ?? document.body
}

function hasRouteRelevantMutation(mutations: MutationRecord[]) {
  return mutations.some((mutation) =>
    [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
      if (!(node instanceof Element)) return false
      return node.id === ROOT_ID
        || node.querySelector(`#${ROOT_ID}`) !== null
        || node.matches('[data-testid="primaryColumn"]')
        || node.querySelector('[data-testid="primaryColumn"]') !== null
    })
  )
}

function hideNativeColumnChildren(column: HTMLElement, root: HTMLElement) {
  for (const child of Array.from(column.children)) {
    if (child === root) continue
    if (child.getAttribute(HIDDEN_ATTRIBUTE) === 'true') continue
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

function applyWideLayout(primary: HTMLElement) {
  if (document.body.getAttribute('data-bookmarks-organizer-wide') !== 'true') {
    document.body.setAttribute('data-bookmarks-organizer-wide', 'true')
  }

  const secondary = findSecondaryColumn(primary)
  if (secondary && secondary.getAttribute(WIDE_ATTRIBUTE) !== 'true') {
    secondary.setAttribute(WIDE_ATTRIBUTE, 'true')
  }
}

function ensureWideLayout(primary: HTMLElement) {
  if (document.body.getAttribute('data-bookmarks-organizer-wide') !== 'true') {
    applyWideLayout(primary)
    return
  }

  if (document.querySelector(`[${WIDE_ATTRIBUTE}="true"]`)) return
  applyWideLayout(primary)
}

function restoreWideLayout() {
  document.body.removeAttribute('data-bookmarks-organizer-wide')
  document.querySelectorAll(`[${WIDE_ATTRIBUTE}="true"]`).forEach((element) => {
    element.removeAttribute(WIDE_ATTRIBUTE)
  })
}

function findSecondaryColumn(primary: HTMLElement) {
  const sidebar = document.querySelector<HTMLElement>('[data-testid="sidebarColumn"]')
  if (sidebar && !primary.contains(sidebar)) return sidebar

  const complementary = Array.from(
    document.querySelectorAll<HTMLElement>('aside, [role="complementary"]')
  ).find((element) => !primary.contains(element))
  if (complementary) return complementary

  const trendsHeading = Array.from(document.querySelectorAll('h2')).find(
    (heading) => heading.textContent?.trim() === 'Co się dzieje'
  )
  return trendsHeading?.parentElement?.parentElement?.parentElement ?? null
}

interface MonthGroup {
  key: string
  label: string
  bookmarks: BookmarkPreview[]
}

function groupBookmarksByMonth(bookmarks: BookmarkPreview[], sortMode: SortMode): MonthGroup[] {
  const groups = new Map<string, MonthGroup>()
  for (const bookmark of bookmarks) {
    const timestamp = getSortTimestamp(bookmark, sortMode)
    if (!timestamp) {
      const group = groups.get('unknown') ?? {key: 'unknown', label: 'Unknown date', bookmarks: []}
      group.bookmarks.push(bookmark)
      groups.set('unknown', group)
      continue
    }

    const date = new Date(timestamp)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const group = groups.get(key) ?? {
      key,
      label: monthFormatter.format(date),
      bookmarks: [],
    }
    group.bookmarks.push(bookmark)
    groups.set(key, group)
  }
  return Array.from(groups.values()).sort((left, right) => {
    if (left.key === 'unknown') return 1
    if (right.key === 'unknown') return -1
    return right.key.localeCompare(left.key)
  })
}

function BookmarksView() {
  const {snapshot, loading, error} = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [mode, setMode] = useState<ViewMode>('bookmarks')
  const [query, setQuery] = useState('')
  const [folderId, setFolderId] = useState('all')
  const [tag, setTag] = useState('all')
  const [mediaType, setMediaType] = useState<MediaType>('all')
  const [sortMode, setSortMode] = useState<SortMode>('posted-desc')
  const [searchOpen, setSearchOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [integrationEnabled, setIntegrationEnabled] = useState(true)
  const [, startTransition] = useTransition()

  const bookmarks = snapshot?.bookmarks ?? []
  const deferredQuery = useDeferredValue(query)
  const filteredBookmarks = useMemo(
    () => sortBookmarks(filterBookmarks(bookmarks, deferredQuery, folderId, tag, mediaType), sortMode),
    [bookmarks, deferredQuery, folderId, mediaType, sortMode, tag]
  )
  const authorGroups = useMemo(() => groupAuthors(filteredBookmarks), [filteredBookmarks])
  const mediaCounts = useMemo(() => countMedia(bookmarks), [bookmarks])
  const monthlyBookmarks = useMemo(
    () => groupBookmarksByMonth(filteredBookmarks, sortMode),
    [filteredBookmarks, sortMode]
  )

  return (
    <section className="xbo:min-h-full xbo:bg-neutral-950 xbo:font-sans xbo:text-white" aria-label="x-bookmarks-organizer">
      <header className="xbo:sticky xbo:top-0 xbo:z-10 xbo:flex xbo:min-h-14 xbo:items-center xbo:border-b xbo:border-white/10 xbo:bg-neutral-950 xbo:px-6 xbo:py-3">
        <div className="xbo:flex xbo:flex-1 xbo:items-center xbo:gap-3">
          <h1 className="xbo:m-0 xbo:text-3xl xbo:leading-9 xbo:tracking-tight">Historia</h1>
          <button
            className="xbo:inline-flex xbo:h-6 xbo:w-11 xbo:cursor-pointer xbo:items-center xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:p-0.5 xbo:transition xbo:aria-checked:bg-white"
            type="button"
            role="switch"
            aria-checked={integrationEnabled}
            aria-label="Toggle x-bookmarks-organizer"
            onClick={() => void toggleIntegration()}
          >
            <span className="xbo:block xbo:h-4 xbo:w-4 xbo:rounded-full xbo:bg-white xbo:transition xbo:aria-checked:translate-x-5 xbo:aria-checked:bg-black" />
          </button>
          <span className="xbo:font-mono xbo:text-xs xbo:uppercase xbo:tracking-widest xbo:text-neutral-500">{bookmarks.length} saved</span>
        </div>

        <nav className="xbo:flex xbo:justify-center xbo:gap-2" aria-label="Bookmark views">
          {(['bookmarks', 'authors'] as const).map((item) => (
            <button
              key={item}
              className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:transition xbo:hover:bg-neutral-800 xbo:data-[active=true]:border-white xbo:data-[active=true]:bg-white xbo:data-[active=true]:text-black"
              data-active={mode === item}
              type="button"
              onClick={() => setMode(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>

        <div className="xbo:ml-auto xbo:flex xbo:items-center xbo:justify-self-end">
          <button className="xbo:grid xbo:size-10 xbo:cursor-pointer xbo:place-items-center xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:text-xl xbo:text-white xbo:hover:bg-neutral-800" type="button" onClick={() => setAddOpen((open) => !open)} aria-label="Save a post">+</button>
        </div>
      </header>

      <div className="xbo:relative xbo:flex xbo:justify-center xbo:border-b xbo:border-white/10 xbo:p-6">
        <label className="xbo:block xbo:w-full xbo:max-w-md">
          <span className="xbo:absolute xbo:h-px xbo:w-px xbo:overflow-hidden xbo:[clip:rect(0,0,0,0)]">Search bookmarks</span>
          <input
            className="xbo:box-border xbo:w-full xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-4 xbo:py-3 xbo:text-base xbo:text-white xbo:outline-none xbo:focus:border-white"
            type="search"
            placeholder="Search bookmarks — press / to focus"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {searchOpen && (
          <SmartSearch
            mediaCounts={mediaCounts}
            mediaType={mediaType}
            onMediaTypeChange={(value) => startTransition(() => setMediaType(value))}
          />
        )}
      </div>

      {addOpen && (
        <SaveForm
          saving={saving}
          onSubmit={(event) => void saveTweet(event)}
        />
      )}

      {actionMessage && <p className="xbo:m-6 xbo:text-center xbo:text-neutral-500">{actionMessage}</p>}
      {actionError && <p className="xbo:m-6 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-2 xbo:text-center xbo:text-white">{actionError}</p>}
      {loading && <p className="xbo:m-6 xbo:text-center xbo:text-neutral-500">Loading bookmarks...</p>}
      {error && <p className="xbo:m-6 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-2 xbo:text-center xbo:text-white">{error}</p>}

      {!loading && !error && (
        <>
          <div className="xbo:my-6 xbo:flex xbo:items-center xbo:justify-between xbo:px-6">
            <div className="xbo:font-mono xbo:text-xs xbo:uppercase xbo:tracking-widest xbo:text-neutral-500">{summaryFor(mode, filteredBookmarks.length, authorGroups.length)}</div>
            {mode === 'bookmarks' && (
              <div className="xbo:flex xbo:items-center xbo:gap-2">
                <span className="xbo:font-mono xbo:text-xs xbo:uppercase xbo:tracking-widest xbo:text-neutral-500">Sort:</span>
                <select aria-label="Sort bookmarks" className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-3 xbo:py-1 xbo:text-sm xbo:text-white xbo:outline-none xbo:hover:bg-neutral-800" value={sortMode} onChange={(e) => startTransition(() => setSortMode(e.target.value as SortMode))}>
                  <option value="posted-desc">Tweet date ↓</option>
                  <option value="sync-desc">Sync date ↓</option>
                </select>
              </div>
            )}
          </div>

          {mode === 'bookmarks' && filteredBookmarks.length === 0 && <EmptyState />}
          {mode === 'bookmarks' && monthlyBookmarks.map((group) => (
            <div key={group.key} className="xbo:mt-8 xbo:border-t xbo:border-white/10 xbo:pt-8 xbo:first:mt-0 xbo:first:border-t-0 xbo:first:pt-0">
              <h2 className="xbo:mb-5 xbo:px-6 xbo:text-xl xbo:font-bold xbo:tracking-tight">{group.label}</h2>
              <BookmarkGrid bookmarks={group.bookmarks} />
            </div>
          ))}

          {mode === 'authors' && <AuthorGrid authors={authorGroups} />}
        </>
      )}
    </section>
  )

  async function saveTweet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = new FormData(event.currentTarget).get('tweetUrl')
    const tweetId = extractTweetId(typeof input === 'string' ? input : '')
    setActionMessage('')
    setActionError('')

    if (!tweetId) {
      setActionError('Enter a valid X post URL.')
      return
    }

    setSaving(true)
    try {
      await mutateBookmark('CREATE_BOOKMARK', tweetId)
      const page = await fetchBookmarkPage(null)
      const bookmark = page.bookmarks.find((item) => item.tweetId === tweetId)
      if (!bookmark) throw new Error('Saved on X, but the post was not returned yet. Run Sync.')

      const response = await sendRuntimeMessage({type: 'BOOKMARKS_SYNC', bookmarks: [bookmark]})
      if (!response.ok) throw new Error(response.error)
      refreshBookmarksView()
      setAddOpen(false)
      setActionMessage('Bookmark saved.')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not save bookmark.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleIntegration() {
    const enabled = !integrationEnabled
    setIntegrationEnabled(enabled)
    const response = await sendRuntimeMessage({
      type: 'SETTINGS_UPDATE',
      settings: {pageIntegration: enabled},
    })

    if (!response.ok) {
      setIntegrationEnabled(!enabled)
      setActionError(response.error)
      return
    }

    window.location.reload()
  }
}

function SaveForm({saving, onSubmit}: {saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void}) {
  return (
    <form className="xbo:flex xbo:justify-center xbo:gap-3 xbo:p-6 xbo:pt-0 xbo:max-sm:flex-col" onSubmit={onSubmit}>
      <input className="xbo:w-full xbo:max-w-md xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-4 xbo:py-3 xbo:text-base xbo:text-white xbo:outline-0" name="tweetUrl" type="url" placeholder="Paste an X post URL" aria-label="X post URL" />
      <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white xbo:bg-white xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-black xbo:disabled:cursor-wait xbo:disabled:opacity-60" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save post'}</button>
    </form>
  )
}

function SmartSearch({
  mediaCounts,
  mediaType,
  onMediaTypeChange,
}: {
  mediaCounts: Record<string, number>
  mediaType: MediaType
  onMediaTypeChange: (mediaType: MediaType) => void
}) {
  const mediaOptions: Array<[MediaType, string]> = [
    ['all', 'All media'],
    ['image', 'Images'],
    ['video', 'Videos'],
    ['text', 'Text only'],
  ]

  return (
    <div className="xbo:absolute xbo:top-20 xbo:z-20 xbo:w-[min(540px,calc(100%-48px))] xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-950 xbo:p-6">
      <span className="xbo:mb-3 xbo:block xbo:font-mono xbo:text-sm xbo:uppercase xbo:tracking-widest xbo:text-white">MEDIA TYPE</span>
      <div className="xbo:mb-6 xbo:flex xbo:flex-wrap xbo:gap-2 xbo:border-b xbo:border-white/10 xbo:pb-6">
        {mediaOptions.map(([value, label]) => (
          <button
            key={value}
            className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:transition xbo:hover:bg-neutral-800 xbo:data-[selected=true]:border-white xbo:data-[selected=true]:bg-white xbo:data-[selected=true]:text-black"
            data-selected={mediaType === value}
            type="button"
            onClick={() => onMediaTypeChange(value)}
          >
            {label} <b>{value === 'all' ? mediaCounts.All : mediaCounts[label] ?? 0}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

function BookmarkGrid({bookmarks}: {bookmarks: BookmarkPreview[]}) {
  if (bookmarks.length === 0) return <EmptyState />

  return <div className="xbo:columns-1 xbo:gap-6 xbo:px-6 xbo:pb-16 xbo:sm:columns-2 xbo:lg:columns-3 xbo:xl:columns-4">{bookmarks.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} />)}</div>
}

const BookmarkCard = memo(function BookmarkCard({bookmark}: {bookmark: BookmarkPreview}) {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  const remove = () => {
    setRemoving(true)
    setError('')
    void mutateBookmark('DELETE_BOOKMARK', bookmark.tweetId)
      .then(() => sendRuntimeMessage({type: 'BOOKMARK_DELETE', tweetId: bookmark.tweetId}))
      .then((response) => {
        if (!response.ok) throw new Error(response.error)
        refreshBookmarksView()
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not remove bookmark.'))
      .finally(() => setRemoving(false))
  }

  return (
    <article className="xbo:mb-6 xbo:break-inside-avoid xbo:overflow-hidden xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-6">
      <div className="xbo:flex xbo:items-center xbo:gap-3 xbo:text-sm xbo:leading-5 xbo:text-neutral-500">
        <img className="xbo:size-8 xbo:shrink-0 xbo:rounded-full xbo:bg-neutral-800 xbo:object-cover" src={bookmark.avatarUrl} alt="" />
        <span><b>{bookmark.author.name}</b> @{bookmark.author.username} · {formatDate(bookmark.postedAt ?? bookmark.updatedAt)}</span>
      </div>
      <p className="xbo:my-4 xbo:whitespace-pre-wrap xbo:text-base xbo:leading-6 xbo:text-white">{bookmark.text || 'No text available'}</p>
      {bookmark.media?.[0] && <MediaPreview media={bookmark.media[0]} />}
      <div className="xbo:mt-6 xbo:flex xbo:items-center xbo:justify-between xbo:gap-3 xbo:border-t xbo:border-white/10 xbo:pt-4">
        <a className="xbo:rounded-full xbo:border xbo:border-white/25 xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:no-underline xbo:hover:bg-neutral-800" href={`https://x.com/${bookmark.author.username}/status/${bookmark.tweetId}`} target="_blank" rel="noreferrer">Open on X ↗</a>
        <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:disabled:cursor-wait xbo:disabled:opacity-60" type="button" onClick={remove} disabled={removing}>{removing ? 'Removing...' : 'Remove'}</button>
      </div>
      {error && <p className="xbo:mt-4 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-800 xbo:p-2 xbo:text-sm xbo:text-white">{error}</p>}
    </article>
  )
})

function MediaPreview({media}: {media: NonNullable<BookmarkPreview['media']>[number]}) {
  if (media.type === 'video') return <video className="xbo:mb-4 xbo:block xbo:max-h-[260px] xbo:w-full xbo:rounded-lg xbo:bg-neutral-950 xbo:object-cover" controls preload="none" poster={media.previewUrl}><source src={media.url} /></video>
  return <img className="xbo:mb-4 xbo:block xbo:max-h-[260px] xbo:w-full xbo:rounded-lg xbo:bg-neutral-950 xbo:object-cover" src={media.url} alt="" loading="lazy" />
}

interface AuthorGroup {
  username: string
  name: string
  avatarUrl?: string
  count: number
}

function groupAuthors(bookmarks: BookmarkPreview[]) {
  const groups = new Map<string, AuthorGroup>()
  for (const bookmark of bookmarks) {
    const existing = groups.get(bookmark.author.username)
    groups.set(bookmark.author.username, {
      username: bookmark.author.username,
      name: bookmark.author.name,
      avatarUrl: bookmark.avatarUrl ?? existing?.avatarUrl,
      count: (existing?.count ?? 0) + 1,
    })
  }
  return [...groups.values()].sort((left, right) => right.count - left.count)
}

function AuthorGrid({authors}: {authors: AuthorGroup[]}) {
  if (authors.length === 0) return <EmptyState />
  return <div className="xbo:grid xbo:grid-cols-1 xbo:items-start xbo:gap-4 xbo:px-6 xbo:pb-16 xbo:sm:grid-cols-2 xbo:lg:grid-cols-4 xbo:xl:grid-cols-6">{authors.map((author) => <article className="xbo:flex xbo:items-center xbo:gap-3 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-4" key={author.username}><img className="xbo:size-8 xbo:shrink-0 xbo:rounded-full xbo:bg-neutral-800 xbo:object-cover" src={author.avatarUrl} alt="" /><div className="xbo:min-w-0"><b className="xbo:block xbo:truncate xbo:text-sm xbo:leading-5 xbo:text-white">@{author.username}</b><span className="xbo:mt-1 xbo:block xbo:truncate xbo:font-mono xbo:text-xs xbo:tracking-widest xbo:text-neutral-500">{author.count} bookmarks</span></div></article>)}</div>
}

function EmptyState() {
  return <div className="xbo:mx-auto xbo:my-16 xbo:grid xbo:max-w-md xbo:gap-4 xbo:rounded-lg xbo:bg-neutral-900 xbo:p-12 xbo:text-center xbo:text-neutral-500"><strong className="xbo:text-xl xbo:leading-7 xbo:text-white">No bookmarks here</strong><span>Save a post on X or change your search.</span></div>
}

function filterBookmarks(bookmarks: BookmarkPreview[], query: string, folderId: string, tag: string, mediaType: MediaType) {
  const normalizedQuery = query.trim().toLowerCase()
  return bookmarks.filter((bookmark) => {
    const matchesQuery = !normalizedQuery || `${bookmark.text} ${bookmark.author.name} ${bookmark.author.username}`.toLowerCase().includes(normalizedQuery)
    const matchesMedia = mediaType === 'all'
      || (mediaType === 'text' && !bookmark.media?.length)
      || bookmark.media?.some((media) => media.type === mediaType)
    return matchesQuery && matchesMedia && (folderId === 'all' || bookmark.folderIds.includes(folderId)) && (tag === 'all' || bookmark.tags.includes(tag))
  })
}

function sortBookmarks(bookmarks: BookmarkPreview[], sortMode: SortMode) {
  return [...bookmarks].sort((left, right) => {
    const leftValue = getSortTimestamp(left, sortMode) ?? 0
    const rightValue = getSortTimestamp(right, sortMode) ?? 0
    return rightValue - leftValue
  })
}

function getSortTimestamp(bookmark: BookmarkPreview, sortMode: SortMode) {
  if (sortMode === 'sync-desc') return bookmark.updatedAt || null
  return Date.parse(bookmark.postedAt ?? '') || null
}

function countMedia(bookmarks: BookmarkPreview[]) {
  const counts: Record<string, number> = {All: bookmarks.length, Images: 0, Videos: 0, 'Text only': 0}
  for (const bookmark of bookmarks) {
    if (!bookmark.media?.length) counts['Text only'] += 1
    for (const media of bookmark.media ?? []) counts[media.type === 'video' ? 'Videos' : 'Images'] += 1
  }
  return counts
}

function summaryFor(mode: ViewMode, bookmarkCount: number, authorCount: number) {
  if (mode === 'authors') return `${authorCount} authors · ${bookmarkCount} bookmarks`
  return `${bookmarkCount} bookmarks`
}

function formatDate(value: string | number) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'recently'
  return dateFormatter.format(timestamp)
}

function extractTweetId(value: string) {
  return value.trim().match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i)?.[1] ?? null
}
