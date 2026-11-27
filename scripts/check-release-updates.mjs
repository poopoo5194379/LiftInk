import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-release-updates-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const liveVersion = process.env.LIFTINK_TEST_RELEASE_VERSION
const app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
const mac = process.platform === 'darwin'

try {
  const page = await app.firstWindow()
  const currentVersion = await app.evaluate(({ app }) => app.getVersion())
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: /^版本更新/ }).click()
  const updates = page.getByRole('region', { name: '版本更新' })
  await expect(updates).toContainText(`当前版本 LiftInk ${currentVersion}`)
  const status = updates.getByRole('status')
  const check = updates.getByRole('button', { name: '检查更新' })
  const download = updates.getByRole('button', { name: mac ? '下载 Mac 安装包' : '下载 Windows 安装包' })
  const suffix = mac ? `-mac-${process.arch}.dmg` : '-setup.exe'
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => { globalThis.openedReleaseUrl = url }
  })

  if (liveVersion) {
    await app.evaluate(({ app }) => { app.getVersion = () => '1.0.0' })
    await check.click()
    await expect(status).toHaveText(`发现新版本 LiftInk ${liveVersion}`, { timeout: 15_000 })
    await download.click()
    await expect.poll(() => app.evaluate(() => globalThis.openedReleaseUrl)).toBe(
      `https://github.com/poopoo5194379/LiftInk/releases/download/v${liveVersion}/LiftInk-${liveVersion}${suffix}`
    )
    await app.evaluate(({ app }, version) => { app.getVersion = () => version }, liveVersion)
    await check.click()
    await expect(status).toHaveText('当前已是最新版本。', { timeout: 15_000 })
  } else {
    await app.evaluate(({ net }, { suffix, otherSuffix }) => {
      net.fetch = async (url, options) => {
        globalThis.releaseRequest = { url, options }
        return globalThis.mockReleaseBody === null
          ? new Response('', { status: 503 })
          : Response.json(globalThis.mockReleaseBody.map(({ version, draft = false, state = 'uploaded', installer = true, otherPlatform = false }) => ({
            tag_name: `v${version}`,
            draft,
            assets: installer ? [{ name: `LiftInk-${version}${otherPlatform ? otherSuffix : suffix}`, state }] : []
          })))
      }
    }, { suffix, otherSuffix: mac ? (process.arch === 'arm64' ? '-mac-x64.dmg' : '-mac-arm64.dmg') : '-mac-arm64.dmg' })
    await app.evaluate((_, body) => { globalThis.mockReleaseBody = body }, [
      { version: '9.0.0', draft: true }, { version: '8.0.0', state: 'starter' },
      { version: '7.0.0-rc.1' }, { version: '6.0.0', installer: false },
      { version: '4.0.0', otherPlatform: true }, { version: '2.9.0' }, { version: '2.10.0' }
    ])
    await check.click()
    await expect(status).toHaveText('发现新版本 LiftInk 2.10.0')
    assert.deepEqual(await app.evaluate(() => ({
      url: globalThis.releaseRequest.url,
      credentials: globalThis.releaseRequest.options.credentials
    })), { url: 'https://api.github.com/repos/poopoo5194379/LiftInk/releases?per_page=100', credentials: 'omit' })
    await download.click()
    await expect.poll(() => app.evaluate(() => globalThis.openedReleaseUrl)).toBe(
      `https://github.com/poopoo5194379/LiftInk/releases/download/v2.10.0/LiftInk-2.10.0${suffix}`
    )
    await assert.rejects(page.evaluate(() => window.liftInk.downloadRelease('https://example.com')), /无效的版本号/)
    for (const [body, message] of [
      [null, '无法从 GitHub 检查更新，请稍后重试。'],
      [[{ version: currentVersion }], '当前已是最新版本。'],
      [[], 'GitHub 目前没有适合此系统的安装包。']
    ]) {
      await app.evaluate((_, body) => { globalThis.mockReleaseBody = body }, body)
      await check.click()
      await expect(status).toHaveText(message)
      await expect(download).toHaveCount(0)
    }
  }
  console.log(`Release updates passed (${liveVersion ? 'GitHub' : 'fixtures'})`)
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
