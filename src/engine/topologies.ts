import type { DeviceSpec, Topology, TopologyId } from './types'

const DEG = Math.PI / 180

/**
 * Source node voltages for a topology, in volts, at electrical angle theta.
 * Index 0 is always the reference phase. A node held at zero is the supply
 * neutral, which the solver uses as the negative rail when a topology has no
 * switched lower group.
 */
export function sourceVoltages(topology: Topology, theta: number, Vm: number): number[] {
  const out = new Array<number>(topology.sourceNodes)
  writeSourceVoltages(topology, theta, Vm, out)
  return out
}

/** In-place variant, since the solver evaluates this on every integration step. */
export function writeSourceVoltages(
  topology: Topology,
  theta: number,
  Vm: number,
  out: number[],
): void {
  const v = Vm * Math.sin(theta)
  switch (topology.id) {
    case '1ph-half-wave':
    case '1ph-bridge':
      out[0] = v
      out[1] = 0
      break
    case '3ph-half-wave':
    case '3ph-bridge':
      out[0] = v
      out[1] = Vm * Math.sin(theta - (2 * Math.PI) / 3)
      out[2] = Vm * Math.sin(theta + (2 * Math.PI) / 3)
      out[3] = 0
      break
  }
}

function dev(
  id: string,
  group: 'upper' | 'lower',
  phase: number,
  naturalFireAngle: number,
  srcSign: number,
  controllable = true,
): DeviceSpec & { srcSign: number } {
  return { id, group, phase, controllable, naturalFireAngle, srcSign }
}

/**
 * Natural firing angles are the instants an equivalent diode would take over
 * conduction, so a thyristor's gate pulse simply sits at naturalFireAngle + alpha.
 * Upper-group devices take over when their phase becomes the most positive,
 * lower-group devices when their phase becomes the most negative.
 */
export const TOPOLOGIES: Record<TopologyId, Topology> = {
  '1ph-half-wave': {
    id: '1ph-half-wave',
    name: 'Single-Phase Half-Wave',
    shortName: '1Φ Half-Wave',
    phases: 1,
    pulses: 1,
    sourceNodes: 2,
    returnNode: 1,
    commonReturn: true,
    supportsFWD: true,
    supportsSemi: false,
    gateWindow: Math.PI,
    gateEnd: 'interval',
    devices: [dev('T1', 'upper', 0, 0, +1)],
  },

  '1ph-bridge': {
    id: '1ph-bridge',
    name: 'Single-Phase Full Bridge',
    shortName: '1Φ Full Bridge',
    phases: 1,
    pulses: 2,
    sourceNodes: 2,
    returnNode: null,
    commonReturn: false,
    supportsFWD: true,
    supportsSemi: true,
    gateWindow: Math.PI,
    gateEnd: 'interval',
    devices: [
      dev('T1', 'upper', 0, 0, +1),
      dev('T2', 'lower', 1, 0, 0),
      dev('T3', 'upper', 1, Math.PI, 0),
      dev('T4', 'lower', 0, Math.PI, -1),
    ],
  },

  '3ph-half-wave': {
    id: '3ph-half-wave',
    name: 'Three-Phase Half-Wave (3-Pulse)',
    shortName: '3Φ Half-Wave',
    phases: 3,
    pulses: 3,
    sourceNodes: 4,
    returnNode: 3,
    commonReturn: true,
    supportsFWD: true,
    supportsSemi: false,
    gateWindow: (2 * Math.PI) / 3,
    gateEnd: 'delayed',
    devices: [
      dev('T1', 'upper', 0, 30 * DEG, +1),
      dev('T2', 'upper', 1, 150 * DEG, 0),
      dev('T3', 'upper', 2, 270 * DEG, 0),
    ],
  },

  '3ph-bridge': {
    id: '3ph-bridge',
    name: 'Three-Phase Full Bridge (6-Pulse)',
    shortName: '3Φ Full Bridge',
    phases: 3,
    pulses: 6,
    sourceNodes: 4,
    returnNode: null,
    commonReturn: false,
    supportsFWD: true,
    supportsSemi: true,
    gateWindow: (2 * Math.PI) / 3,
    gateEnd: 'delayed',
    // Conventional firing order T1..T6 at 60 degree intervals.
    devices: [
      dev('T1', 'upper', 0, 30 * DEG, +1),
      dev('T2', 'lower', 2, 90 * DEG, 0),
      dev('T3', 'upper', 1, 150 * DEG, 0),
      dev('T4', 'lower', 0, 210 * DEG, -1),
      dev('T5', 'upper', 2, 270 * DEG, 0),
      dev('T6', 'lower', 1, 330 * DEG, 0),
    ],
  },
}

export const TOPOLOGY_ORDER: TopologyId[] = [
  '1ph-half-wave',
  '1ph-bridge',
  '3ph-half-wave',
  '3ph-bridge',
]

/** True when the device acts as a gate-controlled thyristor under this mode. */
export function isThyristor(device: DeviceSpec, mode: 'diode' | 'thyristor' | 'semi'): boolean {
  if (!device.controllable) return false
  if (mode === 'diode') return false
  if (mode === 'thyristor') return true
  // Half-controlled bridge: thyristors in the upper group, diodes below.
  return device.group === 'upper'
}

/** Display label, e.g. T1 while gate-controlled and D1 while acting as a diode. */
export function deviceLabel(device: DeviceSpec, mode: 'diode' | 'thyristor' | 'semi'): string {
  return (isThyristor(device, mode) ? 'T' : 'D') + device.id.slice(1)
}
