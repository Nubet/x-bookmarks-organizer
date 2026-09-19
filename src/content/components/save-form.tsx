import type {FormEvent} from 'react'

export function SaveForm({saving, onSubmit}: {saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void}) {
  return (
    <form className="xbo:flex xbo:justify-center xbo:gap-3 xbo:p-6 xbo:pt-0 xbo:max-sm:flex-col" onSubmit={onSubmit}>
      <input className="xbo:w-full xbo:max-w-md xbo:rounded-lg xbo:border xbo:border-white/10 xbo:bg-neutral-900 xbo:px-4 xbo:py-3 xbo:text-base xbo:text-white xbo:outline-0" name="tweetUrl" type="url" placeholder="Paste an X post URL" aria-label="X post URL" />
      <button className="xbo:cursor-pointer xbo:rounded-full xbo:border xbo:border-white xbo:bg-white xbo:px-4 xbo:py-2 xbo:text-sm xbo:text-black xbo:disabled:cursor-wait xbo:disabled:opacity-60" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save post'}</button>
    </form>
  )
}
