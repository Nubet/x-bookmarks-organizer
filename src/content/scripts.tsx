import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings} from '../shared/types'
import {observeBookmarkButtons, saveCapturedBookmark} from './bookmark-observer'

export default function initial() {
  let stopObserving = () => {}
  let disposed = false

  void start()

  return () => {
    disposed = true
    stopObserving()
  }

  async function start() {
    const response = await sendRuntimeMessage<ExtensionSettings>({
      type: 'SETTINGS_GET',
    })

    if (disposed || !response.ok || !response.data.pageIntegration) return

    stopObserving = observeBookmarkButtons(saveCapturedBookmark)
  }
}
