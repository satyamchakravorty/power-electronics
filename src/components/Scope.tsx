import { useEffect, useRef } from 'react'
import type { Channel, ChannelId } from '../engine/channels'
import { useTheme } from '../state/useTheme'
import { fonts, theme } from '../theme'
import { formatValue, niceCeil, prepareCanvas, useCanvasSize } from './useCanvas'

export type ScopeMode = 'superimposed' | 'stacked'

interface ScopeProps {
  channels: Channel[]
  visible: ChannelId[]
  mode: ScopeMode
  /** Sample index the playhead sits on. */
  playhead: number
  /** Mean output voltage, drawn as a reference line when enabled. */
  vdc: number
  showAverage: boolean
  showGrid: boolean
  onScrub?: (index: number) => void
}

const PAD = { left: 58, right: 58, top: 26, bottom: 28 }
const LANE_GAP = 12

export function Scope(props: ScopeProps) {
  const { ref, size, dpr, fontsReady } = useCanvasSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mode = useTheme((s) => s.mode)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0) return
    const ctx = prepareCanvas(canvas, size, dpr)
    if (ctx) draw(ctx, size.width, size.height, props)
  }, [size, dpr, props, fontsReady, mode])

  const shown = props.channels.filter((c) => props.visible.includes(c.id))
  const sampleCount = shown[0]?.data.length ?? 0

  function scrubTo(event: React.PointerEvent<HTMLDivElement>) {
    if (!props.onScrub || sampleCount === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const plotWidth = rect.width - PAD.left - PAD.right
    const fraction = (event.clientX - rect.left - PAD.left) / plotWidth
    const index = Math.round(fraction * (sampleCount - 1))
    props.onScrub(Math.min(sampleCount - 1, Math.max(0, index)))
  }

  return (
    <div
      ref={ref}
      className="scope"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        scrubTo(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) scrubTo(e)
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

interface Lane {
  top: number
  height: number
  /** Value mapped to the top edge of the lane. */
  max: number
  min: number
  channels: Channel[]
  unit: string
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  props: ScopeProps,
): void {
  const shown = props.channels.filter((c) => props.visible.includes(c.id))
  const plotLeft = PAD.left
  const plotRight = width - PAD.right
  const plotWidth = plotRight - plotLeft
  const plotTop = PAD.top
  const plotHeight = height - PAD.top - PAD.bottom

  ctx.fillStyle = theme.screen
  ctx.fillRect(0, 0, width, height)

  if (shown.length === 0 || plotWidth <= 0 || plotHeight <= 0) {
    ctx.fillStyle = theme.muted
    ctx.font = `13px ${fonts.sans}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Pick a channel above to put it on screen', width / 2, height / 2)
    return
  }

  const lanes = props.mode === 'stacked' ? stackedLanes(shown, plotTop, plotHeight) : superimposedLanes(shown, plotTop, plotHeight)

  drawTimeGrid(ctx, plotLeft, plotRight, plotTop, plotHeight, props.showGrid)

  for (const lane of lanes) drawLane(ctx, lane, plotLeft, plotRight, props)

  drawPlayhead(ctx, shown, lanes, plotLeft, plotWidth, plotTop, plotHeight, props.playhead)
}

function spanOf(channels: Channel[]): { min: number; max: number } {
  let peak = 0
  for (const channel of channels) {
    for (let k = 0; k < channel.data.length; k++) {
      const value = Math.abs(channel.data[k])
      if (value > peak) peak = value
    }
  }
  const limit = niceCeil(peak * 1.08) || 1
  return { min: -limit, max: limit }
}

function superimposedLanes(channels: Channel[], top: number, height: number): Lane[] {
  // Voltages and currents share the plot area but keep independent scales, so
  // a 10 A current stays visible next to a 325 V waveform.
  const groups: Lane[] = []
  for (const kind of ['voltage', 'current'] as const) {
    const members = channels.filter((c) => c.kind === kind)
    if (members.length === 0) continue
    groups.push({ top, height, ...spanOf(members), channels: members, unit: kind === 'voltage' ? 'V' : 'A' })
  }
  return groups
}

function stackedLanes(channels: Channel[], top: number, height: number): Lane[] {
  const laneHeight = (height - LANE_GAP * (channels.length - 1)) / channels.length
  return channels.map((channel, index) => ({
    top: top + index * (laneHeight + LANE_GAP),
    height: laneHeight,
    ...spanOf([channel]),
    channels: [channel],
    unit: channel.unit,
  }))
}

function drawTimeGrid(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  height: number,
  showGrid: boolean,
): void {
  ctx.font = `10.5px ${fonts.mono}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let deg = 0; deg <= 360; deg += 30) {
    const x = Math.round(left + ((right - left) * deg) / 360) + 0.5
    const major = deg % 90 === 0
    if (showGrid || major) {
      ctx.save()
      ctx.strokeStyle = major ? theme.gridStrong : theme.grid
      if (!major) ctx.setLineDash([2, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, top + height)
      ctx.stroke()
      ctx.restore()
    }
    if (deg % 60 === 0) {
      ctx.fillStyle = theme.muted
      ctx.fillText(`${deg}°`, x, top + height + 9)
    }
  }
  ctx.strokeStyle = theme.gridStrong
  ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, height - 1)
}

function drawLane(
  ctx: CanvasRenderingContext2D,
  lane: Lane,
  left: number,
  right: number,
  props: ScopeProps,
): void {
  const toY = (value: number) =>
    lane.top + lane.height * (1 - (value - lane.min) / (lane.max - lane.min))
  const zeroY = toY(0)

  if (props.mode === 'stacked') {
    ctx.strokeStyle = theme.gridStrong
    ctx.strokeRect(left + 0.5, Math.round(lane.top) + 0.5, right - left - 1, Math.round(lane.height))
  }

  if (props.showGrid) {
    ctx.save()
    ctx.strokeStyle = theme.grid
    ctx.setLineDash([2, 4])
    ctx.lineWidth = 1
    for (let step = 1; step < 4; step++) {
      if (step === 2) continue
      const y = Math.round(lane.top + (lane.height * step) / 4) + 0.5
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.strokeStyle = theme.gridStrong
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(left, Math.round(zeroY) + 0.5)
  ctx.lineTo(right, Math.round(zeroY) + 0.5)
  ctx.stroke()

  // Axis labels: the current scale sits on the right so it never collides
  // with the voltage scale when both are superimposed.
  const onRight = props.mode === 'superimposed' && lane.unit === 'A'
  ctx.font = `10.5px ${fonts.mono}`
  ctx.fillStyle = onRight ? lane.channels[0].color : theme.muted
  ctx.globalAlpha = onRight ? 0.8 : 1
  ctx.textAlign = onRight ? 'left' : 'right'
  ctx.textBaseline = 'middle'
  const labelX = onRight ? right + 8 : left - 9
  for (const value of [lane.max, 0, lane.min]) {
    ctx.fillText(`${value === 0 ? '0' : formatValue(value)} ${lane.unit}`, labelX, toY(value))
  }
  ctx.globalAlpha = 1

  const xAt = (k: number, n: number) => left + ((right - left) * k) / (n - 1)

  // Shade the output voltage down to zero: the shaded area is the volt-seconds
  // that set V_dc, which makes the effect of a firing angle visible at a glance.
  const output = lane.channels.find((c) => c.id === 'vo')
  if (output) {
    const n = output.data.length
    const gradient = ctx.createLinearGradient(0, lane.top, 0, lane.top + lane.height)
    gradient.addColorStop(0, hexAlpha(output.color, 0.2))
    gradient.addColorStop(0.5, hexAlpha(output.color, 0.04))
    gradient.addColorStop(1, hexAlpha(output.color, 0.2))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(left, zeroY)
    for (let k = 0; k < n; k++) ctx.lineTo(xAt(k, n), toY(output.data[k]))
    ctx.lineTo(right, zeroY)
    ctx.closePath()
    ctx.fill()
  }

  if (props.showAverage && output) {
    const y = toY(props.vdc)
    ctx.save()
    ctx.strokeStyle = theme.warn
    ctx.setLineDash([6, 5])
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    ctx.restore()
    tag(ctx, `V_dc ${formatValue(props.vdc, 'V')}`, right - 8, y, theme.warn, 'right')
  }

  for (const channel of lane.channels) {
    const n = channel.data.length
    const trace = new Path2D()
    for (let k = 0; k < n; k++) {
      const x = xAt(k, n)
      const y = toY(channel.data[k])
      if (k === 0) trace.moveTo(x, y)
      else trace.lineTo(x, y)
    }
    const primary = channel.id === 'vo' || channel.id === 'io'
    ctx.lineJoin = 'round'
    // A wide faint pass under the crisp one reads as phosphor glow, at a
    // fraction of what shadowBlur costs on every playback frame.
    ctx.strokeStyle = hexAlpha(channel.color, 0.16)
    ctx.lineWidth = primary ? 7 : 5
    ctx.stroke(trace)
    ctx.strokeStyle = channel.color
    ctx.lineWidth = primary ? 2 : 1.4
    ctx.stroke(trace)
  }

  if (props.mode === 'stacked') {
    ctx.fillStyle = lane.channels[0].color
    ctx.font = `600 11px ${fonts.sans}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(lane.channels[0].label, left + 8, lane.top + 6)
  }
}

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  channels: Channel[],
  lanes: Lane[],
  left: number,
  plotWidth: number,
  top: number,
  height: number,
  playhead: number,
): void {
  const n = channels[0].data.length
  const index = Math.min(n - 1, Math.max(0, playhead))
  const x = Math.round(left + (plotWidth * index) / (n - 1)) + 0.5

  ctx.strokeStyle = hexAlpha(theme.accent, 0.7)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.lineTo(x, top + height)
  ctx.stroke()

  const angle = (index / n) * 360
  tag(ctx, `${angle.toFixed(0)}°`, x, top - 12, theme.accent, 'center')

  for (const lane of lanes) {
    for (const channel of lane.channels) {
      const y =
        lane.top + lane.height * (1 - (channel.data[index] - lane.min) / (lane.max - lane.min))
      ctx.fillStyle = hexAlpha(channel.color, 0.25)
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = channel.color
      ctx.beginPath()
      ctx.arc(x, y, 3.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = theme.screen
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}

/** A small filled pill with a label, used for the cursor angle and the V_dc line. */
function tag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: 'right' | 'center',
): void {
  ctx.font = `600 10.5px ${fonts.mono}`
  const width = ctx.measureText(text).width + 12
  const height = 17
  const boxLeft = align === 'center' ? x - width / 2 : x - width
  ctx.fillStyle = hexAlpha(color, 0.16)
  ctx.strokeStyle = hexAlpha(color, 0.55)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(boxLeft, y - height / 2, width, height, 5)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, boxLeft + width / 2, y + 0.5)
}

function hexAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}
