import { useState } from 'react'
import type { AppDiagnostics, ReleaseUpdate } from '../../../shared/editor'

type UpdateStatus =
  | { state: 'idle' | 'checking' | 'error' | 'noInstaller' }
  | { state: 'checked'; update: ReleaseUpdate }

export default function VersionUpdates({ diagnostics }: { diagnostics: AppDiagnostics | null }): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [downloadError, setDownloadError] = useState(false)
  const supported = diagnostics?.platform === 'win32' && diagnostics.arch === 'x64'
  const update = status.state === 'checked' && status.update.available ? status.update : null

  const check = async (): Promise<void> => {
    setStatus({ state: 'checking' })
    setDownloadError(false)
    try {
      const release = await window.liftInk.checkReleaseUpdate()
      setStatus(release ? { state: 'checked', update: release } : { state: 'noInstaller' })
    } catch {
      setStatus({ state: 'error' })
    }
  }

  const download = async (version: string): Promise<void> => {
    setDownloadError(false)
    try {
      await window.liftInk.downloadRelease(version)
    } catch {
      setDownloadError(true)
    }
  }

  return <section className="glass library-setting" aria-labelledby="version-update-heading">
    <h2 id="version-update-heading">版本更新</h2>
    {diagnostics && <p>当前版本 LiftInk {diagnostics.version}</p>}
    <p>{diagnostics && !supported
      ? 'GitHub 目前只提供 Windows x64 安装包。'
      : '从 GitHub 检查新版本。下载完成后，退出 LiftInk，再运行安装包。'}</p>
    <div className="library-setting-actions">
      <button disabled={!supported || status.state === 'checking'} onClick={() => void check()}>
        {status.state === 'checking' ? '正在检查…' : '检查更新'}
      </button>
      {update && <button onClick={() => void download(update.version)}>下载 Windows 安装包</button>}
    </div>
    <p role="status">
      {status.state === 'checking' && '正在连接 GitHub…'}
      {status.state === 'checked' && (update ? `发现新版本 LiftInk ${update.version}` : '当前已是最新版本。')}
      {status.state === 'noInstaller' && 'GitHub 目前没有可下载的 Windows x64 安装包。'}
      {status.state === 'error' && '无法从 GitHub 检查更新，请稍后重试。'}
    </p>
    {downloadError && <p role="alert">无法打开浏览器，请重试。</p>}
  </section>
}
