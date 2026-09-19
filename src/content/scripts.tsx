import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings} from '../shared/types'
import {observeBookmarkButtons, saveCapturedBookmark} from './bookmark-observer'
import {getLatestTransactionId, installPageScript} from './page-bridge'

export default function initial() {
  installPageScript()
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

    void getLatestTransactionId().catch(() => undefined)
  }
}
