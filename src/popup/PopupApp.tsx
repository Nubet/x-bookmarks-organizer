import {useSyncExternalStore} from 'react'
import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings} from '../shared/types'

const extensionVersion = chrome.runtime.getManifest().version

interface SettingsView {
  settings: ExtensionSettings | null
  loading: boolean
  error: string
  syncing: boolean
  syncMessage: string
}

let view: SettingsView = {
  settings: null,
  loading: false,
  error: '',
  syncing: false,
  syncMessage: '',
}
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

async function loadSettings() {
  if (view.loading) return

  view = {...view, loading: true, error: ''}
  notify()

  const response = await sendRuntimeMessage<ExtensionSettings>({
    type: 'SETTINGS_GET',
  })

  view = response.ok
    ? {...view, settings: response.data, loading: false, error: ''}
    : {...view, settings: null, loading: false, error: response.error}
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  void loadSettings()
  return () => listeners.delete(listener)
}

async function startSync() {
  view = {...view, syncing: true, syncMessage: '', error: ''}
  notify()

  const response = await sendRuntimeMessage<{status: string}>({type: 'SYNC_START'})
  view = response.ok
    ? {...view, syncing: false, syncMessage: response.data.status}
    : {...view, syncing: false, error: response.error}
  notify()
}

function getSnapshot() {
  return view
}

async function updateSetting(
  key: keyof Omit<ExtensionSettings, 'key'>,
  value: boolean
) {
  const response = await sendRuntimeMessage<ExtensionSettings>({
    type: 'SETTINGS_UPDATE',
    settings: {[key]: value},
  })

  if (response.ok) {
    view = {...view, settings: response.data, error: ''}
    notify()
  }
}

export default function PopupApp() {
  const {settings, loading, error} = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  )

  return (
    <main className="popup_app">
      <header className="popup_header">
        <div>
          <p className="popup_eyebrow">x-bookmarks-organizer</p>
          <h1>Settings</h1>
        </div>
      </header>

      {loading && <p className="status_message">Loading settings...</p>}
      {error && <p className="status_message status_error">{error}</p>}
      {view.syncMessage && <p className="status_message">{view.syncMessage}</p>}

      {settings && (
        <section className="settings_section" aria-label="Extension settings">
          <button
            className="sync_button"
            type="button"
            disabled={view.syncing}
            onClick={() => void startSync()}
          >
            {view.syncing ? 'Starting sync...' : 'Sync now'}
          </button>
          <label className="setting_row">
            <span>
              <strong>Organizer view</strong>
              <small>Use the organizer instead of X's default Bookmarks page.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.pageIntegration}
              onChange={(event) =>
                void updateSetting('pageIntegration', event.target.checked)
              }
            />
          </label>
          <label className="setting_row">
            <span>
              <strong>Automatic sync</strong>
              <small>Refresh local bookmarks in the background.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.autoSync}
              onChange={(event) =>
                void updateSetting('autoSync', event.target.checked)
              }
            />
          </label>
        </section>
      )}

      <footer className="popup_footer">
        <nav className="popup_links" aria-label="Project links">
          <a
            href="https://github.com/Nubet/x-bookmarks-organizer"
            target="_blank"
            rel="noreferrer"
          >
            Source code
          </a>
          <span>
            Made by:{' '}
            <a
              href="https://www.linkedin.com/in/norbert-fila/"
              target="_blank"
              rel="noreferrer"
            >
              Norbert Fila
            </a>
          </span>
        </nav>
        <span className="popup_version">Version {extensionVersion}</span>
      </footer>
    </main>
  )
}
