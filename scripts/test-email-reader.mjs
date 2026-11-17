// Actual Vue components in Chromium; only Tauri IPC and mail content are fixtures.
// Start npm run vite:dev first. Uses an external Playwright install, no app dependency.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const output = resolve(process.env.EVIDENCE_DIR ?? '/tmp/flowisle-reader-evidence')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 420, height: 600 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
let remoteRequests = 0
await page.route('https://images.example.invalid/**', route => { remoteRequests++; return route.abort() })
await page.route('http://127.0.0.1:1420/__reader_test', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body><div id="app"><div id="test" class="panel-root"></div></div></body></html>' }))
try {
  await page.goto('http://127.0.0.1:1420/__reader_test')
  await page.evaluate(async () => {
    window.fixtureCalls = []
    window.readerMode = 'html'
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "panel" }, currentWebview: { label: "panel" } },
      transformCallback: () => 1,
      invoke: async (name, args) => {
        window.fixtureCalls.push({ name, args })
        if (name === 'read_email_body') {
          if (window.readerMode === 'error') throw '邮件已移除，请在网页邮箱中查看'
          if (window.readerMode === 'pending') return new Promise(resolve => { window.finishBody = resolve })
          if (window.readerMode === 'cid') return { contentType: 'text/html', content: '<p>嵌入图片</p><img alt=\"课程示意\" src=\"cid:course\">', images: args.includeImages ? [['course', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR9sAAAAASUVORK5CYII=']] : [] }
          if (window.readerMode === 'complex') return { contentType: 'text/html', content: '<table role="presentation"><tr><td><table><tr><td><h2>本周阅读 · Newsletter</h2><p>窄面板内的复杂邮件：多层排版表格、作者图片和社交链接。</p><table role="presentation"><tr><td><img alt="作者头像" src="https://images.example.invalid/author.png"></td><td>课程通讯 · November</td></tr></table><p>正文保持自然阅读，排版单元格不再重复添加分割线。</p><table role="presentation"><tr>' + ['X', 'LinkedIn', 'Discord', 'YouTube', 'RSS'].map(label => '<td><a href="https://example.com/' + label + '"><img alt="' + label + '" src="https://images.example.invalid/' + label + '.png"></a></td>').join('') + '</tr></table><h3>数据表格</h3><table><tr>' + Array.from({ length: 8 }, (_, i) => '<th>课程栏目 ' + i + '</th>').join('') + '</tr><tr>' + '<td>完整内容保留</td>'.repeat(8) + '</tr></table></td></tr></table></td></tr></table>' }
          if (window.readerMode === 'plain') return { contentType: 'text/plain', content: '纯文本正文\n<script>不会执行</script>' }
          return { contentType: 'text/html', content: '<h2>课程安排与资料</h2><p>你好，这是一封用于界面验收的测试邮件。</p><table><tr><th>时间</th><th>安排</th></tr><tr><td>星期一</td><td>设计讨论 · 请准备草稿与问题</td></tr></table><p><a href="https://example.com/course">查看课程资料</a></p><img src="https://images.example.invalid/pixel.png"><script>window.pwned=true</script><img src="x" onerror="window.pwned=true"><svg onload="window.pwned=true"></svg><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">不安全链接</a><form><input autofocus></form><div style="position:fixed;inset:0">安全文本</div>' + '<p>长正文：保留原列表位置，阅读区单独滚动。</p>'.repeat(30) }
        }
        if (name === 'plugin:fs|read_text_file') {
          const records = Array.from({ length: 25 }, (_, i) => ({ id: 'email-0123456789abcdef-' + (100 - i), kind: 'email', emailProvider: 'qq', emailAccountId: 'fixture-qq', emailAccountAddress: 'course@example.invalid', app: 'QQ 邮箱', title: i ? `测试邮件 ${i}` : '下周课程安排与资料领取说明', detail: '课程助理 · 测试发件人', time: Date.now() - i * 3600000, read: i > 0 }))
          const value = args.path.endsWith('notifications.json') ? records : args.path.endsWith('settings.json') ? { colorMode: 'light', activeThemeId: 'liquid' } : []
          return [...new TextEncoder().encode(JSON.stringify(value))]
        }
        if (name === 'get_volume_state') return { volume: 0.4, muted: false }
        if (name === 'plugin:event|listen') return 1
        return null
      },
    }
    await import('/src/styles.css')
    const compiled = await (await fetch('/src/panel/NotificationsPage.vue')).text()
    const vueUrl = compiled.match(/from "([^" ]*\/vue\.js[^" ]*)"/)[1]
    const { createApp, h, KeepAlive, ref } = await import(vueUrl)
    const { default: NotificationsPage } = await import('/src/panel/NotificationsPage.vue')
    const style = document.createElement('style')
    style.textContent = '#test{height:100vh;padding:16px 18px;background:var(--v2-surface);font-family:Arial,"Microsoft YaHei",sans-serif;display:flex;flex-direction:column;box-sizing:border-box} .notif-page{height:100%;min-height:0}'
    document.head.append(style)
    window.readerPageVisible = ref(true)
    createApp({ render: () => h(KeepAlive, null, { default: () => window.readerPageVisible.value ? h(NotificationsPage) : h('div', 'Other page') }) }).mount('#test')
  })
  await page.locator('.notif-item').first().waitFor()
  const heading = await page.locator('.section-head .section-title').evaluate(el => { const s = getComputedStyle(el); return { size: s.fontSize, font: s.fontFamily, weight: Number(s.fontWeight) } })
  const action = await page.locator('.record-tools .text-btn').first().evaluate(el => { const s = getComputedStyle(el); return { size: s.fontSize, font: s.fontFamily, weight: Number(s.fontWeight) } })
  assert.equal(heading.size, action.size); assert.equal(heading.font, action.font); assert(heading.weight > action.weight)
  await page.screenshot({ path: resolve(output, 'notifications-list.png') })
  await page.locator('.notif-item').first().click()
  await page.locator('.reader-body').waitFor()
  assert.equal(await page.locator('.reader-body script, .reader-body iframe, .reader-body svg, .reader-body input, .reader-body [style], .reader-body [onerror], .reader-body img').count(), 0)
  assert.equal(remoteRequests, 0)
  assert((await page.locator('.reader-meta').textContent()).includes('course@example.invalid'))
  assert(await page.evaluate(() => window.fixtureCalls.some(c => c.name === 'read_email_body' && c.args.accountId === 'fixture-qq')))
  assert.equal(await page.evaluate(() => Boolean(window.pwned)), false)
  assert.equal(await page.locator('.reader-body a').nth(1).getAttribute('href'), null)
  await page.screenshot({ path: resolve(output, 'reader-light-420.png') })
  await page.locator('.reader-body a').first().click()
  assert(await page.evaluate(() => window.fixtureCalls.some(call => call.name === 'plugin:shell|open' && call.args.path === 'https://example.com/course')))
  await page.getByRole('button', { name: '加载图片', exact: true }).click()
  await page.getByText('图片可能已过期、需要登录或被服务器拒绝，可打开网页邮箱查看').waitFor()
  assert(await page.locator('.mail-image-placeholder').count() > 0)
  assert(remoteRequests > 0)
  for (const width of [320, 420]) {
    await page.setViewportSize({ width, height: 600 })
    await page.evaluate(() => { document.documentElement.setAttribute('data-color-mode', 'dark') })
    const bounds = await page.locator('.reader-scroll').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight }))
    assert(bounds.width >= bounds.scroll, 'reader must not overflow horizontally')
    assert(bounds.height < bounds.scrollHeight, 'body must scroll independently')
    await page.screenshot({ path: resolve(output, `reader-dark-${width}.png`) })
  }
  await page.getByRole('button', { name: '← 返回列表', exact: true }).click()
  await page.getByRole('button', { name: /展开剩余/ }).click()
  const initialScroll = await page.locator('.notif-scroll').evaluate(el => { el.scrollTop = 180; return el.scrollTop })
  await page.locator('.notif-item').nth(3).click()
  await page.locator('.reader-body').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.notif-scroll').evaluate(el => el.scrollTop), initialScroll)
  assert.equal(await page.locator('.notif-item').nth(3).evaluate(el => el === document.activeElement), true)
  await page.evaluate(() => { window.readerMode = 'complex'; document.documentElement.setAttribute('data-color-mode', 'light') })
  await page.locator('.notif-item').first().click()
  await page.getByRole('heading', { name: '本周阅读 · Newsletter' }).waitFor()
  for (const width of [320, 420]) {
    await page.setViewportSize({ width, height: 600 })
    await page.screenshot({ path: resolve(output, `reader-complex-${width}.png`) })
    const metrics = await page.locator('.reader-body').evaluate(el => ({
      placeholders: [...el.querySelectorAll('.mail-image-placeholder')].map(p => ({ width: p.getBoundingClientRect().width, height: p.getBoundingClientRect().height })),
      width: el.clientWidth, scroll: el.scrollWidth,
      dataScroll: el.querySelector('.mail-data-table')?.scrollWidth,
      dataWidth: el.querySelector('.mail-data-table')?.clientWidth,
    }))
    console.log('Complex newsletter metrics:', width, JSON.stringify(metrics))
    assert.equal(metrics.placeholders.length, 6)
    assert(metrics.placeholders.every(p => p.width >= 80 && p.height < 60), 'image placeholders must remain readable, not vertical strips')
    assert(metrics.scroll <= metrics.width, 'nested newsletter must fit the reader')
    assert(metrics.dataScroll > metrics.dataWidth, 'wide data table must scroll in its own container')
  }
  await page.getByRole('button', { name: '加载图片', exact: true }).click()
  await page.getByText('图片可能已过期、需要登录或被服务器拒绝，可打开网页邮箱查看').waitFor()
  await page.screenshot({ path: resolve(output, 'reader-complex-images-failed.png') })
  await page.getByRole('button', { name: '← 返回列表', exact: true }).click()
  await page.evaluate(() => { window.readerMode = 'cid' })
  await page.locator('.notif-item').first().click()
  await page.locator('.mail-image-placeholder').waitFor()
  assert.equal(await page.locator('.reader-body img').count(), 0)
  await page.getByRole('button', { name: '加载图片', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.reader-body img')?.naturalWidth === 1)
  assert.equal(await page.locator('.mail-image-placeholder').count(), 0)
  await page.getByRole('button', { name: '← 返回列表', exact: true }).click()
  await page.evaluate(() => { window.readerMode = 'error' })
  await page.locator('.notif-item').first().click()
  await page.getByRole('alert').filter({ hasText: '邮件已移除' }).waitFor()
  await page.screenshot({ path: resolve(output, 'reader-error.png') })
  await page.evaluate(() => { window.readerMode = 'plain' })
  await page.getByRole('button', { name: '重新加载' }).click()
  assert((await page.locator('.reader-text').textContent()).includes('<script>不会执行</script>'))
  await page.getByRole('button', { name: '← 返回列表' }).click()
  await page.evaluate(() => { window.readerMode = 'pending' })
  await page.locator('.notif-item').first().click()
  await page.getByRole('status').filter({ hasText: '正在读取' }).waitFor()
  await page.getByRole('button', { name: '← 返回列表' }).click()
  await page.evaluate(() => { window.readerMode = 'plain' })
  await page.locator('.notif-item').nth(1).click()
  await page.locator('.reader-text').waitFor()
  await page.evaluate(() => window.finishBody({ contentType: 'text/plain', content: 'stale-response' }))
  assert(!(await page.locator('.reader-text').textContent()).includes('stale-response'))
  await page.evaluate(() => { window.readerPageVisible.value = false })
  await page.getByText('Other page', { exact: true }).waitFor()
  await page.evaluate(() => { window.readerPageVisible.value = true })
  await page.locator('.notif-scroll').waitFor()
  assert.equal(await page.locator('.email-reader').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: actual Vue reader/list navigation, HTML sanitization, external images blocked until consent, CID raster displayed after consent, failed images replaced, matching heading/action font sizes, safe external links, 320/420 layout, scroll/focus restoration, error/retry, plaintext escaping, stale request rejection, cached-page body cleanup; Tauri IPC is simulated.')
} finally { await browser.close() }
