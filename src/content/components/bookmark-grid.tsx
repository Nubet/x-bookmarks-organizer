import {memo, useState} from 'react'
import type {BookmarkPreview} from '../../shared/types'

const dateFormatter = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric'})

export function BookmarkGrid({
  bookmarks,
  selectedIds,
  onToggle,
  onRemove,
}: {
  bookmarks: BookmarkPreview[]
  selectedIds: Set<string>
  onToggle: (tweetId: string) => void
  onRemove: (tweetId: string) => Promise<void>
}) {
  if (bookmarks.length === 0) return <EmptyState />

  return <div className="xbo:columns-1 xbo:gap-6 xbo:px-6 xbo:pb-16 xbo:sm:columns-2 xbo:lg:columns-3 xbo:xl:columns-4">{bookmarks.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} selected={selectedIds.has(bookmark.tweetId)} onToggle={onToggle} onRemove={onRemove} />)}</div>
}

const BookmarkCard = memo(function BookmarkCard({bookmark, selected, onToggle, onRemove}: {bookmark: BookmarkPreview; selected: boolean; onToggle: (tweetId: string) => void; onRemove: (tweetId: string) => Promise<void>}) {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setRemoving(true)
    setError('')
    try {
      await onRemove(bookmark.tweetId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove bookmark.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <article className={`xbo:mb-6 xbo:break-inside-avoid xbo:overflow-hidden xbo:rounded-lg xbo:border xbo:bg-neutral-900 xbo:p-6 ${selected ? 'xbo:border-white/60' : 'xbo:border-white/10'}`}>
      <div className="xbo:flex xbo:items-center xbo:gap-3 xbo:text-sm xbo:leading-5 xbo:text-neutral-500">
        <img className="xbo:size-8 xbo:shrink-0 xbo:rounded-full xbo:bg-neutral-800 xbo:object-cover" src={bookmark.avatarUrl} alt="" />
        <span className="xbo:min-w-0 xbo:flex-1"><b>{bookmark.author.name}</b> @{bookmark.author.username} · {formatDate(bookmark.postedAt ?? bookmark.updatedAt)}</span>
        <input className="xbo:ml-auto xbo:size-4 xbo:shrink-0 xbo:accent-white" type="checkbox" checked={selected} onChange={() => onToggle(bookmark.tweetId)} aria-label={`Select post by @${bookmark.author.username}`} />
      </div>
      <p className="xbo:my-4 xbo:whitespace-pre-wrap xbo:text-base xbo:leading-6 xbo:text-white">{bookmark.text || 'No text available'}</p>
      {bookmark.media?.[0] && <MediaPreview media={bookmark.media[0]} />}
      <div className="xbo:mt-6 xbo:flex xbo:items-center xbo:justify-between xbo:gap-3 xbo:border-t xbo:border-white/10 xbo:pt-4">
        <a className="xbo:rounded-full xbo:border xbo:border-white/25 xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:no-underline xbo:hover:bg-neutral-800" href={`https://x.com/${bookmark.author.username}/status/${bookmark.tweetId}`} target="_blank" rel="noreferrer">Open ↗</a>
        <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white/25 xbo:bg-transparent xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:hover:bg-neutral-800 xbo:disabled:cursor-wait xbo:disabled:opacity-60" type="button" onClick={() => void remove()} disabled={removing}>{removing ? 'Removing...' : 'Remove'}</button>
      </div>
      {error && <p className="xbo:mt-4 xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-800 xbo:p-2 xbo:text-sm xbo:text-white">{error}</p>}
    </article>
  )
})

function MediaPreview({media}: {media: NonNullable<BookmarkPreview['media']>[number]}) {
  if (media.type === 'video') return <video className="xbo:mb-4 xbo:block xbo:max-h-[260px] xbo:w-full xbo:rounded-lg xbo:bg-neutral-950 xbo:object-cover" controls preload="none" poster={media.previewUrl}><source src={media.url} /></video>
  return <img className="xbo:mb-4 xbo:block xbo:max-h-[260px] xbo:w-full xbo:rounded-lg xbo:bg-neutral-950 xbo:object-cover" src={media.url} alt="" loading="lazy" />
}

export function EmptyState() {
  return <div className="xbo:mx-auto xbo:my-16 xbo:grid xbo:max-w-md xbo:gap-4 xbo:rounded-lg xbo:bg-neutral-900 xbo:p-12 xbo:text-center xbo:text-neutral-500"><strong className="xbo:text-xl xbo:leading-7 xbo:text-white">No bookmarks here</strong><span>Run a sync on X or change your search.</span></div>
}

function formatDate(value: string | number) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'recently'
  return dateFormatter.format(timestamp)
}
