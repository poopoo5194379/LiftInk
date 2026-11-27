import './assets/main.css'
import './assets/typography.css'
import './assets/materials.css'
import './assets/refinements.css'
import './assets/views.css'
import './assets/workspaces.css'
import './assets/pen-poc.css'
import './assets/editor-live.css'
import './assets/theme.css'
import './assets/motion.css'

import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { flushEditorSaves } from './editor/autosave'
import { flushVaultSettings, prepareVaultSettings } from './editor/vaultSettings'

window.liftInk.onPrepareClose(async () => {
  await flushEditorSaves()
  await flushVaultSettings()
})

function VaultRecovery({ error }: { error: string }): React.JSX.Element {
  const [message, setMessage] = useState(error)
  const [busy, setBusy] = useState(false)
  const recover = async (operation: 'open' | 'create' | 'restore'): Promise<void> => {
    setBusy(true)
    try { await window.liftInk.vaultOperation(operation) }
    catch (error) { setMessage(String(error)) }
    finally { setBusy(false) }
  }
  return <main className="glass library-setting vault-recovery">
    <h1>无法打开当前资料库</h1><p role="alert">{message}</p>
    <div className="library-setting-actions">
      <button disabled={busy} onClick={() => window.location.reload()}>重试打开</button>
      <button disabled={busy} onClick={() => void recover('open')}>打开资料库</button>
      <button disabled={busy} onClick={() => void recover('restore')}>从快照恢复</button>
      <button disabled={busy} onClick={() => void recover('create')}>创建空资料库</button>
    </div>
  </main>
}

const root = createRoot(document.getElementById('root')!)
void prepareVaultSettings().then(
  () => root.render(<StrictMode><App /></StrictMode>),
  (error: unknown) => root.render(<VaultRecovery error={String(error)} />)
)
