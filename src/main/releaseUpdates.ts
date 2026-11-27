import { net, shell } from 'electron'
import type { ReleaseUpdate } from '../shared/editor'

const repository = 'poopoo5194379/LiftInk'
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const versionOrder = new Intl.Collator('en', { numeric: true })
const installerName = (version: string): string => `LiftInk-${version}-setup.exe`

type GitHubRelease = {
  tag_name: string
  draft: boolean
  assets: { name: string; state: string }[]
}

export async function checkReleaseUpdate(currentVersion: string): Promise<ReleaseUpdate | null> {
  const response = await net.fetch(`https://api.github.com/repos/${repository}/releases?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
    signal: AbortSignal.timeout(12_000)
  })
  if (!response.ok) throw new Error(`GitHub Releases returned HTTP ${response.status}`)
  const releases = (await response.json()) as GitHubRelease[]
  let latest: string | undefined
  for (const release of releases) {
    if (release.draft || !release.tag_name.startsWith('v')) continue
    const version = release.tag_name.slice(1)
    if (!versionPattern.test(version) || (latest && versionOrder.compare(version, latest) <= 0)) continue
    if (release.assets.some((asset) => asset.name === installerName(version) && asset.state === 'uploaded')) latest = version
  }
  return latest ? { version: latest, available: versionOrder.compare(latest, currentVersion) > 0 } : null
}

export async function downloadRelease(version: unknown): Promise<void> {
  if (typeof version !== 'string' || !versionPattern.test(version)) throw new Error('无效的版本号')
  await shell.openExternal(`https://github.com/${repository}/releases/download/v${version}/${installerName(version)}`)
}
