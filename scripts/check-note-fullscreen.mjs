import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-fullscreen-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const app = await electron.launch({
  ...(executablePath ? { executablePath } : { args: ['.'] }),
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root }
})

try {
  const page = await app.firstWindow()
  await page.getByRole('button', { name: '新建笔记' }).click()
  const editor = page.getByRole('region', { name: '笔记页面', exact: true })
  const canvas = editor.getByRole('img', { name: '笔记画布' }).first()
  const toolbar = editor.getByRole('toolbar', { name: '书写工具' })
  await canvas.waitFor()
  await editor.getByRole('button', { name: '展开页面缩略图' }).click()
  await editor.locator('.editor-topbar').getByRole('button', { name: '全屏笔记' }).click()
  await expect(page.locator('.editor-view:fullscreen')).toHaveCount(1)
  await expect(toolbar).toBeVisible()
  await expect(canvas).toBeVisible()
  await expect(editor.locator('.editor-topbar')).toBeHidden()
  await expect(editor.locator('.editor-page-manager')).toBeHidden()
  await expect(editor.locator('.editor-statusbar')).toBeHidden()
  await toolbar.getByRole('button', { name: '笔刷设置' }).click()
  await expect(editor.getByRole('dialog', { name: '笔刷设置' })).toBeVisible()
  await editor.getByRole('button', { name: '笔迹对照' }).click()
  await expect(editor.getByRole('dialog', { name: '笔迹对照' })).toBeVisible()
  await editor.getByRole('button', { name: '关闭', exact: true }).click()
  await canvas.click({ position: { x: 150, y: 140 } })
  await expect(canvas.locator('path')).toHaveCount(1)
  await toolbar.getByRole('button', { name: '退出全屏' }).click()
  await expect(editor.locator('.editor-topbar')).toBeVisible()
  await expect(editor.locator('.editor-page-manager')).toBeVisible()
  await expect(editor.locator('.editor-statusbar')).toBeVisible()
  await expect(canvas.locator('path')).toHaveCount(1)
  await page.keyboard.press('F11')
  await expect(page.locator('.editor-view:fullscreen')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('.editor-view:fullscreen')).toHaveCount(0)
  console.log('Note fullscreen passed: layout, brush tools, drawing, restored panels, F11 and Escape')
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
