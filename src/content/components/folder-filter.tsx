import {useState} from 'react'
import type {FolderSummary} from '../../shared/types'

export function FolderFilter({
  folderId,
  folders,
  onChange,
  disabled,
}: {
  folderId: string
  folders: FolderSummary[]
  onChange: (folderId: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const activeFolder = folders.find((folder) => folder.id === folderId)
  const visibleFolders = folders.filter((folder) => folder.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const activeLabel = activeFolder?.name ?? 'All bookmarks'
  const activeCount = activeFolder?.bookmarkCount

  return (
    <div className="xbo:relative">
      <button
        className="xbo:flex xbo:min-w-52 xbo:cursor-pointer xbo:items-center xbo:justify-between xbo:gap-3 xbo:rounded-full xbo:border xbo:border-white/20 xbo:bg-neutral-900 xbo:px-4 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:transition-colors xbo:hover:border-white/40 xbo:disabled:cursor-wait xbo:disabled:opacity-50"
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Browse folder"
      >
        <span className="xbo:max-w-40 xbo:truncate">{activeLabel}</span>
        <span className="xbo:flex xbo:items-center xbo:gap-2 xbo:text-neutral-500">
          {activeCount !== undefined && <span className="xbo:font-mono xbo:text-[10px]">{activeCount}</span>}
          <span aria-hidden="true">⌄</span>
        </span>
      </button>
      {open && (
        <div className="xbo:absolute xbo:left-0 xbo:top-full xbo:z-20 xbo:mt-2 xbo:w-64 xbo:overflow-hidden xbo:rounded-xl xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:p-2 xbo:shadow-xl" role="listbox" aria-label="Folders">
          <input
            className="xbo:mb-2 xbo:box-border xbo:w-full xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-950 xbo:px-3 xbo:py-2 xbo:text-sm xbo:text-white xbo:outline-none xbo:focus:border-white"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search folders..."
            aria-label="Search folders"
          />
          <div className="xbo:grid xbo:max-h-64 xbo:gap-1 xbo:overflow-y-auto">
            <button className="xbo:flex xbo:cursor-pointer xbo:items-center xbo:justify-between xbo:rounded-lg xbo:px-3 xbo:py-2 xbo:text-left xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:data-[active=true]:bg-white xbo:data-[active=true]:text-black" type="button" role="option" aria-selected={folderId === 'all'} data-active={folderId === 'all'} onClick={() => { onChange('all'); setOpen(false); setQuery('') }}>
              <span>All bookmarks</span>
            </button>
            {visibleFolders.map((folder) => (
              <button className="xbo:flex xbo:cursor-pointer xbo:items-center xbo:justify-between xbo:gap-3 xbo:rounded-lg xbo:px-3 xbo:py-2 xbo:text-left xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:data-[active=true]:bg-white xbo:data-[active=true]:text-black" key={folder.id} type="button" role="option" aria-selected={folderId === folder.id} data-active={folderId === folder.id} onClick={() => { onChange(folder.id); setOpen(false); setQuery('') }}>
                <span className="xbo:min-w-0 xbo:truncate">{folder.name}</span>
                <span className="xbo:shrink-0 xbo:font-mono xbo:text-[10px] xbo:opacity-60">{folder.bookmarkCount}</span>
              </button>
            ))}
            {visibleFolders.length === 0 && <span className="xbo:px-3 xbo:py-3 xbo:text-center xbo:text-xs xbo:text-neutral-500">No folders found</span>}
          </div>
        </div>
      )}
    </div>
  )
}
