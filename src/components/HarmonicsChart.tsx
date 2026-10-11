import { useEffect, useRef } from 'react'
import type { Spectrum } from '../engine/fft'
import { useTheme } from '../state/useTheme'
import { channelColors, fonts, theme } from '../theme'
import { prepareCanvas, useCanvasSize } from './useCanvas'

interface HarmonicsChartProps {
  spectrum: Spectrum
  /** Highest harmonic order to display. */
  maxOrder?: number
}

const PAD = { left: 46, right: 12, top: 18, bottom: 28 }

export function HarmonicsChart({ spectrum, maxOrder = 21 }: HarmonicsChartProps) {
  const { ref, size, dpr, fontsReady } = useCanvasSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mode = useTheme((s) => s.mode)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0) return
    const ctx = prepareCanvas(canvas, size, dpr)
    if (!ctx) return

    const width = size.width
    const height = size.height

    const plotLeft = PAD.left
    const plotRight = width - PAD.right
    const plotTop = PAD.top
    const plotHeight = height - PAD.top - PAD.bottom
    if (plotHeight <= 0 || plotRight <= plotLeft) return

    const bars = spectrum.harmonics.slice(0, maxOrder)
    const fundamental = bars[0]?.amplitude ?? 0
    if (fundamental < 1e-9) {
      ctx.fillStyle = theme.muted
      ctx.font = `13px ${fonts.sans}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No supply current to analyse', width / 2, height / 2)
      return
    }

    // Everything is referred to the fundamental, which is how harmonic limits
    // such as IEEE 519 are written.
    ctx.font = `10.5px ${fonts.mono}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const percent of [0, 25, 50, 75, 100]) {
      const y = Math.round(plotTop + plotHeight * (1 - percent / 100)) + 0.5
      ctx.save()
      ctx.strokeStyle = percent === 0 ? theme.gridStrong : theme.grid
      if (percent !== 0) ctx.setLineDash([2, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(plotLeft, y)
      ctx.lineTo(plotRight, y)
      ctx.stroke()
      ctx.restore()
      ctx.fillStyle = theme.muted
      ctx.fillText(`${percent}%`, plotLeft - 8, y)
    }

    const slot = (plotRight - plotLeft) / bars.length
    const barWidth = Math.max(3, Math.min(20, slot * 0.62))
    for (const [index, harmonic] of bars.entries()) {
      const ratio = harmonic.amplitude / fundamental
      const x = plotLeft + slot * (index + 0.5)
      const barHeight = Math.max(0, plotHeight * Math.min(1, ratio))
      const colour = index === 0 ? channelColors.is : theme.accent
      if (barHeight > 0.5) {
        const top = plotTop + plotHeight - barHeight
        const gradient = ctx.createLinearGradient(0, top, 0, plotTop + plotHeight)
        gradient.addColorStop(0, colour)
        gradient.addColorStop(1, `${colour}33`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x - barWidth / 2, top, barWidth, barHeight, [3, 3, 0, 0])
        ctx.fill()
      }

      // Label odd orders only, otherwise the axis becomes unreadable.
      ctx.font = `10.5px ${fonts.mono}`
      ctx.textAlign = 'center'
      if (harmonic.order % 2 === 1) {
        ctx.fillStyle = theme.muted
        ctx.textBaseline = 'top'
        ctx.fillText(String(harmonic.order), x, plotTop + plotHeight + 8)
      }
      if (ratio > 0.08) {
        ctx.fillStyle = theme.text
        ctx.textBaseline = 'bottom'
        ctx.fillText(`${(ratio * 100).toFixed(0)}`, x, plotTop + plotHeight - barHeight - 3)
      }
    }
  }, [size, dpr, spectrum, maxOrder, fontsReady, mode])

  return (
    <div ref={ref} className="harmonics">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
