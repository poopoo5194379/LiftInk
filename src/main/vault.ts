import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { NoteDocument, NoteRecord } from '../shared/editor'
import { referencedAssets } from '../shared/noteResources'
import { isVaultSetting, type VaultSettings } from '../shared/vault'
import { replaceAtomic, validDocument, validIndex } from './storage'

const marker = 'liftink-vault.json'
const settingsFile = 'vault-settings.json'
const snapshotFile = 'liftink-snapshot.json'
const assetName = /^[a-f0-9]{64}\.(pdf|webm|png|jpg|webp)$/
const noteFile = /^([A-Za-z0-9_-]{1,96})\.json(\.bak)?$/
const maxSettings = 16_000_000
type Marker = { format: 'liftink-vault'; version: 1; id: string }
type FileEntry = { path: string; bytes: number; sha256: string }
type Snapshot = { format: 'liftink-snapshot'; version: 1; vaultId: string; files: FileEntry[] }

async function optional<T>(action: Promise<T>): Promise<T | undefined> {
  try { return await action } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function fileJson(path: string, maxBytes: number): Promise<unknown> {
  const info = await optional(lstat(path))
  if (!info) return undefined
  if (!info.isFile() || info.size > maxBytes) throw new Error(`无法读取 ${basename(path)}`)
  return JSON.parse(await readFile(path, 'utf8'))
}

function checkedSettings(value: unknown): VaultSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('资料库配置无效')
  const entries = Object.entries(value)
  if (entries.length > 20_000) throw new Error('资料库配置过大')
  for (const [key, raw] of entries) {
    if (!isVaultSetting(key) || typeof raw !== 'string') throw new Error('资料库配置无效')
    const parsed = JSON.parse(raw)
    const valid = key === 'liftink:last-backup' ? Number.isSafeInteger(parsed) && parsed >= 0
      : key.startsWith('liftink:quick-draft:') ? !!parsed && typeof parsed === 'object' && !!parsed.draft
        : Array.isArray(parsed)
    if (!valid) {
      throw new Error('资料库配置无效')
    }
  }
  return value as VaultSettings
}

export async function loadVaultSettings(root: string): Promise<VaultSettings | null> {
  const value = await fileJson(join(root, settingsFile), maxSettings)
  return value === undefined ? null : checkedSettings(value)
}

export async function saveVaultSettings(root: string, value: unknown): Promise<void> {
  const encoded = JSON.stringify(checkedSettings(value))
  if (Buffer.byteLength(encoded) > maxSettings) throw new Error('资料库配置过大')
  await replaceAtomic(join(root, settingsFile), encoded)
}

export async function readVault(root: string): Promise<Marker> {
  if (await optional(lstat(join(root, snapshotFile)))) throw new Error('这是备份快照，请使用「从快照恢复」')
  const value = await fileJson(join(root, marker), 4096) as Marker | undefined
  if (value?.format !== 'liftink-vault' || value.version !== 1 || !/^[a-f0-9-]{36}$/.test(value.id)) {
    throw new Error('此文件夹不是可打开的 LiftInk 资料库')
  }
  return value
}

function within(parent: string, child: string): boolean {
  const tail = relative(parent, child)
  return tail === '' || (!isAbsolute(tail) && tail !== '..' && !tail.startsWith(`..${sep}`))
}

export async function independentParent(source: string, destination: string): Promise<string> {
  const parent = await realpath(destination)
  const effectiveSource = await optional(realpath(source)) ?? source
  if (within(effectiveSource, parent)) throw new Error('请选择资料库外的目录')
  return parent
}

const independentFiles = [marker, settingsFile, 'index.json', 'index.json.bak']

async function vaultFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const accept = async (path: string): Promise<void> => {
    const info = await optional(lstat(join(root, path)))
    if (!info) return
    if (!info.isFile()) throw new Error(`不支持的资料库文件：${path}`)
    files.push(path)
  }
  for (const file of independentFiles) await accept(file)
  const list = async (folder: string): Promise<string[]> => {
    const path = join(root, folder)
    const info = await optional(lstat(path))
    if (!info) return []
    if (!info.isDirectory()) throw new Error(`不支持的资料库目录：${folder}`)
    return readdir(path)
  }
  for (const file of await list('notes')) if (noteFile.test(file)) await accept(`notes/${file}`)
  for (const file of await list('assets')) if (assetName.test(file)) await accept(`assets/${file}`)
  for (const file of await list('pdf-text-v1')) if (/^[a-f0-9]{64}\.pdf\.json$/.test(file)) await accept(`pdf-text-v1/${file}`)
  for (const hash of await list('ocr-v1')) {
    if (!/^[a-f0-9]{64}$/.test(hash)) continue
    for (const file of await list(`ocr-v1/${hash}`)) if (/^\d+\.json$/.test(file)) await accept(`ocr-v1/${hash}/${file}`)
  }
  return files.sort()
}

async function digest(path: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length
    hash.update(chunk)
  }
  return { bytes, sha256: hash.digest('hex') }
}

export async function verifyVault(root: string, files?: string[]): Promise<Marker> {
  const manifest = await readVault(root)
  const settings = await loadVaultSettings(root)
  if (!settings) throw new Error('资料库缺少配置文件')
  const verified = files ?? await vaultFiles(root)
  const assets = new Set(verified.filter((file) => file.startsWith('assets/')).map((file) => basename(file)))
  if (!files) {
    for (const file of assets) {
      if ((await digest(join(root, 'assets', file))).sha256 !== file.split('.')[0]) throw new Error(`附件校验失败：${file}`)
    }
  }
  const assertAssets = (ids: string[]): void => {
    for (const id of ids) if (!assets.has(id)) throw new Error(`资料库缺少附件：${id}`)
  }
  const docs = new Set<string>()
  for (const file of verified) {
    if (!file.startsWith('notes/')) continue
    const id = noteFile.exec(basename(file))![1]
    const doc = await fileJson(join(root, file), 160_000_000)
    if (!validDocument(doc, id)) throw new Error(`笔记文件损坏：${file}`)
    if (file.endsWith('.json')) docs.add(id)
    assertAssets(referencedAssets(doc as NoteDocument))
  }
  for (const file of ['index.json', 'index.json.bak']) {
    if (!verified.includes(file)) continue
    const value = await fileJson(join(root, file), 160_000_000)
    if (!validIndex(value)) throw new Error(`笔记目录损坏：${file}`)
    for (const record of Array.isArray(value) ? value : value.notes) {
      if (file === 'index.json' && record.documentExpected && !record.workspace && !docs.has(record.id)) throw new Error(`缺少笔记文档：${record.title}`)
      assertAssets(referencedAssets(null, record))
    }
  }
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith('liftink:quick-draft:')) assertAssets(referencedAssets(null, JSON.parse(value) as NoteRecord))
  }
  return manifest
}

async function initializeVault(root: string): Promise<void> {
  if (!await optional(lstat(join(root, marker)))) {
    const manifest: Marker = { format: 'liftink-vault', version: 1, id: randomUUID() }
    await replaceAtomic(join(root, marker), JSON.stringify(manifest))
  }
}

export async function seedVault(root: string, settings: unknown): Promise<void> {
  if (!await loadVaultSettings(root)) await saveVaultSettings(root, settings)
  await initializeVault(root)
}

async function stageVault<T>(destination: string, work: (stage: string) => Promise<T>): Promise<T> {
  if (await optional(lstat(destination))) throw new Error('目标资料库已存在，请选择其他文件夹')
  const stage = join(dirname(destination), `.${basename(destination)}-${randomUUID()}.partial`)
  await mkdir(stage)
  try {
    const result = await work(stage)
    if (await optional(lstat(destination))) throw new Error('目标资料库已存在，请选择其他文件夹')
    await rename(stage, destination)
    return result
  } finally {
    const stagedPath = await optional(realpath(stage))
    if (stagedPath && relative(stage, stagedPath) === '') await rm(stage, { recursive: true, force: true })
  }
}

export async function createVault(destination: string): Promise<void> {
  await stageVault(destination, async (stage) => {
    await seedVault(stage, {})
    await replaceAtomic(join(stage, 'index.json'), JSON.stringify({ version: 1, notes: [] }))
    await verifyVault(stage)
  })
}

export async function copyVault(source: string, destination: string, mode: 'migrate' | 'snapshot' | 'restore'): Promise<void> {
  await stageVault(destination, async (stage) => {
    const files = await vaultFiles(source)
    const expected = mode === 'restore' ? await readSnapshot(source, files) : null
    const entries: FileEntry[] = []
    const hashed = new Map(expected?.files.map((file) => [file.path, file]))
    for (const file of files) {
      const from = join(source, file)
      const to = join(stage, file)
      const original = expected ? hashed.get(file)! : await digest(from)
      await mkdir(dirname(to), { recursive: true })
      await copyFile(from, to)
      const handle = await open(to, 'r+')
      try { await handle.sync() } finally { await handle.close() }
      const result = await digest(to)
      if (result.bytes !== original.bytes || result.sha256 !== original.sha256 ||
          (file.startsWith('assets/') && !basename(file).startsWith(result.sha256))) throw new Error(`文件校验失败：${file}`)
      entries.push({ path: file, ...result })
    }
    const manifest = await verifyVault(stage, files)
    if (expected && expected.vaultId !== manifest.id) throw new Error('备份清单与资料库不匹配')
    if (mode === 'snapshot') {
      const snapshot: Snapshot = { format: 'liftink-snapshot', version: 1, vaultId: manifest.id, files: entries }
      await replaceAtomic(join(stage, snapshotFile), JSON.stringify(snapshot))
    }
  })
}

async function readSnapshot(root: string, paths: string[]): Promise<Snapshot> {
  const value = await fileJson(join(root, snapshotFile), 60_000_000) as Snapshot | undefined
  if (value?.format !== 'liftink-snapshot' || value.version !== 1 || !Array.isArray(value.files) || value.files.length !== paths.length) {
    throw new Error('备份清单无效或缺少文件')
  }
  const actual = new Set(paths)
  for (const entry of value.files) {
    if (!entry || !actual.delete(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error('备份清单无效或缺少文件')
    }
  }
  return value
}
