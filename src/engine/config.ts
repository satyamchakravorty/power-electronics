import { TOPOLOGIES } from './topologies'
import type { SimConfig } from './types'

export const DEFAULT_CONFIG: SimConfig = {
  topology: '1ph-bridge',
  deviceMode: 'thyristor',
  alphaDeg: 45,
  fwd: false,
  load: 'RL',
  R: 20,
  L: 100,
  E: 0,
  Vrms: 230,
  f: 50,
}

/**
 * Keeps a configuration self-consistent after a change, since not every
 * topology supports every device arrangement.
 */
export function normalizeConfig(config: SimConfig): SimConfig {
  const topology = TOPOLOGIES[config.topology]
  const next = { ...config }
  if (next.deviceMode === 'semi' && !topology.supportsSemi) next.deviceMode = 'thyristor'
  if (!topology.supportsFWD) next.fwd = false
  // E is kept when the load type changes so switching back restores it; the
  // solver and metrics only apply it to an R-L-E load.
  next.f = clamp(next.f, 1, 400)
  next.R = clamp(next.R, 0.1, 1000)
  next.L = clamp(next.L, 0, 2000)
  next.Vrms = clamp(next.Vrms, 1, 1000)
  next.alphaDeg = clamp(next.alphaDeg, 0, 180)
  next.E = clamp(next.E, -1000, 1000)
  return next
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo
  return Math.min(hi, Math.max(lo, x))
}

export const LOAD_LABELS: Record<SimConfig['load'], string> = {
  R: 'R (resistive)',
  RL: 'R-L (inductive)',
  RLE: 'R-L-E (motor)',
}

export const DEVICE_MODE_LABELS: Record<SimConfig['deviceMode'], string> = {
  diode: 'All diodes',
  thyristor: 'All thyristors',
  semi: 'Semi-converter',
}
