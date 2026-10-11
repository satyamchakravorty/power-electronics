import { FWD_ID, isGated } from '../../engine/solver'
import type { SimConfig, Trace } from '../../engine/types'

export type DeviceState = 'on' | 'gated' | 'off'

export interface SchematicProps {
  trace: Trace
  config: SimConfig
  /** Sample index the figure is showing. */
  index: number
  /** Toggles a single device between diode and thyristor. */
  onToggleDevice?: (deviceId: string) => void
}

export interface Figure {
  states: Map<string, DeviceState>
  current: number
  vo: number
  freewheeling: boolean
  /** Device ids conducting right now, split by group. */
  upper: string | null
  lower: string | null
}

/** Everything a schematic needs about the instant it is drawing. */
export function readFigure({ trace, config, index }: SchematicProps): Figure {
  const snapshot = trace.states[index]
  const theta = trace.theta[index]
  const states = new Map<string, DeviceState>()
  let upper: string | null = null
  let lower: string | null = null

  for (const device of trace.topology.devices) {
    const on = snapshot.on.includes(device.id)
    if (on) {
      if (device.group === 'upper') upper = device.id
      else lower = device.id
    }
    states.set(
      device.id,
      on ? 'on' : isGated(trace.topology, config, device, theta) ? 'gated' : 'off',
    )
  }
  states.set(FWD_ID, snapshot.freewheeling ? 'on' : 'off')

  return {
    states,
    current: trace.io[index],
    vo: trace.vo[index],
    freewheeling: snapshot.freewheeling,
    upper,
    lower,
  }
}

/**
 * Names the conduction state the way the generated figures key their current
 * paths: "fw" while freewheeling, the conducting device in a common-return
 * converter, or "upper|lower" in a bridge. Null while nothing conducts.
 */
export function flowKey(trace: Trace, figure: Figure): string | null {
  if (figure.freewheeling) return 'fw'
  if (trace.topology.commonReturn) return figure.upper
  return figure.upper && figure.lower ? `${figure.upper}|${figure.lower}` : null
}

/**
 * Formats a live reading for the drawing. Readings sit still on screen, so a
 * value that rounds to nothing shows as a plain 0 rather than "0.000".
 */
export function reading(value: number, unit: string): string {
  const magnitude = Math.abs(value)
  if (magnitude < 0.005) return `0 ${unit}`
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2
  return `${value < 0 ? '\u2212' : ''}${magnitude.toFixed(digits)} ${unit}`
}

/** A set value such as R or E, shortened to at most two decimals with a true minus sign. */
export function trim(value: number): string {
  return String(Number(value.toFixed(2))).replace('-', '\u2212')
}
