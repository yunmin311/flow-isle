// 轻量「液态高光 × 像素微粒」粒子层：
// 与 PixelTime / 陪伴动物共用 3px 像素格基准，仅在关键节点（开始/完成专注、完成任务、收藏星标、电台开播）轻触发，
// 全程 pointer-events: none 并按 prefers-reduced-motion 自动静默。

export type SparkTone = 'accent' | 'break' | 'gold' | 'specular'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
  maxLife: number
}

let overlayCanvas: HTMLCanvasElement | null = null
let rafId: number | null = null
const particles: Particle[] = []
let lastTs = 0

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function paletteFor(tone: SparkTone): string[] {
  const accent = readCssVar('--v2-accent', '#ad461e')
  const brk = readCssVar('--v2-break', '#537b51')
  const alert = readCssVar('--v2-alert', '#c96a32')
  const ink = readCssVar('--v2-ink', '#35291f')
  const specular = 'rgba(255, 255, 255, 0.92)'
  if (tone === 'break') return [brk, brk, specular, accent]
  if (tone === 'gold') return [alert, accent, specular, ink]
  if (tone === 'specular') return [specular, accent, brk]
  return [accent, accent, specular, alert]
}

function ensureCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  if (overlayCanvas && document.body.contains(overlayCanvas)) return overlayCanvas
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;'
  document.body.appendChild(canvas)
  overlayCanvas = canvas
  return canvas
}

function tick(now: number) {
  const canvas = overlayCanvas
  if (!canvas) {
    rafId = null
    return
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    rafId = null
    return
  }

  const dt = lastTs ? Math.min(32, now - lastTs) : 16
  lastTs = now
  const dtNorm = dt / 16.67

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life += dt
    if (p.life >= p.maxLife) {
      particles.splice(i, 1)
      continue
    }
    p.vx *= Math.pow(0.93, dtNorm)
    p.vy = p.vy * Math.pow(0.93, dtNorm) + 0.045 * dtNorm
    p.x += p.vx * dtNorm
    p.y += p.vy * dtNorm

    const t = p.life / p.maxLife
    const alpha = t < 0.18 ? t / 0.18 : Math.max(0, 1 - Math.pow((t - 0.18) / 0.82, 1.5))
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    const px = Math.round(p.x - p.size / 2)
    const py = Math.round(p.y - p.size / 2)
    ctx.fillRect(px, py, p.size, p.size)
  }

  ctx.globalAlpha = 1
  if (particles.length > 0) {
    rafId = window.requestAnimationFrame(tick)
  } else {
    rafId = null
    lastTs = 0
    ctx.clearRect(0, 0, w, h)
  }
}

export function triggerPixelBurstAt(x: number, y: number, tone: SparkTone = 'accent', count = 8) {
  if (typeof window === 'undefined' || reducedMotion()) return
  const canvas = ensureCanvas()
  if (!canvas) return
  const colors = paletteFor(tone)

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45
    const speed = 1.05 + Math.random() * 1.45
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.45,
      size: i % 3 === 0 ? 2 : 3,
      color: colors[i % colors.length],
      life: 0,
      maxLife: 380 + Math.random() * 140,
    })
  }

  if (rafId === null) {
    lastTs = 0
    rafId = window.requestAnimationFrame(tick)
  }
}

export function triggerPixelBurstFromEvent(event?: Event | null, tone: SparkTone = 'accent', count = 8) {
  if (typeof window === 'undefined' || !event || reducedMotion()) return
  const target = (event.currentTarget ?? event.target) as HTMLElement | null
  if (target && typeof target.getBoundingClientRect === 'function') {
    const rect = target.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      triggerPixelBurstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, tone, count)
      return
    }
  }
  if ('clientX' in event && typeof (event as MouseEvent).clientX === 'number') {
    const me = event as MouseEvent
    if (me.clientX || me.clientY) triggerPixelBurstAt(me.clientX, me.clientY, tone, count)
  }
}
