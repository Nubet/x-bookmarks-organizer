import {createRoot} from 'react-dom/client'
import {memo, useDeferredValue, useMemo, useState, useEffect, useRef, useSyncExternalStore, useTransition, type FormEvent} from 'react'
import {sendRuntimeMessage} from '../shared/runtime'
import type {BookmarkPreview, LibrarySnapshot} from '../shared/types'
import {fetchBookmarkPage, mutateBookmark} from './page-bridge'
import {isBookmarksRoute} from './route'
import {countMedia, createSearchIndex, filterBookmarks, sortBookmarks, type MediaType, type SortMode} from '../domain/search/search-bookmarks'
import './bookmarks-view.css'

const ROOT_ID = 'bookmarks-organizer-root'
const REENABLE_ID = 'bookmarks-organizer-reenable'
const HIDDEN_ATTRIBUTE = 'data-bookmarks-organizer-hidden'
const WIDE_ATTRIBUTE = 'data-bookmarks-organizer-wide'
const INITIAL_RENDER_LIMIT = 100
const RENDER_PAGE_SIZE = 100
const monthFormatter = new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric'})
const dateFormatter = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric'})
interface LibraryState {
  snapshot: LibrarySnapshot | null
  loading: boolean
  error: string
}

type ViewMode = 'bookmarks' | 'authors'
function SortDropdown({ sortMode, setSortMode, startTransition }: { sortMode: SortMode, setSortMode: (mode: SortMode) => void, startTransition: React.TransitionStartFunction }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="xbo:relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="xbo:flex xbo:items-center xbo:justify-between xbo:gap-2 xbo:w-40 xbo:rounded-full xbo:border xbo:border-white/20 xbo:bg-neutral-900 xbo:px-4 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:transition-colors hover:xbo:border-white/40 xbo:cursor-pointer"
      >
        <span className="xbo:whitespace-nowrap">{sortMode === 'posted-desc' ? 'Tweet date ↓' : 'Sync date ↓'}</span>
        <svg className="xbo:h-4 xbo:w-4 xbo:opacity-50 xbo:flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="xbo:absolute xbo:right-0 xbo:top-full xbo:z-10 xbo:mt-1 xbo:w-40 xbo:overflow-hidden xbo:rounded-xl xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:shadow-xl">
          <button
            onClick={() => {
              startTransition(() => setSortMode('posted-desc'))
              setOpen(false)
            }}
            className={`xbo:block xbo:w-full xbo:px-4 xbo:py-2 xbo:text-left xbo:text-sm xbo:whitespace-nowrap xbo:transition-colors hover:xbo:bg-neutral-800 xbo:cursor-pointer ${sortMode === 'posted-desc' ? 'xbo:text-white xbo:font-medium' : 'xbo:text-neutral-400'}`}
          >
            Tweet date ↓
          </button>
          <button
            onClick={() => {
              startTransition(() => setSortMode('sync-desc'))
              setOpen(false)
            }}
            className={`xbo:block xbo:w-full xbo:px-4 xbo:py-2 xbo:text-left xbo:text-sm xbo:whitespace-nowrap xbo:transition-colors hover:xbo:bg-neutral-800 xbo:cursor-pointer ${sortMode === 'sync-desc' ? 'xbo:text-white xbo:font-medium' : 'xbo:text-neutral-400'}`}
          >
            Sync date ↓
          </button>
        </div>
      )}
    </div>
  )
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
  applyWideLayout(column)

  const root = createRoot(rootElement)
  root.render(<BookmarksView />)

  return (preserveLayout = false) => {
    root.unmount()
    restoreNativeColumn(column)
    if (!preserveLayout) restoreWideLayout()
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
    wrapper.className = 'xbo:font-sans xbo:sticky xbo:top-0 xbo:z-10 xbo:flex xbo:items-center xbo:justify-between xbo:border-b xbo:border-white/10 xbo:bg-neutral-950 xbo:px-4 xbo:py-3'
    
    const label = document.createElement('div')
    label.className = 'xbo:flex xbo:items-center xbo:gap-3'
    
    const iconUrl = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getURL('images/icon-512.png') : ''
    const iconHtml = iconUrl ? `<img src="${iconUrl}" class="xbo:h-6 xbo:w-6 xbo:rounded-md xbo:object-cover" alt="Icon" />` : '<span class="xbo:text-base">🔖</span>'
    
    label.innerHTML = `${iconHtml} <div class="xbo:flex xbo:items-baseline xbo:gap-2"><span class="xbo:font-medium xbo:text-white xbo:text-base">X Bookmarks Organizer</span> <span class="xbo:text-neutral-500 xbo:text-sm">is disabled</span></div>`
    wrapper.append(label)

    button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Enable'
    button.className = 'xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white xbo:bg-white xbo:px-4 xbo:py-2 xbo:text-sm xbo:font-medium xbo:text-black xbo:transition xbo:hover:opacity-90 xbo:disabled:opacity-60 xbo:disabled:cursor-wait'
    button.style.color = '#000'
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
  if (target) observer.observe(target, {
    attributes: true,
    attributeFilter: ['data-testid'],
    childList: true,
    subtree: true,
  })
  mount()

  return () => {
    observer.disconnect()
    document.getElementById(REENABLE_ID)?.remove()
    button = null
  }
}

export function watchBookmarksRoute() {
  let stopView: (preserveLayout?: boolean) => void = () => {}
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
    if (shouldMount && !findPrimaryColumn()) return

    stopView(shouldMount)
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
  if (target) observer.observe(target, {
    attributes: true,
    attributeFilter: ['data-testid'],
    childList: true,
    subtree: true,
  })
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

function removeBookmarkFromLibrary(tweetId: string) {
  if (!state.snapshot) return
  state = {
    ...state,
    snapshot: {
      ...state.snapshot,
      bookmarks: state.snapshot.bookmarks.filter((bookmark) => bookmark.tweetId !== tweetId),
    },
  }
  notify()
}

function findPrimaryColumn() {
  return document.querySelector<HTMLElement>('[data-testid="primaryColumn"]')
}

function findRouteObservationTarget() {
  return document.body
}

function hasRouteRelevantMutation(mutations: MutationRecord[]) {
  return mutations.some((mutation) =>
    (mutation.type === 'attributes'
      ? mutation.target instanceof Element && (
        mutation.target.matches('[data-testid="primaryColumn"]')
        || mutation.target.closest('[data-testid="primaryColumn"]') !== null
      )
      : [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
          if (!(node instanceof Element)) return false
          return node.id === ROOT_ID
            || node.querySelector(`#${ROOT_ID}`) !== null
            || node.matches('[data-testid="primaryColumn"]')
            || node.querySelector('[data-testid="primaryColumn"]') !== null
      }))
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
  const [addOpen, setAddOpen] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkRemoving, setBulkRemoving] = useState(false)
  const [integrationEnabled, setIntegrationEnabled] = useState(true)
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT)
  const [, startTransition] = useTransition()

  const bookmarks = snapshot?.bookmarks ?? []
  const deferredQuery = useDeferredValue(query)
  const searchIndex = useMemo(() => createSearchIndex(bookmarks), [bookmarks])
  const filteredBookmarks = useMemo(
    () => sortBookmarks(filterBookmarks(searchIndex, deferredQuery, folderId, tag, mediaType), sortMode),
    [deferredQuery, folderId, mediaType, searchIndex, sortMode, tag]
  )
  const authorGroups = useMemo(() => groupAuthors(filteredBookmarks), [filteredBookmarks])
  const mediaCounts = useMemo(() => countMedia(bookmarks), [bookmarks])
  const monthlyBookmarks = useMemo(
    () => groupBookmarksByMonth(filteredBookmarks.slice(0, renderLimit), sortMode),
    [filteredBookmarks, renderLimit, sortMode]
  )
  const visibleIds = useMemo(() => filteredBookmarks.map((bookmark) => bookmark.tweetId), [filteredBookmarks])
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length

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

      <div className="xbo:flex xbo:flex-col xbo:items-center xbo:gap-4 xbo:border-b xbo:border-white/10 xbo:p-6">
        <label className="xbo:block xbo:w-full xbo:max-w-md">
          <span className="xbo:absolute xbo:h-px xbo:w-px xbo:overflow-hidden xbo:[clip:rect(0,0,0,0)]">Search saved posts</span>
          <input
            className="xbo:box-border xbo:w-full xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-4 xbo:py-3 xbo:text-base xbo:text-white xbo:outline-none xbo:focus:border-white"
            type="search"
            placeholder="Search saved posts by keyword, author, tag or @username..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <MediaTypeFilter
          mediaCounts={mediaCounts}
          mediaType={mediaType}
          onMediaTypeChange={(value) => startTransition(() => setMediaType(value))}
        />
      </div>

      {addOpen && (
        <SaveForm
          saving={saving}
          onSubmit={(event) => void saveTweet(event)}
        />
      )}

      {mode === 'bookmarks' && (
        <BulkActions
          selectedCount={selectedVisibleCount}
          visibleCount={filteredBookmarks.length}
          removing={bulkRemoving}
          onSelectAll={() => setSelectedIds((current) => {
            const next = new Set(current)
            if (selectedVisibleCount === filteredBookmarks.length) {
              for (const id of visibleIds) next.delete(id)
            } else {
              for (const id of visibleIds) next.add(id)
            }
            return next
          })}
          onClear={() => setSelectedIds(new Set())}
          onRemove={() => void removeSelectedBookmarks()}
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
              <div className="xbo:flex xbo:items-center xbo:gap-3">
                <span className="xbo:font-mono xbo:text-xs xbo:uppercase xbo:tracking-widest xbo:text-neutral-500">Sort:</span>
                <SortDropdown sortMode={sortMode} setSortMode={setSortMode} startTransition={startTransition} />
              </div>
            )}
          </div>

          {mode === 'bookmarks' && filteredBookmarks.length === 0 && <EmptyState />}
          {mode === 'bookmarks' && monthlyBookmarks.map((group) => (
            <div key={group.key} className="xbo:mt-8 xbo:border-t xbo:border-white/10 xbo:pt-8 xbo:first:mt-0 xbo:first:border-t-0 xbo:first:pt-0">
              <h2 className="xbo:mb-5 xbo:px-6 xbo:text-xl xbo:font-bold xbo:tracking-tight">{group.label}</h2>
              <BookmarkGrid
                bookmarks={group.bookmarks}
                selectedIds={selectedIds}
                onToggle={(tweetId) => setSelectedIds((current) => {
                  const next = new Set(current)
                  if (next.has(tweetId)) next.delete(tweetId)
                  else next.add(tweetId)
                  return next
                })}
              />
            </div>
          ))}

          {mode === 'authors' && <AuthorGrid authors={authorGroups} />}
          {mode === 'bookmarks' && renderLimit < filteredBookmarks.length && (
            <div className="xbo:flex xbo:justify-center xbo:px-6 xbo:pb-16">
              <button
                className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-5 xbo:py-2 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800"
                type="button"
                onClick={() => setRenderLimit((current) => current + RENDER_PAGE_SIZE)}
              >
                Load more ({filteredBookmarks.length - renderLimit} remaining)
              </button>
            </div>
          )}
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

  async function removeSelectedBookmarks() {
    const selected = filteredBookmarks.filter((bookmark) => selectedIds.has(bookmark.tweetId))
    if (selected.length === 0 || !window.confirm(`Remove ${selected.length} selected bookmark${selected.length === 1 ? '' : 's'}?`)) return

    setBulkRemoving(true)
    setActionMessage('')
    setActionError('')
    let removed = 0

    try {
      for (const bookmark of selected) {
        await mutateBookmark('DELETE_BOOKMARK', bookmark.tweetId)
        const response = await sendRuntimeMessage({type: 'BOOKMARK_DELETE', tweetId: bookmark.tweetId})
        if (!response.ok) throw new Error(response.error)
        removeBookmarkFromLibrary(bookmark.tweetId)
        removed += 1
      }
      setSelectedIds(new Set())
      setActionMessage(`${removed} bookmark${removed === 1 ? '' : 's'} removed.`)
    } catch (reason) {
      setActionError(`${removed} removed. ${reason instanceof Error ? reason.message : 'Could not remove the selected bookmarks.'}`)
      if (removed > 0) {
        setSelectedIds((current) => {
          const next = new Set(current)
          for (const bookmark of selected.slice(0, removed)) next.delete(bookmark.tweetId)
          return next
        })
      }
    } finally {
      setBulkRemoving(false)
    }
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

function MediaTypeFilter({
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
    ['link', 'Links'],
    ['text', 'Text only'],
  ]

  return (
    <div className="xbo:flex xbo:flex-wrap xbo:justify-center xbo:gap-2">
      {mediaOptions.map(([value, label]) => (
        <button
          key={value}
          className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:transition xbo:hover:bg-neutral-800 xbo:data-[selected=true]:border-white xbo:data-[selected=true]:bg-neutral-800 xbo:data-[selected=true]:text-white"
          data-selected={mediaType === value}
          aria-pressed={mediaType === value}
          type="button"
          onClick={() => onMediaTypeChange(value)}
        >
          {label} <b>{value === 'all' ? mediaCounts.All : mediaCounts[label] ?? 0}</b>
        </button>
      ))}
    </div>
  )
}

function BulkActions({
  selectedCount,
  visibleCount,
  removing,
  onSelectAll,
  onClear,
  onRemove,
}: {
  selectedCount: number
  visibleCount: number
  removing: boolean
  onSelectAll: () => void
  onClear: () => void
  onRemove: () => void
}) {
  return (
    <div className="xbo:mx-6 xbo:mt-4 xbo:flex xbo:flex-wrap xbo:items-center xbo:gap-3 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-4 xbo:py-3">
      <button
        className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:disabled:cursor-not-allowed xbo:disabled:opacity-50"
        type="button"
        onClick={onSelectAll}
        disabled={visibleCount === 0 || removing}
      >
        {selectedCount === visibleCount && visibleCount > 0 ? 'Deselect visible' : 'Select visible'}
      </button>
      <span className="xbo:font-mono xbo:text-xs xbo:uppercase xbo:tracking-widest xbo:text-neutral-500">{selectedCount} selected</span>
      {selectedCount > 0 && (
        <>
          <button
            className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:disabled:cursor-wait xbo:disabled:opacity-50"
            type="button"
            onClick={onClear}
            disabled={removing}
          >
            Clear
          </button>
          <button
            className="xbo:ml-auto xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-red-300/50 xbo:bg-red-950/40 xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-red-100 xbo:hover:bg-red-900/60 xbo:disabled:cursor-wait xbo:disabled:opacity-50"
            type="button"
            onClick={onRemove}
            disabled={removing}
          >
            {removing ? 'Removing...' : 'Remove selected'}
          </button>
        </>
      )}
    </div>
  )
}

function BookmarkGrid({
  bookmarks,
  selectedIds,
  onToggle,
}: {
  bookmarks: BookmarkPreview[]
  selectedIds: Set<string>
  onToggle: (tweetId: string) => void
}) {
  if (bookmarks.length === 0) return <EmptyState />

  return <div className="xbo:columns-1 xbo:gap-6 xbo:px-6 xbo:pb-16 xbo:sm:columns-2 xbo:lg:columns-3 xbo:xl:columns-4">{bookmarks.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} selected={selectedIds.has(bookmark.tweetId)} onToggle={onToggle} />)}</div>
}

const BookmarkCard = memo(function BookmarkCard({bookmark, selected, onToggle}: {bookmark: BookmarkPreview; selected: boolean; onToggle: (tweetId: string) => void}) {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  const remove = () => {
    setRemoving(true)
    setError('')
    void mutateBookmark('DELETE_BOOKMARK', bookmark.tweetId)
      .then(() => sendRuntimeMessage({type: 'BOOKMARK_DELETE', tweetId: bookmark.tweetId}))
      .then((response) => {
        if (!response.ok) throw new Error(response.error)
        removeBookmarkFromLibrary(bookmark.tweetId)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not remove bookmark.'))
      .finally(() => setRemoving(false))
  }

  return (
    <article className={`xbo:mb-6 xbo:break-inside-avoid xbo:overflow-hidden xbo:rounded-lg xbo:border xbo:bg-neutral-900 xbo:p-6 ${selected ? 'xbo:border-white/60' : 'xbo:border-white/10'}`}>
      <div className="xbo:flex xbo:items-center xbo:gap-3 xbo:text-sm xbo:leading-5 xbo:text-neutral-500">
        <img className="xbo:size-8 xbo:shrink-0 xbo:rounded-full xbo:bg-neutral-800 xbo:object-cover" src={bookmark.avatarUrl} alt="" />
        <span className="xbo:min-w-0 xbo:flex-1"><b>{bookmark.author.name}</b> @{bookmark.author.username} · {formatDate(bookmark.postedAt ?? bookmark.updatedAt)}</span>
        <input
          className="xbo:ml-auto xbo:size-4 xbo:shrink-0 xbo:accent-white"
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(bookmark.tweetId)}
          aria-label={`Select post by @${bookmark.author.username}`}
        />
      </div>
      <p className="xbo:my-4 xbo:whitespace-pre-wrap xbo:text-base xbo:leading-6 xbo:text-white">{bookmark.text || 'No text available'}</p>
      {bookmark.media?.[0] && <MediaPreview media={bookmark.media[0]} />}
      <div className="xbo:mt-6 xbo:flex xbo:items-center xbo:justify-between xbo:gap-3 xbo:border-t xbo:border-white/10 xbo:pt-4">
        <a className="xbo:rounded-full xbo:border xbo:border-white/25 xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:no-underline xbo:hover:bg-neutral-800" href={`https://x.com/${bookmark.author.username}/status/${bookmark.tweetId}`} target="_blank" rel="noreferrer">Open ↗</a>
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
