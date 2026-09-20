import {useState} from 'react'
import type {FolderSummary} from '../../shared/types'

export type FolderActionMode = 'add' | 'remove'

export function FolderActionDialog({
  mode,
  folders,
  selectedCount,
  selectedCountByFolder,
  busy,
  onClose,
  onSubmit,
  onCreateFolder,
}: {
  mode: FolderActionMode
  folders: FolderSummary[]
  selectedCount: number
  selectedCountByFolder: Record<string, number>
  busy: boolean
  onClose: () => void
  onSubmit: (folderIds: string[]) => Promise<void>
  onCreateFolder: (name: string) => Promise<FolderSummary>
}) {
  const [query, setQuery] = useState('')
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(() => new Set())
  const [newFolderName, setNewFolderName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [availableFolders, setAvailableFolders] = useState(folders)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleFolders = availableFolders.filter((folder) => {
    if (mode === 'remove' && (selectedCountByFolder[folder.id] ?? 0) === 0) return false
    return folder.name.toLocaleLowerCase().includes(normalizedQuery)
  })

  function toggleFolder(folderId: string) {
    setSelectedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const folder = await onCreateFolder(newFolderName)
      setAvailableFolders((current) => [...current, folder].sort((left, right) => left.name.localeCompare(right.name)))
      setSelectedFolderIds((current) => new Set(current).add(folder.id))
      setNewFolderName('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create folder.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="xbo:fixed xbo:inset-0 xbo:z-50 xbo:grid xbo:place-items-center xbo:bg-black/70 xbo:p-4" role="presentation">
      <div className="xbo:flex xbo:max-h-[min(680px,calc(100vh-2rem))] xbo:w-full xbo:max-w-lg xbo:flex-col xbo:rounded-xl xbo:border xbo:border-white/15 xbo:bg-neutral-950 xbo:shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="xbo-folder-dialog-title">
        <header className="xbo:flex xbo:items-start xbo:justify-between xbo:gap-4 xbo:border-b xbo:border-white/10 xbo:p-5">
          <div>
            <h2 id="xbo-folder-dialog-title" className="xbo:m-0 xbo:text-xl xbo:font-bold">{mode === 'add' ? 'Add to folder' : 'Remove from folder'}</h2>
            <p className="xbo:mt-1 xbo:text-sm xbo:text-neutral-500">{selectedCount} selected bookmark{selectedCount === 1 ? '' : 's'}</p>
          </div>
          <button className="xbo:grid xbo:size-8 xbo:cursor-pointer xbo:place-items-center xbo:rounded-full xbo:text-xl xbo:text-neutral-400 xbo:hover:bg-neutral-800 xbo:hover:text-white" type="button" onClick={onClose} aria-label="Close folder dialog">×</button>
        </header>

        <div className="xbo:overflow-y-auto xbo:p-5">
          {mode === 'add' && (
            <form className="xbo:mb-4 xbo:flex xbo:gap-2" onSubmit={createFolder}>
              <input
                className="xbo:min-w-0 xbo:flex-1 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-3 xbo:py-2 xbo:text-sm xbo:text-white xbo:outline-none xbo:focus:border-white"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="New folder name"
                maxLength={80}
                aria-label="New folder name"
              />
              <button className="xbo:cursor-pointer xbo:rounded-lg xbo:border xbo:border-white/25 xbo:px-3 xbo:py-2 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:disabled:cursor-not-allowed xbo:disabled:opacity-50" type="submit" disabled={creating || !newFolderName.trim()}>{creating ? 'Creating...' : 'Create'}</button>
            </form>
          )}

          <input
            className="xbo:mb-3 xbo:box-border xbo:w-full xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-3 xbo:py-2 xbo:text-sm xbo:text-white xbo:outline-none xbo:focus:border-white"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search folders..."
            aria-label="Search folders"
          />

          <div className="xbo:grid xbo:gap-2">
            {visibleFolders.map((folder) => {
              const selectedInFolder = selectedCountByFolder[folder.id] ?? 0
              return (
                <label key={folder.id} className="xbo:flex xbo:cursor-pointer xbo:items-center xbo:gap-3 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-3 xbo:hover:border-white/30">
                  <input type="checkbox" checked={selectedFolderIds.has(folder.id)} onChange={() => toggleFolder(folder.id)} className="xbo:size-4 xbo:accent-white" />
                  <span className="xbo:min-w-0 xbo:flex-1">
                    <span className="xbo:block xbo:truncate xbo:text-sm xbo:text-white">{folder.name}</span>
                    <span className="xbo:block xbo:text-xs xbo:text-neutral-500">
                      {folder.bookmarkCount} bookmark{folder.bookmarkCount === 1 ? '' : 's'}{mode === 'add' && selectedInFolder > 0 ? ` · ${selectedInFolder} selected` : mode === 'remove' ? ` · ${selectedInFolder} selected` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
            {visibleFolders.length === 0 && <p className="xbo:py-6 xbo:text-center xbo:text-sm xbo:text-neutral-500">{mode === 'remove' ? 'None of the selected bookmarks belong to a folder.' : 'No folders found.'}</p>}
          </div>
          {error && <p className="xbo:mt-3 xbo:rounded-lg xbo:border xbo:border-red-300/30 xbo:bg-red-950/40 xbo:p-2 xbo:text-sm xbo:text-red-100">{error}</p>}
        </div>

        <footer className="xbo:flex xbo:justify-end xbo:gap-2 xbo:border-t xbo:border-white/10 xbo:p-5">
          <button className="xbo:cursor-pointer xbo:rounded-lg xbo:border xbo:border-white/20 xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button data-folder-submit="true" className="xbo:cursor-pointer xbo:rounded-lg xbo:border xbo:border-white xbo:bg-white xbo:px-4 xbo:py-2 xbo:text-sm xbo:font-medium xbo:text-black xbo:hover:bg-neutral-200 xbo:hover:text-black xbo:disabled:cursor-not-allowed xbo:disabled:opacity-50" type="button" onClick={() => void onSubmit([...selectedFolderIds])} disabled={busy || selectedFolderIds.size === 0}>
            {busy ? 'Updating...' : mode === 'add' ? `Add to ${selectedFolderIds.size || ''} folder${selectedFolderIds.size === 1 ? '' : 's'}` : `Remove from ${selectedFolderIds.size || ''} folder${selectedFolderIds.size === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  )
}
