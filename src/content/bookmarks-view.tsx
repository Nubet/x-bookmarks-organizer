import {createRoot} from 'react-dom/client'
import {useDeferredValue, useMemo, useState, useEffect, useRef, useSyncExternalStore, useTransition, type FormEvent} from 'react'
import {sendRuntimeMessage} from '../shared/runtime'
import type {BookmarkPreview, BookmarkSearchQuery, FolderSummary, LibraryPage, LibrarySnapshot} from '../shared/types'
import {fetchBookmarkPage, mutateBookmark} from './page-bridge'
import {isBookmarksRoute} from './route'
import {readAccountId, requireAccountId} from './account-session'
import {countMedia, createSearchIndex, filterBookmarks, getSortTimestamp, sortBookmarks, type MediaType, type SortMode} from '../domain/search/search-bookmarks'
import {createBookmarkActions} from '../application/bookmarks/bookmark-actions'
import {createFolderActions} from '../application/folders/folder-actions'
import {BookmarkGrid, EmptyState} from './components/bookmark-grid'
import {BulkActions} from './components/bulk-actions'
import {FolderActionDialog, type FolderActionMode} from './components/folder-action-dialog'
import {FolderFilter} from './components/folder-filter'
import {MediaTypeFilter} from './components/media-type-filter'
import {SaveForm} from './components/save-form'
import './bookmarks-view.css'

const ROOT_ID = 'bookmarks-organizer-root'
const REENABLE_ID = 'bookmarks-organizer-reenable'
const HIDDEN_ATTRIBUTE = 'data-bookmarks-organizer-hidden'
const WIDE_ATTRIBUTE = 'data-bookmarks-organizer-wide'
const INITIAL_RENDER_LIMIT = 100
const RENDER_PAGE_SIZE = 100
const LIBRARY_PAGE_SIZE = 100
const monthFormatter = new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric'})
interface LibraryState {
  snapshot: LibrarySnapshot | null
  folderSummaries: FolderSummary[]
  loading: boolean
  loadingMore: boolean
  error: string
  nextOffset: number | null
  activeQuery: BookmarkSearchQuery | null
}

type ViewMode = 'bookmarks' | 'authors'
type AuthorSortMode = 'count-desc' | 'count-asc'
function SortDropdown({ sortMode, setSortMode, startTransition, mode }: { sortMode: SortMode | AuthorSortMode, setSortMode: (mode: SortMode | AuthorSortMode) => void, startTransition: React.TransitionStartFunction, mode: ViewMode }) {
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
         <span className="xbo:whitespace-nowrap">{mode === 'authors' ? (sortMode === 'count-asc' ? 'Bookmarks ↑' : 'Bookmarks ↓') : (sortMode === 'posted-desc' ? 'Tweet date ↓' : 'Sync date ↓')}</span>
        <svg className="xbo:h-4 xbo:w-4 xbo:opacity-50 xbo:flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="xbo:absolute xbo:right-0 xbo:top-full xbo:z-10 xbo:mt-1 xbo:w-40 xbo:overflow-hidden xbo:rounded-xl xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:shadow-xl">
          {mode === 'authors' ? <>
            <button
              onClick={() => {
                startTransition(() => setSortMode('count-desc'))
                setOpen(false)
              }}
              className={`xbo:block xbo:w-full xbo:px-4 xbo:py-2 xbo:text-left xbo:text-sm xbo:whitespace-nowrap xbo:transition-colors hover:xbo:bg-neutral-800 xbo:cursor-pointer ${sortMode === 'count-desc' ? 'xbo:text-white xbo:font-medium' : 'xbo:text-neutral-400'}`}
            >
              Bookmarks ↓
            </button>
            <button
              onClick={() => {
                startTransition(() => setSortMode('count-asc'))
                setOpen(false)
              }}
              className={`xbo:block xbo:w-full xbo:px-4 xbo:py-2 xbo:text-left xbo:text-sm xbo:whitespace-nowrap xbo:transition-colors hover:xbo:bg-neutral-800 xbo:cursor-pointer ${sortMode === 'count-asc' ? 'xbo:text-white xbo:font-medium' : 'xbo:text-neutral-400'}`}
            >
              Bookmarks ↑
            </button>
          </> : <>
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
          </>}
        </div>
      )}
    </div>
  )
}

function ActionToast({message, error, onClose}: {message: string; error: string; onClose: () => void}) {
  const text = error || message
  if (!text) return null

  return (
    <div className={`xbo:fixed xbo:right-6 xbo:top-6 xbo:z-[60] xbo:flex xbo:max-w-sm xbo:items-start xbo:gap-3 xbo:rounded-xl xbo:border xbo:px-4 xbo:py-3 xbo:shadow-2xl ${error ? 'xbo:border-red-400/40 xbo:bg-red-950 xbo:text-red-100' : 'xbo:border-emerald-400/40 xbo:bg-emerald-950 xbo:text-emerald-100'}`} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
      <span className="xbo:flex-1 xbo:text-sm">{text}</span>
      <button className="xbo:cursor-pointer xbo:text-lg xbo:leading-none xbo:opacity-70 xbo:hover:opacity-100" type="button" onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  )
}

let state: LibraryState = {folderSummaries: [], snapshot: null, loading: false, loadingMore: false, error: '', nextOffset: null, activeQuery: null}
let loaded = false
let searchRequest = 0
const listeners = new Set<() => void>()
const bookmarkActions = createBookmarkActions({
  getAccountId: requireAccountId,
  deleteRemote: async (tweetId) => {
    await mutateBookmark('DELETE_BOOKMARK', tweetId)
  },
  deleteLocal: async (tweetId, accountId) => {
    const response = await sendRuntimeMessage({type: 'BOOKMARK_DELETE', accountId, tweetId})
    if (!response.ok) throw new Error(response.error)
  },
})
const folderActions = createFolderActions({
  getFolders: async () => {
    const response = await sendRuntimeMessage<FolderSummary[]>({type: 'FOLDERS_GET', accountId: requireAccountId()})
    if (!response.ok) throw new Error(response.error)
    return response.data
  },
  createFolder: async (name) => {
    const response = await sendRuntimeMessage<FolderSummary>({type: 'FOLDER_CREATE', accountId: requireAccountId(), name})
    if (!response.ok) throw new Error(response.error)
    return response.data
  },
  addBookmarksToFolders: async (bookmarkIds, folderIds) => {
    const response = await sendRuntimeMessage<BookmarkPreview[]>({type: 'BOOKMARKS_ADD_TO_FOLDERS', accountId: requireAccountId(), bookmarkIds, folderIds})
    if (!response.ok) throw new Error(response.error)
    return response.data
  },
  removeBookmarksFromFolders: async (bookmarkIds, folderIds) => {
    const response = await sendRuntimeMessage<BookmarkPreview[]>({type: 'BOOKMARKS_REMOVE_FROM_FOLDERS', accountId: requireAccountId(), bookmarkIds, folderIds})
    if (!response.ok) throw new Error(response.error)
    return response.data
  },
})

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!loaded) {
    loaded = true
    void loadLibrary()
    void loadFolderSummaries()
  }
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

async function loadLibrary() {
  const requestId = ++searchRequest
  const accountId = requireAccountId()
  state = {folderSummaries: state.folderSummaries, snapshot: null, loading: true, loadingMore: false, error: '', nextOffset: null, activeQuery: null}
  notify()

  const response = await sendRuntimeMessage<LibraryPage>({type: 'LIBRARY_GET_PAGE', accountId, offset: 0, limit: LIBRARY_PAGE_SIZE})
  if (requestId !== searchRequest || readAccountId() !== accountId) return
  state = response.ok
    ? {
        folderSummaries: state.folderSummaries,
        snapshot: {bookmarks: response.data.bookmarks, folders: [], tags: []},
        loading: false,
        loadingMore: false,
        error: '',
        nextOffset: response.data.nextOffset,
        activeQuery: null,
      }
    : {folderSummaries: state.folderSummaries, snapshot: null, loading: false, loadingMore: false, error: response.error, nextOffset: null, activeQuery: null}
  notify()
}

async function loadFolderSummaries() {
  const accountId = requireAccountId()
  try {
    const folders = await folderActions.getFolders()
    if (readAccountId() !== accountId) return
    state = {...state, folderSummaries: folders}
    notify()
  } catch (reason) {
    state = {...state, error: reason instanceof Error ? reason.message : 'Could not load folders.'}
    notify()
  }
}

async function searchLibrary(search: BookmarkSearchQuery) {
  const requestId = ++searchRequest
  state = {...state, loading: true, loadingMore: false, error: '', nextOffset: null, activeQuery: search}
  notify()

  const response = await sendRuntimeMessage<LibraryPage>({type: 'LIBRARY_SEARCH_PAGE', accountId: requireAccountId(), offset: 0, limit: LIBRARY_PAGE_SIZE, search})
  if (requestId !== searchRequest) return

  state = response.ok
    ? {
        folderSummaries: state.folderSummaries,
        snapshot: {bookmarks: response.data.bookmarks, folders: state.snapshot?.folders ?? [], tags: state.snapshot?.tags ?? []},
        loading: false,
        loadingMore: false,
        error: '',
        nextOffset: response.data.nextOffset,
        activeQuery: search,
      }
    : {...state, loading: false, loadingMore: false, error: response.error}
  notify()
}

async function loadMoreLibrary(searchOverride?: BookmarkSearchQuery) {
  if (state.loading || state.loadingMore || state.nextOffset === null) return false

  const offset = state.nextOffset
  const search = searchOverride ?? state.activeQuery
  const accountId = requireAccountId()
  state = {...state, loadingMore: true, error: ''}
  notify()

  const response = search
    ? await sendRuntimeMessage<LibraryPage>({type: 'LIBRARY_SEARCH_PAGE', accountId, offset, limit: LIBRARY_PAGE_SIZE, search})
    : await sendRuntimeMessage<LibraryPage>({type: 'LIBRARY_GET_PAGE', accountId, offset, limit: LIBRARY_PAGE_SIZE})

  if (readAccountId() !== accountId) return false

  if (!response.ok) {
    state = {...state, loadingMore: false, error: response.error}
    notify()
    return false
  }

  state = {
    ...state,
    loadingMore: false,
    error: '',
    nextOffset: response.data.nextOffset,
    snapshot: state.snapshot
      ? {...state.snapshot, bookmarks: [...state.snapshot.bookmarks, ...response.data.bookmarks]}
      : state.snapshot,
  }
  notify()
  return true
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

export function resetBookmarksView() {
  loaded = false
  searchRequest += 1
  state = {folderSummaries: [], snapshot: null, loading: false, loadingMore: false, error: '', nextOffset: null, activeQuery: null}
  notify()
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
  const {snapshot, folderSummaries, loading, loadingMore, error, nextOffset, activeQuery} = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [mode, setMode] = useState<ViewMode>('bookmarks')
  const [query, setQuery] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [folderId, setFolderId] = useState('all')
  const tag = 'all'
  const [mediaType, setMediaType] = useState<MediaType>('all')
  const [sortMode, setSortMode] = useState<SortMode>('posted-desc')
  const [authorSortMode, setAuthorSortMode] = useState<AuthorSortMode>('count-desc')
  const [addOpen, setAddOpen] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkRemoving, setBulkRemoving] = useState(false)
  const [folderActionMode, setFolderActionMode] = useState<FolderActionMode | null>(null)
  const [updatingFolders, setUpdatingFolders] = useState(false)
  const [integrationEnabled, setIntegrationEnabled] = useState(true)
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT)
  const [, startTransition] = useTransition()

  const bookmarks = snapshot?.bookmarks ?? []
  const deferredQuery = useDeferredValue(query)
  const searchIndex = useMemo(() => createSearchIndex(bookmarks), [bookmarks])
  const searchMatches = useMemo(
    () => filterBookmarks(searchIndex, deferredQuery, folderId, tag, 'all', authorFilter),
    [authorFilter, deferredQuery, folderId, searchIndex, tag]
  )
  const filteredBookmarks = useMemo(
    () => sortBookmarks(filterBookmarks(searchIndex, deferredQuery, folderId, tag, mediaType, authorFilter), sortMode),
    [authorFilter, deferredQuery, folderId, mediaType, searchIndex, sortMode, tag]
  )
  const authorGroups = useMemo(() => sortAuthors(groupAuthors(filteredBookmarks), authorSortMode), [authorSortMode, filteredBookmarks])
  const mediaCounts = useMemo(() => countMedia(searchMatches), [searchMatches])
  const monthlyBookmarks = useMemo(
    () => groupBookmarksByMonth(filteredBookmarks.slice(0, renderLimit), sortMode),
    [filteredBookmarks, renderLimit, sortMode]
  )
  const visibleIds = useMemo(() => filteredBookmarks.map((bookmark) => bookmark.tweetId), [filteredBookmarks])
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length
  const selectedBookmarks = useMemo(
    () => filteredBookmarks.filter((bookmark) => selectedIds.has(bookmark.tweetId)),
    [filteredBookmarks, selectedIds]
  )
  const selectedCountByFolder = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const bookmark of selectedBookmarks) {
      for (const id of bookmark.folderIds) counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  }, [selectedBookmarks])

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

        <div className="xbo:ml-auto xbo:flex xbo:items-center xbo:gap-2 xbo:justify-self-end">
          <button
            className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:transition xbo:hover:bg-neutral-800 xbo:disabled:cursor-wait xbo:disabled:opacity-60"
            type="button"
            disabled={syncing}
            onClick={() => void startSync()}
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button className="xbo:grid xbo:size-10 xbo:cursor-pointer xbo:place-items-center xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:text-xl xbo:text-white xbo:hover:bg-neutral-800" type="button" onClick={() => setAddOpen((open) => !open)} aria-label="Save a post">+</button>
        </div>
      </header>

      <div className="xbo:flex xbo:flex-col xbo:items-center xbo:gap-4 xbo:border-b xbo:border-white/10 xbo:p-6">


        <label className="xbo:block xbo:w-full xbo:max-w-md">
          <span className="xbo:absolute xbo:h-px xbo:w-px xbo:overflow-hidden xbo:[clip:rect(0,0,0,0)]">Search saved posts</span>
          <input
            className="xbo:box-border xbo:w-full xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-4 xbo:py-3 xbo:text-base xbo:text-white xbo:outline-none xbo:focus:border-white"
            type="search"
            placeholder="Search saved posts... Press Enter to search the full library"
            value={query}
            onChange={(event) => {
              const value = event.target.value
              setQuery(value)
                if (!value.trim() && activeQuery) void searchLibrary({query: '', authorUsername: authorFilter, folderId, tag, mediaType, sortMode})
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
               void searchLibrary({query, authorUsername: authorFilter, folderId, tag, mediaType, sortMode})
            }}
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
          onClose={() => setAddOpen(false)}
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
          showRemoveFromFolder={folderId !== 'all'}
          onClear={() => setSelectedIds(new Set())}
           onRemove={() => void removeSelectedBookmarks()}
           onAddToFolder={() => {
             setActionError('')
             setFolderActionMode('add')
           }}
           onRemoveFromFolder={() => {
             setActionError('')
             setFolderActionMode('remove')
           }}
           updatingFolders={updatingFolders}
         />
       )}

       {folderActionMode && (
         <FolderActionDialog
           mode={folderActionMode}
           folders={folderSummaries}
           selectedCount={selectedBookmarks.length}
           selectedCountByFolder={selectedCountByFolder}
           busy={updatingFolders}
           onClose={() => setFolderActionMode(null)}
           onSubmit={handleFolderAction}
           onCreateFolder={handleCreateFolder}
         />
       )}

       <ActionToast
         message={actionMessage}
         error={actionError}
         onClose={() => {
           setActionMessage('')
           setActionError('')
         }}
       />
       {loading && <p className="xbo:m-6 xbo:text-center xbo:text-neutral-500">Loading bookmarks...</p>}
      {error && <p className="xbo:m-6 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-2 xbo:text-center xbo:text-white">{error}</p>}

      {!loading && snapshot && (
        <>
            <div className="xbo:my-6 xbo:flex xbo:flex-wrap xbo:items-center xbo:justify-between xbo:gap-4 xbo:px-6">
              <div className="xbo:flex xbo:flex-wrap xbo:items-center xbo:gap-2 xbo:font-mono xbo:text-xs xbo:uppercase xbo:tracking-widest xbo:text-neutral-500">
                <span>{summaryFor(mode, filteredBookmarks.length, authorGroups.length)}</span>
                {authorFilter && (
                  <button
                    className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/20 xbo:px-3 xbo:py-1 xbo:text-xs xbo:normal-case xbo:tracking-normal xbo:text-white xbo:transition-colors"
                    data-author-filter="true"
                    type="button"
                    onClick={() => {
                      setAuthorFilter('')
                      setSelectedIds(new Set())
                      void searchLibrary({query, authorUsername: '', folderId, tag, mediaType, sortMode})
                    }}
                  >
                    Author: @{authorFilter} ×
                  </button>
                )}
              </div>
             <div className="xbo:flex xbo:flex-wrap xbo:items-center xbo:gap-2">
               {(['bookmarks', 'authors'] as const).map((item) => (
                 <button
                   key={item}
                   className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-4 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:transition xbo:hover:bg-neutral-800 xbo:data-[active=true]:border-white xbo:data-[active=true]:bg-neutral-800 xbo:data-[active=true]:text-white"
                   data-active={mode === item}
                   type="button"
                   onClick={() => {
                     setMode(item)
                     if (item === 'authors') {
                       setAuthorFilter('')
                       setSelectedIds(new Set())
                       void searchLibrary({query, folderId, tag, mediaType, sortMode})
                     }
                   }}
                 >
                   {item === 'bookmarks' ? 'List' : 'By author'}
                 </button>
               ))}
               <FolderFilter
                 folderId={folderId}
                 folders={folderSummaries}
                 disabled={loading || loadingMore}
                 onChange={(nextFolderId) => {
                   setFolderId(nextFolderId)
                   setSelectedIds(new Set())
                   setRenderLimit(INITIAL_RENDER_LIMIT)
                   setActionMessage('')
                    void searchLibrary({query, authorUsername: authorFilter, folderId: nextFolderId, tag, mediaType, sortMode})
                 }}
               />
                {mode === 'bookmarks'
                  ? <SortDropdown mode="bookmarks" sortMode={sortMode} setSortMode={(next) => setSortMode(next as SortMode)} startTransition={startTransition} />
                  : <SortDropdown mode="authors" sortMode={authorSortMode} setSortMode={(next) => setAuthorSortMode(next as AuthorSortMode)} startTransition={startTransition} />}
             </div>
           </div>

          {mode === 'bookmarks' && filteredBookmarks.length === 0 && <EmptyState />}
          {mode === 'bookmarks' && monthlyBookmarks.map((group) => (
            <div key={group.key} className="xbo:mt-8 xbo:border-t xbo:border-white/10 xbo:pt-8 xbo:first:mt-0 xbo:first:border-t-0 xbo:first:pt-0">
              <h2 className="xbo:mb-5 xbo:px-6 xbo:text-xl xbo:font-bold xbo:tracking-tight">{group.label}</h2>
              <BookmarkGrid
                bookmarks={group.bookmarks}
                selectedIds={selectedIds}
                onRemove={removeSingleBookmark}
                onToggle={(tweetId) => setSelectedIds((current) => {
                  const next = new Set(current)
                  if (next.has(tweetId)) next.delete(tweetId)
                  else next.add(tweetId)
                  return next
                })}
              />
            </div>
          ))}

           {mode === 'authors' && (
             <AuthorGrid
               authors={authorGroups}
               onViewBookmarks={(username) => {
                 setMode('bookmarks')
                 setAuthorFilter(username)
                 setQuery('')
                 setSelectedIds(new Set())
                 setRenderLimit(INITIAL_RENDER_LIMIT)
                 void searchLibrary({query: '', authorUsername: username, folderId, tag, mediaType, sortMode})
               }}
             />
           )}
          {mode === 'bookmarks' && (renderLimit < filteredBookmarks.length || nextOffset !== null) && (
            <div className="xbo:flex xbo:justify-center xbo:px-6 xbo:pb-16">
              <button
                className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-5 xbo:py-2 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800"
                type="button"
                disabled={loadingMore}
                onClick={() => {
                  if (renderLimit < filteredBookmarks.length) {
                    setRenderLimit((current) => current + RENDER_PAGE_SIZE)
                    return
                  }

                  void handleLoadMore()
                }}
              >
                {loadingMore ? 'Loading...' : `Load more (${nextOffset === null ? filteredBookmarks.length - renderLimit : 'more'} remaining)`}
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

      const response = await sendRuntimeMessage({type: 'BOOKMARKS_SYNC', accountId: requireAccountId(), bookmarks: [bookmark]})
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

  async function startSync() {
    setSyncing(true)
    setActionMessage('')
    setActionError('')

    try {
      const response = await sendRuntimeMessage<{status: string}>({type: 'SYNC_START'})
      if (!response.ok) throw new Error(response.error)

      refreshBookmarksView()
      setActionMessage(response.data.status)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleLoadMore() {
    try {
       const loaded = await loadMoreLibrary(activeQuery ? {query, authorUsername: authorFilter, folderId, tag, mediaType, sortMode} : undefined)
      if (loaded) setRenderLimit((current) => current + RENDER_PAGE_SIZE)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not load more bookmarks.')
    }
  }

  async function handleCreateFolder(name: string) {
    const folder = await folderActions.createFolder(name)
    state = {
      ...state,
      folderSummaries: [...state.folderSummaries, folder].sort((left, right) => left.name.localeCompare(right.name)),
    }
    notify()
    return folder
  }

  async function handleFolderAction(folderIds: string[]) {
    if (!folderActionMode || selectedBookmarks.length === 0) return

    setUpdatingFolders(true)
    setActionError('')
    try {
      const bookmarkIds = selectedBookmarks.map((bookmark) => bookmark.tweetId)
      const updated = folderActionMode === 'add'
        ? await folderActions.addBookmarksToFolders(bookmarkIds, folderIds)
        : await folderActions.removeBookmarksFromFolders(bookmarkIds, folderIds)
      const updatedById = new Map(updated.map((bookmark) => [bookmark.tweetId, bookmark]))
      if (state.snapshot) {
        state = {
          ...state,
          snapshot: {
            ...state.snapshot,
            bookmarks: state.snapshot.bookmarks.map((bookmark) => updatedById.get(bookmark.tweetId) ?? bookmark),
          },
        }
        notify()
      }
      await loadFolderSummaries()
      setSelectedIds(new Set())
      setFolderActionMode(null)
      setActionMessage(folderActionMode === 'add' ? 'Bookmarks added to folder.' : 'Bookmarks removed from folder.')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not update folders.')
    } finally {
      setUpdatingFolders(false)
    }
  }

  async function removeSingleBookmark(tweetId: string) {
    await bookmarkActions.deleteBookmark(tweetId)
    removeBookmarkFromLibrary(tweetId)
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(tweetId)
      return next
    })
  }

  async function removeSelectedBookmarks() {
    const selected = filteredBookmarks.filter((bookmark) => selectedIds.has(bookmark.tweetId))
    if (selected.length === 0 || !window.confirm(`Remove ${selected.length} selected bookmark${selected.length === 1 ? '' : 's'}?`)) return

    setBulkRemoving(true)
    setActionMessage('')
    setActionError('')
    let removed = 0

    try {
      const tweetIds = selected.map((bookmark) => bookmark.tweetId)
      await bookmarkActions.deleteBookmarks(tweetIds, (count) => {
        removed = count
        removeBookmarkFromLibrary(tweetIds[count - 1])
      })
      removed = selected.length
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

function sortAuthors(authors: AuthorGroup[], sortMode: AuthorSortMode) {
  return [...authors].sort((left, right) => {
    const countDifference = sortMode === 'count-desc' ? right.count - left.count : left.count - right.count
    return countDifference || left.username.localeCompare(right.username)
  })
}

function AuthorGrid({authors, onViewBookmarks}: {authors: AuthorGroup[]; onViewBookmarks: (username: string) => void}) {
  if (authors.length === 0) return <EmptyState />
  return (
    <div className="xbo:grid xbo:grid-cols-1 xbo:items-start xbo:gap-4 xbo:px-6 xbo:pb-16 xbo:sm:grid-cols-2 xbo:lg:grid-cols-4 xbo:xl:grid-cols-6">
      {authors.map((author) => (
        <button
          key={author.username}
          className="xbo:group xbo:flex xbo:w-full xbo:cursor-pointer xbo:items-center xbo:gap-4 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-4 xbo:text-left xbo:transition-all xbo:hover:border-white/20 xbo:hover:bg-neutral-800"
          type="button"
          onClick={() => onViewBookmarks(author.username)}
        >
          <img className="xbo:size-10 xbo:shrink-0 xbo:rounded-full xbo:bg-neutral-800 xbo:object-cover" src={author.avatarUrl} alt="" />
          <div className="xbo:min-w-0 xbo:flex-1">
            <b className="xbo:block xbo:truncate xbo:text-sm xbo:leading-5 xbo:text-white xbo:group-hover:text-blue-400 xbo:transition-colors">@{author.username}</b>
            <span className="xbo:mt-1 xbo:block xbo:truncate xbo:font-mono xbo:text-xs xbo:tracking-widest xbo:text-neutral-500">{author.count} bookmarks</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function summaryFor(mode: ViewMode, bookmarkCount: number, authorCount: number) {
  if (mode === 'authors') return `${authorCount} authors · ${bookmarkCount} bookmarks`
  return `${bookmarkCount} bookmarks`
}

function extractTweetId(value: string) {
  return value.trim().match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i)?.[1] ?? null
}
