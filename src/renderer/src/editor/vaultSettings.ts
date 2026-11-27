import { isVaultSetting, type VaultSettings } from '../../../shared/vault'

let values: VaultSettings = {}
let inFlight = Promise.resolve()
let timer: number | undefined
let revision = 0
let savedRevision = 0
let journalKey = ''
let journal: Record<string, string | null> = {}

export async function prepareVaultSettings(): Promise<void> {
  const stored = await window.liftInk.loadVaultSettings()
  if (stored) values = stored
  else {
    const legacy: VaultSettings = {}
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key || !isVaultSetting(key)) continue
      const raw = localStorage.getItem(key)
      if (raw !== null) legacy[key] = raw
    }
    await window.liftInk.seedVaultSettings(legacy)
    values = legacy
  }
  journalKey = `liftink:vault-settings-pending:${await window.liftInk.vaultIdentity()}`
  const pending = localStorage.getItem(journalKey)
  if (pending) {
    const entries = Object.entries(JSON.parse(pending) as Record<string, unknown>)
    for (const [key, raw] of entries) {
      if (!isVaultSetting(key) || (raw !== null && typeof raw !== 'string')) continue
      if (raw === null) delete values[key]
      else values[key] = raw
    }
    revision++
    await flushVaultSettings()
  }
}

export const getVaultSetting = (key: string): string | null => values[key] ?? null
export const getVaultSettingEntries = (): [string, string][] => Object.entries(values)

export function setVaultSetting(key: string, value: string | null): void {
  if (!isVaultSetting(key)) throw new Error('不支持的资料库配置')
  if (getVaultSetting(key) === value) return
  if (value === null) delete values[key]
  else values[key] = value
  revision++
  journal[key] = value
  let delay = 200
  try { localStorage.setItem(journalKey, JSON.stringify(journal)) }
  catch { delay = 0 }
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => { void flushVaultSettings().catch(() => window.dispatchEvent(new Event('liftink-vault-save-error'))) }, delay)
}

export async function flushVaultSettings(): Promise<void> {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = undefined
  const write = async (): Promise<void> => {
    if (savedRevision === revision) return
    const current = revision
    await window.liftInk.saveVaultSettings({ ...values })
    savedRevision = current
    if (savedRevision === revision) {
      journal = {}
      localStorage.removeItem(journalKey)
    }
  }
  inFlight = inFlight.catch(() => undefined).then(write)
  await inFlight
  if (savedRevision !== revision) await flushVaultSettings()
}
