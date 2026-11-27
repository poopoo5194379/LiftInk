export type VaultOperation = 'open' | 'create' | 'migrate' | 'snapshot' | 'restore'
export type VaultSettings = Record<string, string>

export const vaultSettingKeys = ['liftink:folders', 'liftink:tags', 'liftink:agenda', 'liftink:goals', 'liftink:keyword-stopwords', 'liftink:last-backup'] as const
export const isVaultSetting = (key: string): boolean => (vaultSettingKeys as readonly string[]).includes(key) ||
  /^liftink:quick-draft:(voice|mindmap|whiteboard|import):[A-Za-z0-9_-]{1,96}$/.test(key)
