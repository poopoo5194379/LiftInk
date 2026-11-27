import { net, shell } from 'electron'
import type { ReleaseUpdate } from '../shared/editor'
import { desktopRelease } from '../shared/release'

const repository = 'poopoo5194379/LiftInk'
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const versionOrder = new Intl.Collator('en', { numeric: true })
type DesktopRelease = NonNullable<ReturnType<typeof desktopRelease>>
const installerName = (target: DesktopRelease, version: string): string =>
  target === 'win-x64' ? `LiftInk-${version}-setup.exe` : `LiftInk-${version}-${target}.dmg`

function currentTarget(): DesktopRelease {
  const target = desktopRelease(process.platform, process.arch)
  if (!target) throw new Error('当前系统没有适用的安装包')
  return target
}

type GitHubRelease = {
  tag_name: string
  draft: boolean
  assets: { name: string; state: string }[]
}

export async function checkReleaseUpdate(currentVersion: string): Promise<ReleaseUpdate | null> {
  const target = currentTarget()
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
    if (release.assets.some((asset) => asset.name === installerName(target, version) && asset.state === 'uploaded')) latest = version
  }
  return latest ? { version: latest, available: versionOrder.compare(latest, currentVersion) > 0 } : null
}

export async function downloadRelease(version: unknown): Promise<void> {
  if (typeof version !== 'string' || !versionPattern.test(version)) throw new Error('无效的版本号')
  await shell.openExternal(`https://github.com/${repository}/releases/download/v${version}/${installerName(currentTarget(), version)}`)
}
