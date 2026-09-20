import type {FormEvent} from 'react'

export function SaveForm({saving, onSubmit, onClose}: {saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void}) {
  return (
    <div className="xbo:fixed xbo:inset-0 xbo:z-50 xbo:flex xbo:items-center xbo:justify-center xbo:bg-black/60 xbo:p-4 xbo:backdrop-blur-sm" onClick={onClose}>
      <div 
        className="xbo:w-full xbo:max-w-md xbo:rounded-2xl xbo:border xbo:border-white/10 xbo:bg-neutral-950 xbo:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="xbo:border-b xbo:border-white/10 xbo:p-5">
          <h2 className="xbo:text-lg xbo:font-bold xbo:text-white">Save a post</h2>
        </header>
        <form onSubmit={onSubmit}>
          <div className="xbo:p-5">
            <input className="xbo:box-border xbo:w-full xbo:rounded-lg xbo:border xbo:border-white/20 xbo:bg-neutral-900 xbo:px-4 xbo:py-3 xbo:text-base xbo:text-white xbo:outline-none xbo:focus:border-white" name="tweetUrl" type="url" placeholder="Paste an X post URL..." aria-label="X post URL" required autoFocus />
          </div>
          <footer className="xbo:flex xbo:justify-end xbo:gap-3 xbo:border-t xbo:border-white/10 xbo:p-5 xbo:bg-neutral-900/50 xbo:rounded-b-2xl">
            <button className="xbo:cursor-pointer xbo:rounded-lg xbo:border xbo:border-white/20 xbo:bg-transparent xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:transition xbo:hover:bg-neutral-800" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="xbo:cursor-pointer xbo:rounded-lg xbo:border xbo:border-white/20 xbo:bg-neutral-800 xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-white xbo:transition xbo:hover:bg-neutral-700 xbo:disabled:cursor-wait xbo:disabled:opacity-60" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save post'}</button>
          </footer>
        </form>
      </div>
    </div>
  )
}
