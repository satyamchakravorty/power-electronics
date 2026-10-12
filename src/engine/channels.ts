import { channelColors, type ChannelPalette } from '../theme'
import type { Trace } from './types'

export type ChannelId = 'vs' | 'vsB' | 'vsC' | 'vo' | 'io' | 'is' | 'vDevice'

export interface Channel {
  id: ChannelId
  label: string
  /** Longer description used in tooltips. */
  title: string
  unit: 'V' | 'A'
  color: string
  data: Float64Array
  /** Channels sharing a kind share a vertical scale when superimposed. */
  kind: 'voltage' | 'current'
}

/**
 * Plottable channels for a trace. Three-phase topologies expose all three
 * supply voltages so the commutation hand-over is visible.
 */
export function channelsFor(trace: Trace, colors: ChannelPalette = channelColors): Channel[] {
  const { topology, vSource } = trace
  const threePhase = topology.phases === 3
  const sourceLabel = threePhase ? 'v_a' : 'v_s'

  const list: Channel[] = [
    {
      id: 'vs',
      label: sourceLabel,
      title: threePhase ? 'Supply voltage, phase A' : 'Supply voltage',
      unit: 'V',
      color: colors.vsA,
      data: vSource[0],
      kind: 'voltage',
    },
  ]

  if (threePhase) {
    list.push(
      {
        id: 'vsB',
        label: 'v_b',
        title: 'Supply voltage, phase B',
        unit: 'V',
        color: colors.vsB,
        data: vSource[1],
        kind: 'voltage',
      },
      {
        id: 'vsC',
        label: 'v_c',
        title: 'Supply voltage, phase C',
        unit: 'V',
        color: colors.vsC,
        data: vSource[2],
        kind: 'voltage',
      },
    )
  }

  list.push(
    {
      id: 'vo',
      label: 'v_o',
      title: 'Output (load) voltage',
      unit: 'V',
      color: colors.vo,
      data: trace.vo,
      kind: 'voltage',
    },
    {
      id: 'io',
      label: 'i_o',
      title: 'Load current',
      unit: 'A',
      color: colors.io,
      data: trace.io,
      kind: 'current',
    },
    {
      id: 'is',
      label: 'i_s',
      title: threePhase ? 'Supply current, phase A' : 'Supply current',
      unit: 'A',
      color: colors.is,
      data: trace.isSource,
      kind: 'current',
    },
    {
      id: 'vDevice',
      label: `v_${topology.devices[0].id}`,
      title: `Voltage across ${topology.devices[0].id}, negative while blocking`,
      unit: 'V',
      color: colors.vDevice,
      data: trace.vDevice,
      kind: 'voltage',
    },
  )

  return list
}

export const DEFAULT_VISIBLE: ChannelId[] = ['vs', 'vo', 'io']
