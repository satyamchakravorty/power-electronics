import { useEffect, useRef, useState } from 'react'

export interface CanvasSize {
  width: number
  height: number
}

/**
 * Keeps a canvas backing store matched to its CSS box and the device pixel
 * ratio, and reports the CSS-pixel size so draw code can work in logical units.
 */
export function useCanvasSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 })
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect
      setSize({ width: Math.round(box.width), height: Math.round(box.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Moving the window to a screen of a different density resizes the backing
  // store without changing the CSS box, which would otherwise blank the canvas
  // until something else happened to trigger a redraw.
  useEffect(() => {
    let media: MediaQueryList | null = null
    let cancelled = false
    const watch = () => {
      if (cancelled) return
      const current = window.devicePixelRatio || 1
      setDpr(current)
      media = window.matchMedia(`(resolution: ${current}dppx)`)
      media.addEventListener('change', watch, { once: true })
    }
    watch()
    return () => {
      cancelled = true
      media?.removeEventListener('change', watch)
    }
  }, [])

  // Canvas text is rasterised with whatever font is loaded at draw time, so
  // redraw once the web fonts arrive rather than keep the fallback forever.
  const [fontsReady, setFontsReady] = useState(() => document.fonts?.status === 'loaded')
  useEffect(() => {
    if (fontsReady || !document.fonts) return
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [fontsReady])

  return { ref, size, dpr, fontsReady }
}

export function prepareCanvas(
  canvas: HTMLCanvasElement,
  size: CanvasSize,
  dpr = window.devicePixelRatio || 1,
): CanvasRenderingContext2D | null {
  const width = Math.max(1, Math.round(size.width * dpr))
  const height = Math.max(1, Math.round(size.height * dpr))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size.width, size.height)
  return ctx
}

/** Rounds up to the next 1, 2, 2.5 or 5 times a power of ten. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return step * base
}

/** Formats a value with a sensible number of significant digits for a readout. */
export function formatValue(value: number, unit = ''): string {
  const magnitude = Math.abs(value)
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : magnitude >= 1 ? 2 : 3
  const text = value.toFixed(digits)
  // Avoid rendering a negative zero, which looks like a bug to a reader.
  const cleaned = Number(text) === 0 ? (0).toFixed(digits) : text
  return unit ? `${cleaned} ${unit}` : cleaned
}
