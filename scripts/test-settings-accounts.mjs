// Actual settings component, synthetic accounts and mocked Windows vault IPC.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const output = resolve(process.env.EVIDENCE_DIR ?? '/tmp/flowisle-settings-evidence')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 420, height: 600 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('dialog', d => d.accept())
await page.route('http://127.0.0.1:1420/__settings_test', r => r.fulfill({ contentType: 'text/html', body: '<div id="app"><div id="test" class="panel-root"></div></div>' }))
try {
  await page.goto('http://127.0.0.1:1420/__settings_test')
  await page.evaluate(async () => {
    window.calls = []; window.savedSettings = null
    const vault = new Map([['qq:first@example.invalid:', true]])
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'panel' }, currentWebview: { label: 'panel' } }, transformCallback: () => 1,
      invoke: async (name, args, options) => {
        window.calls.push({ name, args })
        const key = args && `${args.provider}:${args.email}:${args.host}`
        if (name === 'email_credential_status') return vault.get(key) || false
        if (name === 'save_email_credential') { vault.set(key, true); return null }
        if (name === 'delete_email_credential') { vault.delete(key); return null }
        if (name === 'test_email_connection') return '连接成功（测试替身）'
        if (name === 'plugin:fs|read_text_file') return [...new TextEncoder().encode(JSON.stringify(args.path.endsWith('settings.json') ? { emailAddress: 'first@example.invalid', emailProvider: 'qq', emailEnabled: true, autoCheckUpdates: false, colorMode: 'light' } : []))]
        if (name === 'plugin:fs|write_text_file' && decodeURIComponent(options.headers.path).endsWith('settings.json')) window.savedSettings = JSON.parse(new TextDecoder().decode(args))
        if (name === 'plugin:event|listen') return 1
        if (name === 'probe_notification_sources') return []
        if (name === 'plugin:autostart|is_enabled') return false
        return null
      },
    }
    await import('/src/styles.css')
    const compiled = await (await fetch('/src/panel/SettingsPage.vue')).text()
    const vueUrl = compiled.match(/from "([^" ]*\/vue\.js[^" ]*)"/)[1]
    const { createApp, h } = await import(vueUrl)
    const { default: SettingsPage } = await import('/src/panel/SettingsPage.vue')
    const style = document.createElement('style')
    style.textContent = 'body{margin:0;background:repeating-linear-gradient(135deg,#4188a2 0 24px,#d59b6c 24px 48px,#646095 48px 72px)!important}#test{height:100vh;padding:14px 16px;background:var(--panel-shell-bg);font-family:Segoe UI,Microsoft YaHei,sans-serif;display:flex;flex-direction:column;box-sizing:border-box}.settings-page{flex:1;min-height:0}'
    document.head.append(style)
    createApp({ render: () => h(SettingsPage) }).mount('#test')
  })
  await page.getByText('first@example.invalid', { exact: true }).waitFor()
  await page.getByText('QQ 邮箱 · 授权码已保存', { exact: true }).waitFor()
  await page.getByRole('button', { name: '添加邮箱 ＋' }).click()
  await page.getByLabel('邮箱服务', { exact: true }).selectOption('163')
  assert.equal(await page.getByText('系统与社交通知', { exact: true }).isVisible(), false)
  await page.getByLabel('收件邮箱', { exact: true }).fill('second@example.invalid')
  await page.getByLabel('授权码', { exact: true }).fill('fixture-only-code')
  await page.getByRole('button', { name: '保存账号', exact: true }).click()
  await page.getByText('账号已保存，可与其他邮箱同时监听', { exact: true }).waitFor()
  await page.getByRole('button', { name: '← 邮箱列表' }).click()
  await page.getByText('163 邮箱 · 授权码已保存', { exact: true }).waitFor()
  assert.equal(await page.locator('.account-row').count(), 2)
  assert.equal(await page.locator('.account-row input:checked').count(), 2)
  await page.locator('.account-row').first().locator('button').click()
  await page.getByRole('button', { name: '清除此账号授权码' }).click()
  await page.getByText('已清除此账号的授权码，并暂停监听', { exact: true }).waitFor()
  await page.getByRole('button', { name: '← 邮箱列表' }).click()
  await page.getByText('163 邮箱 · 授权码已保存', { exact: true }).waitFor()
  assert.equal(await page.locator('.account-row input:checked').count(), 1)
  await page.waitForFunction(() => window.savedSettings?.emailAccounts?.length === 2 && window.savedSettings.emailAccounts[0].enabled === false)
  const persisted = await page.evaluate(() => window.savedSettings)
  assert.equal(persisted.emailAccounts[1].enabled, true)
  assert(!JSON.stringify(persisted).includes('fixture-only-code'))
  const calls = await page.evaluate(() => window.calls)
  assert.equal(calls.filter(c => c.name === 'delete_email_credential').length, 1)
  assert.equal(calls.find(c => c.name === 'delete_email_credential').args.email, 'first@example.invalid')
  for (const mode of ['light', 'dark']) {
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 600 })
      await page.evaluate(mode => document.documentElement.setAttribute('data-color-mode', mode), mode)
      await page.locator('.settings-page').evaluate(el => el.scrollTop = el.scrollHeight)
      const bounds = await page.locator('.settings-page').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
      assert(bounds.scroll <= bounds.width, `${mode}/${width} must fit`)
      await page.screenshot({ path: resolve(output, `settings-accounts-${mode}-${width}.png`) })
    }
  }
  await page.locator('.settings-page').evaluate(el => el.scrollTop = 0)
  await page.screenshot({ path: resolve(output, 'settings-notifications-top.png') })
  const hint = page.locator('.hint-trigger:visible').first()
  await hint.hover()
  await page.getByRole('tooltip').waitFor()
  const tip = await page.getByRole('tooltip').boundingBox()
  assert(tip.x >= 0 && tip.x + tip.width <= 420 && tip.y >= 0 && tip.y + tip.height <= 600)
  await page.screenshot({ path: resolve(output, 'settings-tooltip.png') })
  await page.mouse.move(0, 0)
  assert.equal(await page.getByRole('tooltip').count(), 0)
  await hint.focus()
  await page.getByRole('tooltip').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('tooltip').count(), 0)
  await page.getByRole('button', { name: '添加邮箱 ＋' }).click()
  await page.screenshot({ path: resolve(output, 'settings-account-editor.png') })
  await page.getByRole('button', { name: '← 邮箱列表' }).click()
  await page.getByRole('button', { name: '外观', exact: true }).click()
  assert.equal(await page.getByText('显示模式', { exact: true }).isVisible(), true)
  assert.equal(await page.getByText('邮箱通知', { exact: true }).isVisible(), false)
  await page.screenshot({ path: resolve(output, 'settings-appearance.png') })
  await page.getByRole('button', { name: '通用', exact: true }).click()
  await page.evaluate(() => document.documentElement.setAttribute('data-color-mode', 'light'))
  for (const mode of ['light', 'dark']) {
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 600 })
      await page.evaluate(mode => document.documentElement.setAttribute('data-color-mode', mode), mode)
      await page.locator('.settings-page').evaluate(el => el.scrollTop = 0)
      const alignment = await page.locator('.settings-section:visible .update-toggle-row').evaluateAll(rows => rows.map(row => {
        const label = row.querySelector('.update-label').getBoundingClientRect()
        const control = row.querySelector('.switch').getBoundingClientRect()
        return Math.abs(label.y + label.height / 2 - control.y - control.height / 2)
      }))
      assert(alignment.every(delta => delta <= 1), `toggle/label alignment: ${alignment}`)
      const bounds = await page.locator('.settings-page').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
      assert(bounds.scroll <= bounds.width)
      await page.screenshot({ path: resolve(output, `settings-general-${mode}-${width}.png`) })
    }
  }
  const textHint = page.getByRole('button', { name: '通知提示音', exact: true })
  assert.equal(await textHint.locator('svg').count(), 0, 'ordinary hints use the text itself')
  await textHint.hover()
  await page.getByRole('tooltip').filter({ hasText: '番茄钟或休息结束' }).waitFor()
  await page.screenshot({ path: resolve(output, 'settings-text-tooltip.png') })
  await page.mouse.move(0, 0)
  await page.getByRole('button', { name: '外观', exact: true }).click()
  assert.equal(await page.locator('.hint-trigger:visible svg').count(), 1, 'glass concept retains an info icon')

  assert.deepEqual(errors, [])
  console.log('PASS: legacy account migration, two independent account switches/statuses, saving second account preserves first, clearing first pauses only first, explicit credential parameters, persisted account toggles without secrets, isolated editor, category navigation, 320/420 light/dark layout on busy background, hover/focus/Escape tooltip and viewport bounds, text-trigger hints without icons, glass info icon retained, general controls aligned within 1 px in both themes at 320/420. IPC/vault simulated; Windows vault tested separately.')
} catch (error) { await page.screenshot({ path: resolve(output, 'settings-failure.png') }); console.error(errors); throw error } finally { await browser.close() }
