import { useEffect, useState } from 'react'
import { ChevronLeft, Download, Folder, FolderSync, Info, Keyboard, Notebook, Palette, PenLine, Settings, SlidersHorizontal, TabletSmartphone, Upload } from 'lucide-react'
import type { AppDiagnostics, StorageInfo } from '../../../shared/editor'
import type { VaultOperation } from '../../../shared/vault'
import { accentColors, type Preferences } from '../editor/preferences'
import { penStyles } from '../editor/ink'
import WritingTestPad from './WritingTestPad'

export type LocalProfile = { name: string; reminders: boolean }

export type SettingsSection = 'general' | 'appearance' | 'writing' | 'devices' | 'canvas' | 'files' | 'shortcuts' | 'about'
const sections = [
  ['general', '通用', '启动、语言、默认行为', SlidersHorizontal],
  ['appearance', '外观', '主题、颜色、界面大小', Palette],
  ['writing', '书写体验', '笔迹平滑、压感、笔刷', PenLine],
  ['devices', '输入设备', '数位板、手写笔、触控', TabletSmartphone],
  ['canvas', '画布与笔记', '纸张、页面、导航方式', Notebook],
  ['files', '文件与备份', '存储、自动保存、恢复', FolderSync],
  ['shortcuts', '快捷键', '文件、编辑和书写工具', Keyboard],
  ['about', '关于与诊断', '版本、更新、书写问题', Info]
] as const

const shortcuts = [
  ['文件', [['新建笔记', 'Ctrl + N'], ['导入文件', 'Ctrl + O'], ['全局搜索', 'Ctrl + K']]],
  ['编辑', [['保存', 'Ctrl + S'], ['撤销', 'Ctrl + Z'], ['重做', 'Ctrl + Shift + Z'], ['删除选区', 'Delete']]],
  ['书写工具', [['钢笔', 'P'], ['橡皮擦', 'E'], ['抓手', 'H'], ['套索与选择', 'L / V'], ['临时平移', 'Space']]],
  ['画布', [['适合页面', 'Ctrl + 0'], ['全屏笔记', 'F11'], ['退出全屏', 'Esc'], ['查找 PDF 原文', 'Ctrl + F']]]
] as const

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void
}): React.JSX.Element {
  return <label className="preference-row"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }): React.JSX.Element {
  return <label className="preference-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>
}

export default function LibrarySettings({ profile, onProfile, folders, onFolder, onBack, onBackup, onRestore, onClean, busy,
  preferences, onPreferences, onReset, lastBackup, lastSaved, blockedKeywords, onUnblock, initialSection, onTestInput, onVaultOperation, switching }: {
  profile: LocalProfile
  onProfile: (profile: LocalProfile) => void
  folders: string[]
  onFolder: (source: string, parent: string, name: string, remove?: boolean) => string | undefined
  onBack: () => void
  onBackup: (toDirectory: boolean) => void
  onRestore: () => void
  onClean: () => void
  busy: boolean
  switching: boolean
  preferences: Preferences
  onPreferences: (patch: Partial<Preferences>) => void
  onReset: () => void
  lastBackup: number
  lastSaved: number
  blockedKeywords: string[]
  onUnblock: (word: string) => void
  initialSection?: SettingsSection
  onTestInput: () => void
  onVaultOperation: (operation: VaultOperation) => void
}): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection | null>(initialSection ?? null)
  const showStorageLocation = section === null || section === 'files'
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [shortcutSearch, setShortcutSearch] = useState('')
  const p = preferences
  const [source, setSource] = useState('')
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!showStorageLocation) return
    void window.liftInk.storageInfo().then((value) => {
      if (cancelled) return
      setStorage(value)
      setStorageError(false)
    }).catch(() => { if (!cancelled) setStorageError(true) })
    return () => { cancelled = true }
  }, [showStorageLocation, lastBackup])
  useEffect(() => {
    let cancelled = false
    if (section === 'about') void window.liftInk.appDiagnostics().then((value) => { if (!cancelled) setDiagnostics(value) }).catch(() => { if (!cancelled) setMessage('无法获取版本与诊断信息') })
    return () => { cancelled = true }
  }, [section])
  const chooseBackupDirectory = async (): Promise<void> => {
    try {
      const directory = await window.liftInk.chooseBackupDirectory()
      if (directory) setStorage(await window.liftInk.storageInfo())
    } catch (error) { setMessage(`无法设置备份目录：${String(error)}`) }
  }
  const exportDiagnostics = async (): Promise<void> => {
    if (!diagnostics) return
    try {
      const payload = btoa(JSON.stringify(diagnostics, null, 2))
      if (await window.liftInk.saveExport('json', 'LiftInk-diagnostics', payload)) setMessage('诊断信息已导出')
    } catch (error) { setMessage(`导出失败：${String(error)}`) }
  }
  const reset = (path: string): void => {
    const parts = path.split(' / ')
    setSource(path)
    setName(parts.pop() ?? '')
    setParent(parts.join(' / '))
    setConfirm(false)
    setMessage('')
  }
  const commit = (remove: boolean): void => {
    const error = onFolder(source, remove ? source.split(' / ').slice(0, -1).join(' / ') : parent, name, remove)
    if (error) setMessage(error)
    else { reset(''); setMessage(remove ? '已删除分区，笔记已移至上一级' : '分区已保存') }
  }
  return (
    <section className="library-page library-settings" aria-label="设置页面">
      <button className="back-link" onClick={onBack}><ChevronLeft size={18} /> 返回首页</button>
      <header className="library-heading"><div><h1><Settings size={22} /> LiftInk 设置</h1></div></header>
      {showStorageLocation && <section className="glass library-setting storage-location" aria-label="本地存储位置">
        <h2>本地存储位置</h2>
        <p>当前资料库路径</p>
        {storageError ? <p role="alert">无法读取当前路径</p> : storage ? (
          <code className="storage-path">{storage.path}</code>
        ) : <p role="status">正在读取当前路径…</p>}
        <div className="library-setting-actions">
          <button className="storage-location-change" disabled={busy} onClick={() => onVaultOperation('migrate')}>
            更改存储位置
          </button>
          <button disabled={switching} onClick={() => void window.liftInk.openStorageDirectory().catch(() => setMessage('无法打开存储目录'))}>
            打开存储目录
          </button>
        </div>
        <p>选择上级文件夹，LiftInk 会在其中创建「LiftInk-资料库」，复制并校验当前资料库后切换。原目录会保留。</p>
      </section>}
      <nav className="settings-categories" aria-label="设置分类">
        {sections.map(([id, title, subtitle, Icon]) => <button key={id} aria-pressed={section === id} onClick={() => {
          setSection(id); setMessage('')
        }}><Icon size={22} /><span><strong>{title}</strong><small>{subtitle}</small></span></button>)}
      </nav>
      <div className="settings-detail" key={section}>
      {section === 'general' && <section className="glass library-setting">
        <h2>通用</h2>
        <div className="preference-row"><span>应用语言</span><span>简体中文</span></div>
        <Choice label="启动时打开" value={p.startup} options={[[ 'workspace', '上次工作区' ], [ 'home', '首页' ]]} onChange={(startup) => onPreferences({ startup })} />
        <Choice label="关闭窗口时" value={p.close} options={[[ 'exit', '退出应用' ], [ 'tray', '最小化到托盘' ]]} onChange={(close) => onPreferences({ close })} />
        <Toggle label="恢复上次打开的笔记" checked={p.restoreNote} onChange={(restoreNote) => onPreferences({ restoreNote })} />
        <Choice label="新建文件默认位置" value={p.newFolder} options={[[ 'current', '当前文件夹' ], [ 'all', '全部笔记（未分类）' ]]} onChange={(newFolder) => onPreferences({ newFolder })} />
        <div className="preference-row"><span>自动检查更新</span><span>尚未配置更新源</span></div>
        <section className="glass library-setting" aria-label="思绪拾光屏蔽词">
          <h2>思绪拾光屏蔽词</h2>
          {blockedKeywords.length ? <div className="library-setting-actions">
            {blockedKeywords.map((word) => <button key={word} aria-label={`恢复显示 ${word}`} onClick={() => onUnblock(word)}>{word} ×</button>)}
          </div> : <p>暂无屏蔽词。可在首页右键屏蔽关键词。</p>}
        </section>
        <section className="glass library-setting"><h2>本机资料</h2>
          <label className="form-field">显示名称<input value={profile.name} maxLength={40} onChange={(event) => onProfile({ ...profile, name: event.target.value })} /></label>
          <label className="library-setting-check"><input type="checkbox" checked={profile.reminders} onChange={(event) => onProfile({ ...profile, reminders: event.target.checked })} /> 显示日程提醒</label>
        </section>
      </section>}
      {section === 'appearance' && <section className="glass library-setting">
        <h2>外观</h2>
        <Choice label="界面主题" value={p.theme} options={[[ 'light', '浅色' ], [ 'dark', '深色' ], [ 'system', '跟随系统' ]]} onChange={(theme) => onPreferences({ theme })} />
        <div className="preference-row"><span>主题色</span><div className="settings-colors">
          {([['purple', '柔紫'], ['blue', '海蓝'], ['green', '松绿'], ['rose', '玫红']] as const).map(([value, label]) => <button key={value} aria-label={label} title={label} aria-pressed={p.accent === value}
            style={{ backgroundColor: accentColors[value] }} onClick={() => onPreferences({ accent: value })} />)}
        </div></div>
        <label className="preference-row">界面缩放 <span><input type="range" min={90} max={125} step={5} value={p.scale} onChange={(event) => onPreferences({ scale: event.target.valueAsNumber })} /> {p.scale}%</span></label>
        <Toggle label="记忆侧边栏展开状态" checked={p.rememberSidebar} onChange={(rememberSidebar) => onPreferences({ rememberSidebar })} />
        <Choice label="文件展示" value={p.fileLayout} options={[[ 'list', '列表' ], [ 'grid', '网格' ]]} onChange={(fileLayout) => onPreferences({ fileLayout })} />
      </section>}
      {section === 'writing' && <section className="glass library-setting">
        <h2>书写体验</h2>
        <h3>笔迹表现</h3>
        <label className="preference-row">笔迹平滑 <span>原始 <input type="range" min={0} max={1} step={0.05} value={p.stability} onChange={(event) => onPreferences({ stability: event.target.valueAsNumber })} /> {Math.round(p.stability * 100)}% · 更稳定</span></label>
        <p>平滑程度越高，线条通常越稳定，也可能增加跟笔延迟。</p>
        <h3>压感调节</h3>
        <Choice label="压感响应" value={p.pressureCurve < 0.9 ? 'soft' : p.pressureCurve > 1.1 ? 'hard' : 'standard'} options={[[ 'soft', '轻柔' ], [ 'standard', '标准' ], [ 'hard', '硬朗' ]]} onChange={(value) => onPreferences({ pressureCurve: { soft: 0.65, standard: 1, hard: 1.5 }[value] })} />
        <Toggle label="笔迹粗细随压力变化" checked={p.pressure} onChange={(pressure) => onPreferences({ pressure })} />
        <h3>默认笔刷</h3>
        <Choice label="笔刷类型" value={p.penStyle} options={Object.entries(penStyles).map(([value, style]) => [value as Preferences['penStyle'], style.name])} onChange={(penStyle) => onPreferences({ penStyle })} />
        <label className="preference-row">默认笔宽 <span><input type="range" min={0.5} max={32} step={0.5} value={p.penWidth} onChange={(event) => onPreferences({ penWidth: event.target.valueAsNumber })} /> {p.penWidth} px</span></label>
        <h3>书写测试区</h3><WritingTestPad preferences={p} />
      </section>}
      {section === 'devices' && <section className="glass library-setting">
        <h2>输入设备</h2>
        <Choice label="输入方式" value={p.device} options={[[ 'auto', '自动检测' ], [ 'pen', '仅手写笔' ], [ 'mouse', '固定笔宽输入' ]]} onChange={(device) => onPreferences({ device })} />
        <Choice label="笔侧键" value={p.sideButton} options={[[ 'none', '设备默认' ], [ 'erase', '橡皮擦' ], [ 'hand', '抓手' ], [ 'select', '套索与选择' ]]} onChange={(sideButton) => onPreferences({ sideButton })} />
        <Toggle label="忽略触屏落笔，减少手掌误触" checked={p.ignoreTouch} onChange={(ignoreTouch) => onPreferences({ ignoreTouch })} />
        <h3>检测输入设备与压力</h3><WritingTestPad preferences={p} />
        <div className="library-setting-actions"><button onClick={onTestInput}>打开详细输入测试</button></div>
        <details><summary>输入兼容性指南</summary><p>请在测试区用笔落笔。若软件显示为鼠标或压力没有变化，请检查厂商驱动的 Windows Ink 选项和笔压配置。设备名称、屏幕映射和驱动层按键由厂商工具管理。</p></details>
      </section>}
      {section === 'canvas' && <section className="glass library-setting">
        <h2>画布与笔记</h2>
        <Choice label="默认笔记类型" value={p.noteType} options={[[ 'paged', '分页笔记' ], [ 'board', '白板' ]]} onChange={(noteType) => onPreferences({ noteType })} />
        <Choice label="默认纸张" value={p.paperSize} options={[[ 'a4', 'A4' ], [ 'a5', 'A5' ], [ 'custom', '自定义' ]]} onChange={(paperSize) => onPreferences({ paperSize })} />
        {p.paperSize === 'custom' && <div className="preference-row"><span>纸张宽高（像素）</span><span>
          <input type="number" aria-label="纸张宽度" min={200} max={4000} defaultValue={p.paperWidth} onBlur={(event) => { const width = event.target.valueAsNumber; if (width >= 200 && width <= 4000) onPreferences({ paperWidth: width }); else event.target.value = String(p.paperWidth) }} /> × <input type="number" aria-label="纸张高度" min={200} max={4000} defaultValue={p.paperHeight} onBlur={(event) => { const height = event.target.valueAsNumber; if (height >= 200 && height <= 4000) onPreferences({ paperHeight: height }); else event.target.value = String(p.paperHeight) }} />
        </span></div>}
        <Choice label="默认纸张背景" value={p.paper} options={[[ 'blank', '空白' ], [ 'lines', '横线' ], [ 'grid', '方格' ], [ 'dots', '点阵' ]]} onChange={(paper) => onPreferences({ paper })} />
        <Choice label="默认纸张颜色" value={p.paperColor} options={[[ 'white', '白色' ], [ 'cream', '米白' ], [ 'gray', '深灰' ]]} onChange={(paperColor) => onPreferences({ paperColor })} />
        <Choice label="初始缩放方式" value={p.initialZoom} options={[[ 'width', '适合宽度' ], [ 'page', '适合页面' ], [ 'actual', '100%' ]]} onChange={(initialZoom) => onPreferences({ initialZoom })} />
        <p>滚轮滚动页面，按住 Ctrl 可缩放。触控板支持双指滚动与系统提供的缩放手势。</p>
        <p>PDF 导入后为可批注副本。</p>
      </section>}
      {section === 'files' && <div className="library-settings-grid">
        <section className="glass library-setting"><h2>管理资料库</h2>
          {storage && <p>当前资料库占用 {(storage.bytes / 1048576).toFixed(1)} MB</p>}
          <div className="library-setting-actions">
            <button disabled={switching} onClick={() => onVaultOperation('open')}>打开资料库</button>
            <button disabled={switching} onClick={() => onVaultOperation('create')}>创建资料库</button>
          </div>
          <h3>自动保存</h3><p>始终开启。{lastSaved ? `最近保存于 ${new Date(lastSaved).toLocaleString('zh-CN')}` : '编辑后会自动保存。'}</p>
        </section>
        <section className="glass library-setting"><h2>备份与恢复</h2>
          <p>快照保留笔记、原附件和资料库配置。恢复到新文件夹后自动打开。</p>
          {storage?.backupDirectory && <code className="storage-path">{storage.backupDirectory}</code>}
          <div className="library-setting-actions"><button onClick={() => void chooseBackupDirectory()}>选择备份目录</button></div>
          <Choice label="自动快照" value={String(p.backupInterval)} options={[[ '0', '关闭' ], [ '1', '每天' ], [ '7', '每周' ]]} onChange={(interval) => onPreferences({ backupInterval: Number(interval) })} />
          <p>{p.backupInterval ? '应用停留在首页或设置时创建快照。' : ''}{lastBackup ? ` 最近备份于 ${new Date(lastBackup).toLocaleString('zh-CN')}` : ''}</p>
          <div className="library-setting-actions">
            <button disabled={busy} onClick={() => onVaultOperation('snapshot')}><Download size={16} /> 创建快照</button>
            <button disabled={switching} onClick={() => onVaultOperation('restore')}><Upload size={16} /> 从快照恢复</button>
            <button disabled={busy} onClick={() => onBackup(!!storage?.backupDirectory)}>导出 .liftink</button>
            <button disabled={busy} onClick={onRestore}>从 .liftink 导入副本</button>
            <button disabled={busy} onClick={onClean}>清理无引用附件</button>
          </div>
        </section>
        <section className="glass library-setting"><h2>导出</h2>
          <Choice label="默认格式" value={p.exportFormat} options={[[ 'pdf', 'PDF' ], [ 'png', 'PNG' ], [ 'liftink', 'LiftInk 原生备份' ]]} onChange={(exportFormat) => onPreferences({ exportFormat })} />
          <Choice label="笔迹与图片清晰度" value={String(p.exportScale)} options={[[ '1', '标准 · 1×' ], [ '2', '清晰 · 2×' ], [ '3', '高分辨率 · 3×' ]]} onChange={(value) => onPreferences({ exportScale: Number(value) })} />
          <Toggle label="默认包含纸张和 PDF 底图" checked={p.exportBackground} onChange={(exportBackground) => onPreferences({ exportBackground })} />
        </section>
        <form className="glass library-setting" onSubmit={(event) => { event.preventDefault(); commit(false) }}>
          <h2><Folder size={18} /> 文件分区</h2>
          <label className="form-field">选择分区<select value={source} onChange={(event) => reset(event.target.value)}>
            <option value="">新建分区</option>
            {folders.filter((path) => path !== '未分类').map((path) => <option key={path}>{path}</option>)}
          </select></label>
          <label className="form-field">名称<input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="form-field">上级分区<select value={parent} onChange={(event) => setParent(event.target.value)}>
            <option value="">顶层</option>
            {folders.filter((path) => path !== '未分类' && (!source || (path !== source && !path.startsWith(`${source} / `)))).map((path) => <option key={path}>{path}</option>)}
          </select></label>
          <div className="library-setting-actions">
            <button type="submit">保存分区</button>
            {source && <button type="button" onClick={() => setConfirm(true)}>删除分区</button>}
          </div>
          {confirm && <div role="alert"><p>删除此分区及子分区？其中的笔记将移至上一级。</p>
            <div className="library-setting-actions"><button type="button" onClick={() => commit(true)}>确认删除</button><button type="button" onClick={() => setConfirm(false)}>取消</button></div>
          </div>}
        </form>
      </div>}
      {section === 'shortcuts' && <section className="glass library-setting">
        <h2>快捷键</h2><label className="form-field">搜索快捷键<input value={shortcutSearch} onChange={(event) => setShortcutSearch(event.target.value)} /></label>
        {shortcuts.map(([group, entries]) => {
          const matching = entries.filter(([action, key]) => `${group} ${action} ${key}`.toLowerCase().includes(shortcutSearch.trim().toLowerCase()))
          return matching.length > 0 && <section key={group}><h3>{group}</h3>{matching.map(([action, key]) => <div key={action} className="preference-row"><span>{action}</span><kbd>{key}</kbd></div>)}</section>
        })}
      </section>}
      {section === 'about' && <section className="glass library-setting">
        <h2>关于与诊断</h2><p>LiftInk {diagnostics?.version}</p><p>更新源尚未配置。</p>
        <details><summary>版本信息</summary><p>本版包括笔记全屏、日程周历和月历、PDF 插入位置及关键词屏蔽。</p></details>
        <h3>报告书写问题</h3><p>可先检查诊断内容，再导出到本机文件。</p>
        <div className="library-setting-actions"><button disabled={!diagnostics} onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}>查看诊断信息</button>
          <button disabled={!diagnosticsOpen} onClick={() => void exportDiagnostics()}>导出诊断信息</button></div>
        {diagnosticsOpen && <pre>{JSON.stringify(diagnostics, null, 2)}</pre>}
        <h3>恢复默认设置</h3>
        <div className="library-setting-actions"><button onClick={() => setResetConfirm(true)}>恢复默认偏好</button></div>
        {resetConfirm && <div className="library-setting-actions"><button onClick={() => { onReset(); setResetConfirm(false); setMessage('已恢复默认偏好') }}>确认恢复</button><button onClick={() => setResetConfirm(false)}>取消</button></div>}
      </section>}
      {message && <p role="status">{message}</p>}
      </div>
    </section>
  )
}
