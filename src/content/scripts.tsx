/**
 * X-only content-script entrypoint. Page observation and injected UI are added
 * in later implementation phases.
 */
export default function initial() {
  console.log('[x-bookmarks-organizer] X content script ready')

  return () => undefined
}
