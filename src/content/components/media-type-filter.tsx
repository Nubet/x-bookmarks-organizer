import type {MediaType} from '../../domain/search/search-bookmarks'

export function MediaTypeFilter({
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
