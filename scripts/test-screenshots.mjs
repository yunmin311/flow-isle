// Actual Vue component/store; clipboard and files are synthetic IPC fixtures.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const output = resolve(process.env.EVIDENCE_DIR ?? '/tmp/flowisle-screenshot-evidence')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 420, height: 600 } })
page.setDefaultTimeout(120000)
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.route('http://127.0.0.1:1420/__screenshots_test', r => r.fulfill({ contentType: 'text/html', body: '<div id="app"><div id="test" class="panel-root"></div></div>' }))
async function mount() {
  await page.goto('http://127.0.0.1:1420/__screenshots_test')
  await page.evaluate(async () => {
    window.fixture = { sequence: 1, has_image: true, width: 800, height: 450, color: '#337baa' }
    window.files = JSON.parse(localStorage.getItem('fixture-files') || '{}')
    window.callbacks = []; window.events = {}; window.writes = []; window.reads = 0; window.closed = 0
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'panel' }, currentWebview: { label: 'panel' } },
      transformCallback: callback => { window.callbacks.push(callback); return window.callbacks.length - 1 },
      invoke: async (name, args, options) => {
        if (name === 'plugin:event|listen') { window.events[args.event] = window.callbacks[args.handler]; return 1 }
        if (name === 'get_volume_state') return { volume: 0.4, muted: false }
        if (name === 'clipboard_image_state') return { sequence: window.fixture.sequence, has_image: window.fixture.has_image }
        if (name === 'plugin:clipboard-manager|read_image') { window.reads++; if (window.failRead) throw Error('fixture busy'); return 1 }
        if (name === 'plugin:image|size') return { width: window.fixture.width, height: window.fixture.height }
        if (name === 'plugin:image|rgba') {
          const c = document.createElement('canvas'); c.width = window.fixture.width; c.height = window.fixture.height
          const ctx = c.getContext('2d'); ctx.fillStyle = window.fixture.color; ctx.fillRect(0, 0, c.width, c.height)
          ctx.fillStyle = '#fff'; ctx.font = 'bold 32px sans-serif'; ctx.fillText('FlowIsle screenshot fixture', 20, 65)
          return ctx.getImageData(0, 0, c.width, c.height).data
        }
        if (name === 'plugin:resources|close') { window.closed++; return }
        if (name === 'copy_screenshot_image') {
          if (window.failCopy) throw Error('fixture busy')
          window.writes.push(args.png)
          window.fixture.sequence++
          window.events['clipboard-image-changed']({ payload: { ...window.fixture } })
          await new Promise(resolve => setTimeout(resolve, 50))
          return window.fixture.sequence
        }
        if (name === 'plugin:fs|exists') return args.path in window.files
        if (name === 'plugin:fs|read_text_file') { if (!(args.path in window.files)) throw Error('fixture missing'); return Array.from(new TextEncoder().encode(window.files[args.path])) }
        if (name === 'plugin:fs|write_text_file') { if (!decodeURIComponent(options.headers.path).startsWith('focus-island/screenshots/')) return; if (window.failSave) throw Error('fixture full'); window.files[decodeURIComponent(options.headers.path)] = new TextDecoder().decode(args); localStorage.setItem('fixture-files', JSON.stringify(window.files)); return }
        if (name === 'plugin:fs|remove') { if (args.path === window.failRemovePath) throw Error('fixture access denied'); delete window.files[args.path]; localStorage.setItem('fixture-files', JSON.stringify(window.files)); return }
        return null
      },
    }
    await import('/src/styles.css')
    const compiled = await (await fetch('/src/panel/ScreenshotShelf.vue')).text()
    const vueUrl = compiled.match(/from "([^" ]*\/vue\.js[^" ]*)"/)[1]
    const { createApp, h } = await import(vueUrl)
    const { default: ScreenshotShelf } = await import('/src/panel/ScreenshotShelf.vue')
    const style = document.createElement('style')
    style.textContent = 'body{margin:0;background:repeating-linear-gradient(135deg,#4188a2 0 24px,#d59b6c 24px 48px,#646095 48px 72px)!important}#app #test{min-height:100vh;padding:16px;background:var(--panel-shell-bg);font-family:Segoe UI,Microsoft YaHei,sans-serif;box-sizing:border-box}'
    document.head.append(style)
    window.fixtureApp = createApp({ render: () => h(ScreenshotShelf) }); window.fixtureApp.mount('#test')
    window.shots = (await import('/src/composables/useScreenshots.ts')).useScreenshots()
    window.theme = (await import('/src/composables/useSettings.ts')).useSettings()
  })
  await page.waitForFunction(() => !!window.events['clipboard-image-changed'] && window.theme.settingsReady.value)
}
async function capture(patch = {}) {
  await page.evaluate(patch => {
    Object.assign(window.fixture, patch)
    window.fixture.sequence++
    window.events['clipboard-image-changed']({ payload: { ...window.fixture } })
  }, patch)
}
async function count(n) { await page.waitForFunction(n => window.shots.records.value.length === n, n) }
try {
  await mount()
  assert.equal(await page.evaluate(() => window.reads), 0, 'do not harvest pre-start clipboard')
  await capture(); await count(1)
  assert.equal(await page.locator('.screenshot-preview img').evaluate(el => el.naturalWidth), 320)
  const readsBeforeCopy = await page.evaluate(() => window.reads)
  await page.getByRole('button', { name: '复制原图', exact: true }).click()
  await page.getByText('原图已复制，可直接粘贴').waitFor()
  const size = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(window.writes.at(-1))], { type: 'image/png' }))
    const result = [bitmap.width, bitmap.height]; bitmap.close(); return result
  })
  assert.deepEqual(size, [800, 450], 'copy full resolution rather than thumbnail')
  await page.evaluate(() => window.events['clipboard-image-changed']({ payload: { ...window.fixture } }))
  await page.waitForTimeout(200)
  assert.equal(await page.evaluate(() => window.reads), readsBeforeCopy, 'skip own write before and after IPC returns, without reading pixels')
  await page.getByText('默认开启 · 包含普通图片 · 仅本机保存', { exact: true }).waitFor()
  await capture(); await page.waitForTimeout(400); await count(1)
  await page.getByRole('checkbox').uncheck()
  const reads = await page.evaluate(() => window.reads)
  await capture({ color: '#dd4455' }); await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.reads), reads, 'disabled collection must not read clipboard')
  await mount()
  assert.equal(await page.getByRole('checkbox').isChecked(), false)
  await count(1)
  await page.getByRole('checkbox').check()
  await capture({ width: 240, height: 1400, color: '#529264' }); await count(2)
  for (const mode of ['light', 'dark']) for (const width of [320, 420]) {
    await page.setViewportSize({ width, height: 600 })
    await page.evaluate(mode => { window.theme.settings.value.colorMode = mode; window.theme.applyThemeToDOM() }, mode)
    const bounds = await page.locator('.screenshot-shelf').evaluate(el => [el.clientWidth, el.scrollWidth])
    assert(bounds[1] <= bounds[0])
    await page.screenshot({ path: resolve(output, `screenshots-${mode}-${width}.png`) })
  }
  await page.evaluate(() => window.failCopy = true)
  await page.getByRole('button', { name: '复制原图', exact: true }).first().click()
  await page.getByText('复制失败，原图可能已被移除，请重新截图').waitFor()
  await page.evaluate(() => window.failCopy = false)
  await capture({ color: '#ff3344' }); await count(3)
  // Capture failure must not obscure the next successful user operation.
  await capture({ width: 5000, height: 5000 }); await page.getByRole('alert').waitFor()
  await page.getByRole('button', { name: '复制原图', exact: true }).first().click()
  await page.getByText('原图已复制，可直接粘贴').waitFor()
  assert.equal(await page.getByRole('alert').count(), 0)
  await capture({ width: 5000, height: 5000 }); await page.getByRole('alert').waitFor()
  await page.getByRole('checkbox').uncheck()
  await page.waitForFunction(() => !window.shots.error.value)
  assert.equal(await page.getByRole('status').count(), 0)
  await page.getByRole('checkbox').check()
  await capture({ width: 5000, height: 5000 }); await page.getByRole('alert').waitFor()
  await page.getByRole('button', { name: '移除', exact: true }).first().click(); await count(2)
  assert.equal(await page.getByRole('alert').count(), 0)
  const firstId = await page.evaluate(() => window.shots.records.value[0].id)
  await page.getByRole('button', { name: '移除', exact: true }).first().click(); await count(1)
  assert.equal(await page.evaluate(id => `focus-island/screenshots/${id}.json` in window.files, firstId), false)
  await capture({ width: 5000, height: 5000 }); await page.getByText('图片超过 2000 万像素，未收集').waitFor(); await count(1)
  await page.evaluate(() => window.failRead = true)
  await capture({ width: 800, height: 450 }); await page.getByText('截图读取或保存失败，请重新复制图片后重试').waitFor(); await count(1)
  await page.evaluate(() => { window.failRead = false; window.failSave = true })
  await capture({ color: '#ff88ff' }); await page.waitForTimeout(900); await count(1)
  await page.evaluate(() => window.failSave = false)
  for (let i = 0; i < 22; i++) {
    await capture({ width: 80, height: 45, color: `rgb(${i * 10}, 50, 100)` })
    await count(Math.min(i + 2, 20)); await page.waitForTimeout(40)
  }
  assert.equal(await page.evaluate(() => Object.keys(window.files).filter(p => !p.endsWith('index.json')).length), 20)
  await page.evaluate(() => {
    const path = 'focus-island/screenshots/index.json'; const data = JSON.parse(window.files[path]); data.records[0].time = Date.now() - 8 * 86400000
    window.files[path] = JSON.stringify(data); localStorage.setItem('fixture-files', JSON.stringify(window.files))
  })
  await mount(); await count(19)
  assert.equal(await page.evaluate(() => Object.keys(window.files).filter(p => !p.endsWith('index.json')).length), 19)
  // Clear requires confirmation, deletes originals, persists, and retains failed deletions.
  await page.getByRole('button', { name: '清空全部截图', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click(); await count(19)
  await page.evaluate(() => window.failRemovePath = `focus-island/screenshots/${window.shots.records.value[0].id}.json`)
  await page.getByRole('button', { name: '清空全部截图', exact: true }).click()
  await page.getByRole('button', { name: '确认清空', exact: true }).click()
  await page.getByText('部分截图未能清空，请重试').waitFor(); await count(1)
  assert.equal(await page.evaluate(() => Object.keys(window.files).filter(p => !p.endsWith('index.json')).length), 1)
  await page.evaluate(() => window.failRemovePath = null)
  await page.getByRole('button', { name: '清空全部截图', exact: true }).click()
  await page.getByRole('button', { name: '确认清空', exact: true }).click()
  await page.getByText('全部截图及本机原图已清空').waitFor(); await count(0)
  assert.equal(await page.evaluate(() => Object.keys(window.files).filter(p => !p.endsWith('index.json')).length), 0)
  await mount(); await count(0)
  assert(await page.getByRole('checkbox').isChecked(), 'clear must not change collection setting')
  assert(await page.getByRole('button', { name: '清空全部截图', exact: true }).isDisabled())
  await capture(); await count(1)
  // Also render the actual notifications page, so global styles and neighboring sections are exercised.
  await page.setViewportSize({ width: 420, height: 650 })
  await page.evaluate(async () => {
    window.fixtureApp.unmount()
    const compiled = await (await fetch('/src/panel/NotificationsPage.vue')).text()
    const vueUrl = compiled.match(/from "([^" ]*\/vue\.js[^" ]*)"/)[1]
    const { createApp, h } = await import(vueUrl)
    const { default: NotificationsPage } = await import('/src/panel/NotificationsPage.vue')
    window.fixtureApp = createApp({ render: () => h(NotificationsPage) }); window.fixtureApp.mount('#test')
    Object.assign(document.querySelector('#test').style, { height: '650px', display: 'flex', flexDirection: 'column' })
  })
  await page.locator('.screenshot-shelf').waitFor()
  assert(await page.locator('.notif-scroll').evaluate(el => el.clientHeight > 200), 'integrated scroll area must have usable height')
  for (const mode of ['light', 'dark']) {
    await page.evaluate(mode => { window.theme.settings.value.colorMode = mode; window.theme.applyThemeToDOM() }, mode)
    await page.screenshot({ path: resolve(output, `notifications-screenshots-${mode}.png`) })
  }
  assert.deepEqual(errors, [])
  console.log('PASS: own-write sequence race and delayed echo skipped without pixel read; next external capture and failed-copy recovery; stale errors cleared on copy/remove/toggle; visible scope disclosure; clear cancel/partial failure/retry/files/restart; skip startup contents; thumbnail; full-resolution PNG copy; dedup; pause and persisted switch; restart history; tall/wide images at 320/420 light/dark; copy/read/save errors; original removal; pixel cap; 20-item eviction and file cleanup; seven-day expiration. Real Vue/canvas, synthetic clipboard/files; not native clipboard proof.')
} finally { await browser.close() }
