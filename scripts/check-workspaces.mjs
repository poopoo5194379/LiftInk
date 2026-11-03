import { strict as assert } from 'node:assert'
import { _electron as electron } from '@playwright/test'

const app = await electron.launch({ args: ['.'] })
try {
  const page = await app.firstWindow()
  await page.waitForSelector('.note-card')
  await page.getByRole('button', { name: 'Tags', exact: true }).click()
  assert.equal(await page.getByRole('region', { name: 'Tags 页面' }).isVisible(), true)
  await page.getByRole('button', { name: /设计 1/ }).click()
  assert.equal(await page.locator('.tags-note-list > button').count(), 1)
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  assert.equal(await page.locator('.note-card').count(), 4)

  await page.getByRole('button', { name: '查看全部日程' }).click()
  assert.equal(await page.getByRole('region', { name: '日程详情页面' }).isVisible(), true)
  assert.equal(await page.locator('.agenda-detail-item').count(), 3)
  await page.getByRole('button', { name: '完成 项目周会' }).click()
  assert.equal(await page.getByText('1 / 3 项').count(), 1)
  await page.getByRole('button', { name: '返回首页' }).click()

  await page.getByRole('button', { name: '新建笔记' }).click()
  assert.match(await page.getByRole('button', { name: '笔记位置' }).innerText(), /未分类/)
  await page.getByRole('button', { name: '笔记位置' }).click()
  await page.getByRole('textbox', { name: '搜索分区' }).fill('视觉研究')
  await page.getByRole('option', { name: /视觉研究/ }).click()
  assert.match(await page.getByRole('button', { name: '笔记位置' }).innerText(), /视觉研究/)
  await page.getByRole('button', { name: '返回上一页' }).click()

  await page.getByRole('button', { name: '语音速记' }).click()
  assert.equal(await page.getByRole('region', { name: '语音速记页面' }).isVisible(), true)
  await page.getByRole('textbox', { name: '速记文字' }).fill('今天讨论了新的首页布局。')
  await page.getByRole('button', { name: '保存到未分类' }).click()
  assert.equal(await page.getByRole('region', { name: '最近文件列表' }).isVisible(), true)
  await page.locator('.recent-file-row').first().click()
  assert.equal(
    await page.getByRole('textbox', { name: '速记文字' }).inputValue(),
    '今天讨论了新的首页布局。'
  )
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '返回首页' }).click()

  await page.getByRole('button', { name: '新建思维导图' }).click()
  await page.getByRole('button', { name: '添加分支' }).click()
  assert.equal(await page.locator('.mindmap-canvas input').count(), 4)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '新建白板' }).click()
  await page.getByRole('button', { name: '添加文字块' }).click()
  assert.equal(await page.locator('.whiteboard-canvas textarea').count(), 2)
  await page.getByRole('button', { name: '返回', exact: true }).click()

  await page.getByRole('button', { name: '导入 PDF/图片' }).click()
  assert.equal(await page.getByRole('region', { name: '导入 PDF / 图片页面' }).isVisible(), true)
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('liftink:choose-imports')
    ipcMain.handle('liftink:choose-imports', () => [
      { name: '样张.pdf', kind: 'pdf' },
      { name: '草图.png', kind: 'image' }
    ])
  })
  await page.getByRole('button', { name: '选择文件' }).click()
  await page.getByRole('region', { name: '最近文件列表' }).waitFor({ state: 'visible' })
  assert.equal(await page.getByRole('region', { name: '最近文件列表' }).isVisible(), true)
  await page.getByRole('button', { name: '图片', exact: true }).click()
  assert.equal(await page.locator('.recent-file-row').count(), 1)
  console.log(
    'Workspaces passed: Home, Tags, agenda, folder picker, voice, map, board and import listing'
  )
} finally {
  await app.close()
}
