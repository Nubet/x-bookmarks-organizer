export function BulkActions({
  selectedCount,
  visibleCount,
  removing,
  onSelectAll,
  onClear,
  onRemove,
  onAddToFolder,
  onRemoveFromFolder,
  updatingFolders,
}: {
  selectedCount: number
  visibleCount: number
  removing: boolean
  onSelectAll: () => void
  onClear: () => void
  onRemove: () => void
  onAddToFolder: () => void
  onRemoveFromFolder: () => void
  updatingFolders: boolean
}) {
  return (
    <div className="xbo:mx-6 xbo:mt-4 xbo:flex xbo:flex-wrap xbo:items-center xbo:gap-3 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-4 xbo:py-3">
      <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:disabled:cursor-not-allowed xbo:disabled:opacity-50" type="button" onClick={onSelectAll} disabled={visibleCount === 0 || removing || updatingFolders}>
        {selectedCount === visibleCount && visibleCount > 0 ? 'Deselect visible' : 'Select visible'}
      </button>
      <span className="xbo:font-mono xbo:text-xs xbo:uppercase xbo:tracking-widest xbo:text-neutral-500">{selectedCount} selected</span>
      {selectedCount > 0 && (
        <>
          <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:disabled:cursor-wait xbo:disabled:opacity-50" type="button" onClick={onClear} disabled={removing || updatingFolders}>Clear</button>
          <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/35 xbo:bg-neutral-800 xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-700 xbo:disabled:cursor-wait xbo:disabled:opacity-50" type="button" onClick={onAddToFolder} disabled={removing || updatingFolders}>Add to folder</button>
          <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/35 xbo:bg-neutral-800 xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-700 xbo:disabled:cursor-wait xbo:disabled:opacity-50" type="button" onClick={onRemoveFromFolder} disabled={removing || updatingFolders}>Remove from folder</button>
           <button className="xbo:ml-auto xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-red-300/50 xbo:bg-red-950/40 xbo:px-3 xbo:py-1.5 xbo:text-sm xbo:text-red-100 xbo:hover:bg-red-900/60 xbo:disabled:cursor-wait xbo:disabled:opacity-50" type="button" onClick={onRemove} disabled={removing || updatingFolders}>
            {removing ? 'Removing...' : 'Remove selected'}
          </button>
        </>
      )}
    </div>
  )
}
